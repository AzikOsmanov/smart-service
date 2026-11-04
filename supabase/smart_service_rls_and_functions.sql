-- =====================================================================
-- Smart Service System - Supabase security layer (v3)
-- Run AFTER smart_service_schema.sql
--
-- HARD RULE: every menu and submenu has the permissions view, edit, delete
-- (code = <menu key>.<level>). Everything below checks those codes.
--   view   = read
--   edit   = create and change
--   delete = soft delete (sets deleted_at); restoring needs admin.trash.edit
-- Delete implies edit, and edit implies view (checked in has_permission), so a role
-- that may delete can also edit and view. data_scope 'own' limits a permission to the
-- user's own or assigned records (for example an engineer's tickets).
--
-- Notes
--  * Every policy is limited to the user's own tenant (current_tenant_id()).
--    A suspended tenant gets no access at all.
--  * Admin screens (create staff, edit roles, settings) run in server code with the
--    Supabase service role, which bypasses RLS. That code MUST check the caller's
--    permission, take the tenant from the caller's login, and write audit_logs.
--  * Platform-owner actions (creating or suspending tenants) are server-only too.
--  * serial_number_registry has no client policies on purpose.
--  * Storage buckets: prefix every file path with the tenant_id and add storage
--    policies on that prefix (done when storage is set up).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. HELPER FUNCTIONS
-- ---------------------------------------------------------------------
-- Tenant of the logged-in user (NULL if the user or the tenant is inactive)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT u.tenant_id
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id AND t.status = 'active' AND t.deleted_at IS NULL
    WHERE u.id = auth.uid() AND u.is_active AND u.deleted_at IS NULL;
$$;

-- True only for the tenant's Administrator role. Used for menus that must NOT be
-- delegable (login security, login history, integrations).
CREATE OR REPLACE FUNCTION is_tenant_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT current_tenant_id() IS NOT NULL
       AND EXISTS (SELECT 1
                   FROM user_roles ur
                   JOIN roles r ON r.id = ur.role_id AND r.is_admin AND r.deleted_at IS NULL
                   WHERE ur.user_id = auth.uid());
$$;

-- The Administrator role passes every check, now and for menus added in the future.
-- Every other role is checked against role_permissions. A '.view' check is also
-- satisfied by '.edit' or '.delete' on the same menu, and an '.edit' check by '.delete'.
CREATE OR REPLACE FUNCTION has_permission(p_code TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_tenant_admin()
        OR (current_tenant_id() IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM user_roles ur
                JOIN roles r             ON r.id = ur.role_id AND r.deleted_at IS NULL
                JOIN role_permissions rp ON rp.role_id = r.id
                JOIN permissions pe      ON pe.id = rp.permission_id
                WHERE ur.user_id = auth.uid()
                  AND (pe.code = p_code
                       OR (pe.resource = left(p_code, length(p_code) - 5)
                       AND ((p_code LIKE '%.view' AND pe.action IN ('edit', 'delete'))
                            OR (p_code LIKE '%.edit' AND pe.action = 'delete'))))
            ));
$$;

-- 'all', 'own' or NULL (no permission). Administrator is always 'all'.
CREATE OR REPLACE FUNCTION permission_scope(p_code TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE
        WHEN is_tenant_admin() THEN 'all'
        WHEN current_tenant_id() IS NULL THEN NULL
        ELSE (
            SELECT CASE WHEN bool_or(rp.data_scope = 'all') THEN 'all'
                        WHEN count(*) > 0 THEN 'own' END
            FROM user_roles ur
            JOIN roles r             ON r.id = ur.role_id AND r.deleted_at IS NULL
            JOIN role_permissions rp ON rp.role_id = r.id
            JOIN permissions pe      ON pe.id = rp.permission_id
            WHERE ur.user_id = auth.uid()
              AND (pe.code = p_code
                   OR (pe.resource = left(p_code, length(p_code) - 5)
                       AND ((p_code LIKE '%.view' AND pe.action IN ('edit', 'delete'))
                            OR (p_code LIKE '%.edit' AND pe.action = 'delete'))))
        )
    END;
$$;

CREATE OR REPLACE FUNCTION is_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT current_tenant_id() IS NOT NULL
       AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND kind = 'staff');
$$;

CREATE OR REPLACE FUNCTION is_approved_customer() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT current_tenant_id() IS NOT NULL
       AND EXISTS (SELECT 1 FROM users
                   WHERE id = auth.uid() AND kind = 'customer' AND registration = 'approved');
$$;

CREATE OR REPLACE FUNCTION current_company_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT company_id FROM users WHERE id = auth.uid();
$$;

-- The ticket history trigger writes rows the user cannot insert directly
-- (track_device_owner() in the schema file is already SECURITY DEFINER)
ALTER FUNCTION log_ticket_status() SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------
-- 2. DELETE AND RESTORE NEED THEIR OWN PERMISSION
-- Deleting is a soft delete (deleted_at). The matching <menu>.delete permission is
-- required to set it, and admin.trash.edit is required to restore. Server code running
-- with the service role has no auth.uid() and checks permissions itself.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION require_delete_permission() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        IF NOT has_permission(TG_ARGV[0]) THEN
            RAISE EXCEPTION 'delete_not_allowed' USING ERRCODE = '42501';
        END IF;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        IF NOT has_permission('admin.trash.edit') THEN
            RAISE EXCEPTION 'restore_not_allowed' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_softdel_devices        BEFORE UPDATE ON devices            FOR EACH ROW EXECUTE FUNCTION require_delete_permission('devices.delete');
CREATE TRIGGER trg_softdel_device_models  BEFORE UPDATE ON device_models      FOR EACH ROW EXECUTE FUNCTION require_delete_permission('devices.models.delete');
CREATE TRIGGER trg_softdel_tickets        BEFORE UPDATE ON tickets            FOR EACH ROW EXECUTE FUNCTION require_delete_permission('tickets.delete');
CREATE TRIGGER trg_softdel_ticket_msgs    BEFORE UPDATE ON ticket_messages    FOR EACH ROW EXECUTE FUNCTION require_delete_permission('tickets.delete');
CREATE TRIGGER trg_softdel_content_items  BEFORE UPDATE ON content_items      FOR EACH ROW EXECUTE FUNCTION require_delete_permission('content.library.delete');
CREATE TRIGGER trg_softdel_content_cats   BEFORE UPDATE ON content_categories FOR EACH ROW EXECUTE FUNCTION require_delete_permission('content.categories.delete');
CREATE TRIGGER trg_softdel_companies      BEFORE UPDATE ON companies          FOR EACH ROW EXECUTE FUNCTION require_delete_permission('customers.companies.delete');
CREATE TRIGGER trg_softdel_users          BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION require_delete_permission('admin.users.delete');
CREATE TRIGGER trg_softdel_roles          BEFORE UPDATE ON roles              FOR EACH ROW EXECUTE FUNCTION require_delete_permission('admin.roles.delete');

-- ---------------------------------------------------------------------
-- 3. SIGNUP TRIGGER (customer registration on mobile and web)
-- The app calls supabase.auth.signUp() with this metadata:
--   tenant_slug, account_type, first_name, last_name, phone, company_name, city,
--   country (optional), tax_id (optional), language (optional)
-- The account starts as 'pending' and cannot use devices or tickets until
-- the administrator or a service manager approves it.
-- Missing company_name / city or an unknown tenant makes the signup fail.
-- Staff accounts are created by admin server code, not by this trigger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    meta     JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    v_tenant UUID;
    cid      UUID;
    ctype    customer_type;
BEGIN
    IF meta->>'account_type' IS NULL THEN
        RETURN NEW;   -- not a customer signup (e.g. staff created by admin)
    END IF;

    SELECT id INTO v_tenant FROM tenants
     WHERE slug = meta->>'tenant_slug' AND status = 'active' AND deleted_at IS NULL;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'unknown_tenant';
    END IF;

    ctype := (meta->>'account_type')::customer_type;

    INSERT INTO companies (tenant_id, name, type, city, country, tax_id)
    VALUES (v_tenant, meta->>'company_name', ctype, meta->>'city',
            meta->>'country', meta->>'tax_id')
    RETURNING id INTO cid;

    INSERT INTO users (id, tenant_id, kind, email, phone, first_name, last_name,
                       company_id, customer_type, language)
    VALUES (NEW.id, v_tenant, 'customer', NEW.email, meta->>'phone',
            meta->>'first_name', meta->>'last_name', cid, ctype,
            COALESCE((meta->>'language')::language_code, 'en'));

    INSERT INTO user_roles (user_id, role_id)
    SELECT NEW.id, id FROM roles WHERE tenant_id = v_tenant AND code = 'customer';

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------
-- 4. ADMINISTRATOR AND PERMISSION PROTECTION
-- ---------------------------------------------------------------------
-- The admin role cannot be renamed, re-flagged, deleted or moved. Built-in roles
-- (admin, customer) cannot be deleted or renamed. Permissions of the admin role are
-- never read from the table, so nothing can reduce them.
CREATE OR REPLACE FUNCTION protect_roles() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_admin OR OLD.is_system THEN
            RAISE EXCEPTION 'role_protected' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.is_admin THEN
        IF NEW.code IS DISTINCT FROM OLD.code
           OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'role_protected' USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.is_admin AND NOT OLD.is_admin THEN
        RAISE EXCEPTION 'role_protected' USING ERRCODE = '42501';   -- cannot promote another role
    END IF;

    IF OLD.is_system AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'role_protected' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_roles BEFORE UPDATE OR DELETE ON roles
    FOR EACH ROW EXECUTE FUNCTION protect_roles();

-- Permissions of admin-only menus (login security, login history, integrations) can
-- never be granted to any role except the Administrator.
CREATE OR REPLACE FUNCTION guard_role_permission() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_admin_only BOOLEAN;
    v_is_admin   BOOLEAN;
BEGIN
    SELECT m.admin_only INTO v_admin_only
      FROM permissions p JOIN menus m ON m.key = p.resource
     WHERE p.id = NEW.permission_id;
    SELECT r.is_admin INTO v_is_admin FROM roles r WHERE r.id = NEW.role_id;
    IF COALESCE(v_admin_only, FALSE) AND NOT COALESCE(v_is_admin, FALSE) THEN
        RAISE EXCEPTION 'admin_only_permission' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_role_permission BEFORE INSERT OR UPDATE ON role_permissions
    FOR EACH ROW EXECUTE FUNCTION guard_role_permission();

-- A tenant must always keep at least one active administrator
CREATE OR REPLACE FUNCTION other_active_admin_exists(p_tenant UUID, p_excluding UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id AND r.is_admin AND r.tenant_id = p_tenant
        JOIN users u ON u.id = ur.user_id AND u.is_active AND u.deleted_at IS NULL
        WHERE ur.user_id <> p_excluding
    );
$$;

CREATE OR REPLACE FUNCTION protect_last_admin_role_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID;
BEGIN
    SELECT r.tenant_id INTO v_tenant FROM roles r WHERE r.id = OLD.role_id AND r.is_admin;
    IF v_tenant IS NOT NULL AND NOT other_active_admin_exists(v_tenant, OLD.user_id) THEN
        RAISE EXCEPTION 'last_admin' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
END;
$$;
CREATE TRIGGER trg_protect_last_admin_role BEFORE DELETE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION protect_last_admin_role_row();

CREATE OR REPLACE FUNCTION protect_last_admin_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF ((OLD.is_active AND NOT NEW.is_active)
        OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL))
       AND EXISTS (SELECT 1 FROM user_roles ur
                   JOIN roles r ON r.id = ur.role_id AND r.is_admin
                   WHERE ur.user_id = OLD.id)
       AND NOT other_active_admin_exists(OLD.tenant_id, OLD.id) THEN
        RAISE EXCEPTION 'last_admin' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_last_admin_user BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION protect_last_admin_user();

-- ---------------------------------------------------------------------
-- 5. REGISTRATION REVIEW (administrator or service manager)
-- Needs customers.registrations.edit. The administrator always has it and decides
-- whether managers get it. Works only on customers of the caller's own tenant.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION review_registration(p_user UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v  users%ROWTYPE;
    st registration_status;
BEGIN
    IF NOT has_permission('customers.registrations.edit') THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v FROM users
     WHERE id = p_user AND kind = 'customer'
       AND tenant_id = current_tenant_id() AND registration = 'pending'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'registration_not_pending' USING ERRCODE = 'P0002';
    END IF;

    st := (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END)::registration_status;

    UPDATE users
       SET registration = st,
           registration_reviewed_by = auth.uid(),
           registration_reviewed_at = now(),
           registration_note = p_note
     WHERE id = v.id;

    UPDATE companies SET status = st WHERE id = v.company_id;

    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (v.tenant_id, auth.uid(),
            CASE WHEN p_approve THEN 'registration.approve' ELSE 'registration.reject' END,
            'user', v.id::text,
            jsonb_build_object('registration', 'pending'),
            jsonb_build_object('registration', st, 'note', p_note));
    -- The server code sends the push / email notification after this call succeeds.
END;
$$;
REVOKE ALL ON FUNCTION review_registration(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION review_registration(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. ENABLE RLS ON EVERY TABLE
-- ---------------------------------------------------------------------
ALTER TABLE tenants                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_models                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_ownership_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_claims                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE serial_number_registry        ENABLE ROW LEVEL SECURITY;  -- no policies = server only
ALTER TABLE tickets                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_status_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_category_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_translations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_events                  ENABLE ROW LEVEL SECURITY;  -- administrator only
ALTER TABLE integrations                  ENABLE ROW LEVEL SECURITY;  -- administrator only
ALTER TABLE device_external_info          ENABLE ROW LEVEL SECURITY;  -- staff only
ALTER TABLE ticket_external_refs         ENABLE ROW LEVEL SECURITY;  -- staff only
ALTER TABLE integration_outbox           ENABLE ROW LEVEL SECURITY;  -- administrator only
ALTER TABLE ticket_service_state         ENABLE ROW LEVEL SECURITY;  -- staff only (customers see tickets.customer_device_status)

-- ---------------------------------------------------------------------
-- 7. POLICIES (all limited to the user's own tenant)
-- Deleting is a soft delete, so no table has a DELETE policy unless noted.
-- ---------------------------------------------------------------------

-- TENANTS and MENUS
CREATE POLICY tenants_select ON tenants FOR SELECT TO authenticated
    USING (id = current_tenant_id());
CREATE POLICY menus_select ON menus FOR SELECT TO authenticated
    USING (TRUE);                                        -- navigation catalogue, nothing sensitive

-- USERS
CREATE POLICY users_select ON users FOR SELECT TO authenticated
    USING (id = auth.uid()
           OR (tenant_id = current_tenant_id()
               AND (has_permission('admin.users.view')
                    OR (kind = 'customer'
                        AND (has_permission('customers.registrations.view')
                             OR has_permission('customers.companies.view'))))));
CREATE POLICY users_update_self ON users FOR UPDATE TO authenticated
    USING (id = auth.uid() AND has_permission('profile.edit'))
    WITH CHECK (id = auth.uid());
-- Column-level limit: users can never change kind, registration, is_active, tenant, company...
REVOKE UPDATE ON users FROM authenticated, anon;
GRANT  UPDATE (first_name, last_name, phone, language, theme) ON users TO authenticated;

-- COMPANIES
CREATE POLICY companies_select ON companies FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND (id = current_company_id()
                OR has_permission('customers.companies.view')
                OR has_permission('customers.registrations.view')));

-- ROLES / PERMISSIONS (edited by admin server code; read by the role editor)
CREATE POLICY user_roles_select ON user_roles FOR SELECT TO authenticated
    USING (user_id = auth.uid()
           OR ((has_permission('admin.roles.view') OR has_permission('admin.users.view'))
               AND EXISTS (SELECT 1 FROM users u WHERE u.id = user_id AND u.tenant_id = current_tenant_id())));
CREATE POLICY roles_select ON roles FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND (has_permission('admin.roles.view') OR has_permission('admin.users.view')));
CREATE POLICY permissions_select ON permissions FOR SELECT TO authenticated
    USING (has_permission('admin.roles.view'));
CREATE POLICY role_permissions_select ON role_permissions FOR SELECT TO authenticated
    USING (has_permission('admin.roles.view')
           AND EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.tenant_id = current_tenant_id()));

-- PUSH TOKENS: own only
CREATE POLICY push_tokens_own ON push_tokens FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- DEVICE MODELS: read by customers (my.devices) and staff (devices.models); write needs devices.models.edit
CREATE POLICY device_models_select ON device_models FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND (deleted_at IS NULL OR has_permission('admin.trash.view'))
           AND (has_permission('my.devices.view') OR has_permission('devices.models.view')
                OR has_permission('devices.view')));
CREATE POLICY device_models_insert ON device_models FOR INSERT TO authenticated
    WITH CHECK (tenant_id = current_tenant_id() AND has_permission('devices.models.edit'));
CREATE POLICY device_models_update ON device_models FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id() AND has_permission('devices.models.edit'))
    WITH CHECK (tenant_id = current_tenant_id());

-- DEVICES: a customer sees the devices they own or used to own (read-only history)
CREATE POLICY device_owner_hist_select ON device_ownership_history FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND (user_id = auth.uid() OR has_permission('devices.view')));
CREATE POLICY devices_select ON devices FOR SELECT TO authenticated
    USING (
        tenant_id = current_tenant_id()
        AND (
            (deleted_at IS NULL AND has_permission('my.devices.view')
             AND (owner_id = auth.uid()
                  OR EXISTS (SELECT 1 FROM device_ownership_history h
                             WHERE h.device_id = devices.id AND h.user_id = auth.uid())))
            OR (deleted_at IS NULL AND has_permission('devices.view'))
            OR has_permission('admin.trash.view')
        )
    );
CREATE POLICY devices_insert ON devices FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = current_tenant_id()
        AND (
            (is_approved_customer() AND has_permission('my.devices.edit')
             AND owner_id = auth.uid() AND added_by = auth.uid()
             AND company_id = current_company_id())
            OR has_permission('devices.edit')
        )
    );
CREATE POLICY devices_update ON devices FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id() AND has_permission('devices.edit'))
    WITH CHECK (tenant_id = current_tenant_id());

-- DEVICE CLAIMS: claimant sees own; reviewers see the tenant's. Writes go through functions below.
CREATE POLICY device_claims_select ON device_claims FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND ((claimant_id = auth.uid() AND has_permission('my.devices.view'))
                OR has_permission('devices.claims.view')));

-- TICKETS (customers: my.tickets.*, staff: tickets.*, with all / own data scope)
CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
    USING (
        tenant_id = current_tenant_id()
        AND (deleted_at IS NULL OR has_permission('admin.trash.view'))
        AND (
            (customer_id = auth.uid() AND has_permission('my.tickets.view'))
            OR permission_scope('tickets.view') = 'all'
            OR (permission_scope('tickets.view') = 'own' AND assigned_to = auth.uid())
        )
    );
CREATE POLICY tickets_insert ON tickets FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = current_tenant_id()
        AND is_approved_customer()
        AND has_permission('my.tickets.edit')
        AND customer_id = auth.uid()
        AND company_id = current_company_id()
        AND status = 'new' AND assigned_to IS NULL
        AND EXISTS (SELECT 1 FROM devices d
                    WHERE d.id = device_id AND d.owner_id = auth.uid()
                      AND d.deleted_at IS NULL)
    );
CREATE POLICY tickets_update ON tickets FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id()
           AND has_permission('tickets.edit')
           AND (permission_scope('tickets.edit') = 'all' OR assigned_to = auth.uid()))
    WITH CHECK (tenant_id = current_tenant_id());

-- TICKET MESSAGES: visible if the ticket is visible; internal notes only for staff
CREATE POLICY ticket_messages_select ON ticket_messages FOR SELECT TO authenticated
    USING (
        tenant_id = current_tenant_id()
        AND (deleted_at IS NULL OR has_permission('admin.trash.view'))
        AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id)   -- ticket RLS applies
        AND (is_internal = FALSE OR is_staff())
    );
CREATE POLICY ticket_messages_insert ON ticket_messages FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = current_tenant_id()
        AND sender_id = auth.uid()
        AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id)
        AND ((is_staff() AND has_permission('tickets.edit'))
             OR (NOT is_staff() AND has_permission('my.tickets.edit') AND is_internal = FALSE))
        AND sender_kind = (CASE WHEN is_staff() THEN 'staff' ELSE 'customer' END)::sender_kind
    );
CREATE POLICY ticket_messages_update ON ticket_messages FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id() AND is_staff() AND has_permission('tickets.edit'))
    WITH CHECK (tenant_id = current_tenant_id());

-- ATTACHMENTS and HISTORY follow ticket visibility
CREATE POLICY ticket_attachments_select ON ticket_attachments FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id));
CREATE POLICY ticket_attachments_insert ON ticket_attachments FOR INSERT TO authenticated
    WITH CHECK (tenant_id = current_tenant_id() AND uploaded_by = auth.uid()
                AND (has_permission('tickets.edit') OR has_permission('my.tickets.edit'))
                AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id));
CREATE POLICY ticket_history_select ON ticket_status_history FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id));

-- CONTENT: customers see published, customer-visible items only (my.help); staff use content.library
CREATE POLICY content_items_select ON content_items FOR SELECT TO authenticated
    USING (
        tenant_id = current_tenant_id()
        AND (
            has_permission('content.library.edit')
            OR (deleted_at IS NULL AND is_published
                AND ((is_staff() AND has_permission('content.library.view'))
                     OR (visible_to_customers AND has_permission('my.help.view'))))
            OR has_permission('admin.trash.view')
        )
    );
CREATE POLICY content_items_insert ON content_items FOR INSERT TO authenticated
    WITH CHECK (tenant_id = current_tenant_id() AND has_permission('content.library.edit'));
CREATE POLICY content_items_update ON content_items FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id() AND has_permission('content.library.edit'))
    WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY content_translations_select ON content_translations FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM content_items c WHERE c.id = content_id));
CREATE POLICY content_translations_insert ON content_translations FOR INSERT TO authenticated
    WITH CHECK (has_permission('content.library.edit')
                AND EXISTS (SELECT 1 FROM content_items c WHERE c.id = content_id));
CREATE POLICY content_translations_update ON content_translations FOR UPDATE TO authenticated
    USING (has_permission('content.library.edit')
           AND EXISTS (SELECT 1 FROM content_items c WHERE c.id = content_id));
CREATE POLICY content_translations_delete ON content_translations FOR DELETE TO authenticated
    USING (has_permission('content.library.delete')
           AND EXISTS (SELECT 1 FROM content_items c WHERE c.id = content_id));

CREATE POLICY content_categories_select ON content_categories FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND (deleted_at IS NULL OR has_permission('admin.trash.view'))
           AND (has_permission('my.help.view') OR has_permission('content.library.view')
                OR has_permission('content.categories.view')));
CREATE POLICY content_categories_insert ON content_categories FOR INSERT TO authenticated
    WITH CHECK (tenant_id = current_tenant_id() AND has_permission('content.categories.edit'));
CREATE POLICY content_categories_update ON content_categories FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id() AND has_permission('content.categories.edit'))
    WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY content_cat_trans_select ON content_category_translations FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM content_categories c WHERE c.id = category_id));
CREATE POLICY content_cat_trans_insert ON content_category_translations FOR INSERT TO authenticated
    WITH CHECK (has_permission('content.categories.edit')
                AND EXISTS (SELECT 1 FROM content_categories c WHERE c.id = category_id));
CREATE POLICY content_cat_trans_update ON content_category_translations FOR UPDATE TO authenticated
    USING (has_permission('content.categories.edit')
           AND EXISTS (SELECT 1 FROM content_categories c WHERE c.id = category_id));
CREATE POLICY content_cat_trans_delete ON content_category_translations FOR DELETE TO authenticated
    USING (has_permission('content.categories.delete')
           AND EXISTS (SELECT 1 FROM content_categories c WHERE c.id = category_id));

-- AI: own conversations only. Customers use my.ai, staff use ai.assistant.
CREATE POLICY ai_conversations_select ON ai_conversations FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id() AND user_id = auth.uid()
           AND (has_permission('ai.assistant.view') OR has_permission('my.ai.view')));
CREATE POLICY ai_conversations_insert ON ai_conversations FOR INSERT TO authenticated
    WITH CHECK (tenant_id = current_tenant_id() AND user_id = auth.uid()
                AND (has_permission('ai.assistant.edit') OR has_permission('my.ai.edit')));
CREATE POLICY ai_conversations_update ON ai_conversations FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id() AND user_id = auth.uid()
           AND (has_permission('ai.assistant.edit') OR has_permission('my.ai.edit')));
CREATE POLICY ai_conversations_delete ON ai_conversations FOR DELETE TO authenticated
    USING (tenant_id = current_tenant_id() AND user_id = auth.uid()
           AND (has_permission('ai.assistant.delete') OR has_permission('my.ai.delete')));
CREATE POLICY ai_messages_select ON ai_messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM ai_conversations c
                   WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY ai_messages_insert ON ai_messages FOR INSERT TO authenticated
    WITH CHECK ((has_permission('ai.assistant.edit') OR has_permission('my.ai.edit'))
                AND EXISTS (SELECT 1 FROM ai_conversations c
                            WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY ai_messages_update ON ai_messages FOR UPDATE TO authenticated   -- thumbs up / down
    USING ((has_permission('ai.assistant.edit') OR has_permission('my.ai.edit'))
           AND EXISTS (SELECT 1 FROM ai_conversations c
                       WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- NOTIFICATIONS: own; users may only mark as read (created by server code)
CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id() AND user_id = auth.uid()
           AND has_permission('notifications.view'));
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
    USING (tenant_id = current_tenant_id() AND user_id = auth.uid()
           AND has_permission('notifications.edit'))
    WITH CHECK (user_id = auth.uid());
REVOKE UPDATE ON notifications FROM authenticated, anon;
GRANT  UPDATE (is_read) ON notifications TO authenticated;

-- AUDIT LOG and SETTINGS
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id() AND has_permission('admin.audit.view'));
CREATE POLICY settings_select ON settings FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND has_permission('admin.settings.view')
           AND (key <> 'login_security' OR is_tenant_admin()));   -- security settings: administrator only

-- ADMINISTRATOR-ONLY MENUS: login history and integrations. Even a role holding every
-- other permission cannot read them (their permissions can never be granted).
CREATE POLICY login_events_select ON login_events FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id() AND is_tenant_admin());
CREATE POLICY integrations_select ON integrations FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id() AND is_tenant_admin());

-- EXTERNAL DEVICE DATA (from the connected platform): staff with tickets.external_info.view
-- ONLY. Customers have no policy and can never read it. Rows are written by server code.
CREATE POLICY device_external_info_select ON device_external_info FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND is_staff()
           AND has_permission('tickets.external_info.view'));

-- Link to the service ticket in the other platform: staff only, like the device data above.
CREATE POLICY ticket_external_refs_select ON ticket_external_refs FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND is_staff()
           AND has_permission('tickets.external_info.view'));

-- Sync queue (what is waiting, sent or failed): administrator only, with the Integrations menu.
CREATE POLICY integration_outbox_select ON integration_outbox FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id() AND is_tenant_admin());

-- Internal device service status: staff only, for tickets they are allowed to see.
-- Customers have no policy here and can never read the internal values (for example "RMA").
CREATE POLICY ticket_service_state_select ON ticket_service_state FOR SELECT TO authenticated
    USING (tenant_id = current_tenant_id()
           AND is_staff()
           AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id));   -- ticket RLS applies

-- ---------------------------------------------------------------------
-- 8. DEVICE OWNERSHIP CLAIMS
-- Mode is stored per tenant in settings.device_claim_mode:
--   "staff_approval" (default) -> claim waits for a reviewer
--   "auto_transfer"            -> device moves to the claimant immediately
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_device_claim(p_serial TEXT, p_label_photo_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_tenant  UUID := current_tenant_id();
    v_device  devices%ROWTYPE;
    v_mode    TEXT;
    v_claim   UUID;
BEGIN
    IF NOT (is_approved_customer() AND has_permission('my.devices.edit')) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_device FROM devices
     WHERE tenant_id = v_tenant
       AND upper(serial_number) = upper(trim(p_serial)) AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'device_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_device.owner_id = auth.uid() THEN
        RAISE EXCEPTION 'already_yours' USING ERRCODE = '23505';
    END IF;

    SELECT value #>> '{}' INTO v_mode
      FROM settings WHERE tenant_id = v_tenant AND key = 'device_claim_mode';
    v_mode := COALESCE(v_mode, 'staff_approval');

    INSERT INTO device_claims (tenant_id, device_id, claimant_id, previous_owner_id, label_photo_key)
    VALUES (v_tenant, v_device.id, auth.uid(), v_device.owner_id, p_label_photo_key)
    RETURNING id INTO v_claim;

    IF v_mode = 'auto_transfer' THEN
        PERFORM review_device_claim_internal(v_claim, TRUE, 'Automatic transfer', NULL);
        RETURN 'approved';
    END IF;
    RETURN 'pending';
END;
$$;

-- Internal worker: moves the device, keeps the history, writes the audit record
CREATE OR REPLACE FUNCTION review_device_claim_internal(
    p_claim UUID, p_approve BOOLEAN, p_note TEXT, p_reviewer UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    k         device_claims%ROWTYPE;
    v_company UUID;
BEGIN
    SELECT * INTO k FROM device_claims WHERE id = p_claim AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'claim_not_pending' USING ERRCODE = 'P0002';
    END IF;

    UPDATE device_claims
       SET status      = CASE WHEN p_approve THEN 'approved'::claim_status ELSE 'rejected'::claim_status END,
           reviewed_by = p_reviewer,
           review_note = p_note,
           reviewed_at = now()
     WHERE id = p_claim;

    IF p_approve THEN
        SELECT company_id INTO v_company FROM users WHERE id = k.claimant_id;
        -- the owner-tracking trigger closes the old ownership row and opens the new one
        UPDATE devices
           SET owner_id = k.claimant_id, company_id = v_company
         WHERE id = k.device_id;

        INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (k.tenant_id, COALESCE(p_reviewer, k.claimant_id), 'device.transfer', 'device',
                k.device_id::text,
                jsonb_build_object('owner_id', k.previous_owner_id),
                jsonb_build_object('owner_id', k.claimant_id, 'claim_id', k.id));
    END IF;
END;
$$;

-- Reviewer entry point: needs devices.claims.edit, works only inside the caller's tenant
CREATE OR REPLACE FUNCTION review_device_claim(p_claim UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT has_permission('devices.claims.edit') THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM device_claims
                   WHERE id = p_claim AND tenant_id = current_tenant_id()) THEN
        RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0002';
    END IF;
    PERFORM review_device_claim_internal(p_claim, p_approve, p_note, auth.uid());
END;
$$;

-- Only the public entry points are callable by app users
REVOKE ALL ON FUNCTION review_device_claim_internal(UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION submit_device_claim(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION review_device_claim(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_device_claim(TEXT, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION review_device_claim(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. MANUAL MODE (the service center works without any connection)
-- Staff with tickets.external_info.edit type the device data and the 1C number by hand.
-- Both functions check the permission, the tenant and the ticket's data scope, and write
-- an audit record. A later automatic fetch never overwrites a manual entry unless the
-- engineer explicitly chooses "Replace with data from the platform" (server code checks
-- source = 'manual' before writing).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_manual_device_info(
    p_ticket UUID, p_model TEXT, p_warranty_until DATE, p_sold_date DATE, p_customer_name TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    t      tickets%ROWTYPE;
    d      devices%ROWTYPE;
    v_old  device_external_info%ROWTYPE;
    v_had  BOOLEAN;
BEGIN
    IF NOT (is_staff() AND has_permission('tickets.external_info.edit')) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t FROM tickets
     WHERE id = p_ticket AND tenant_id = current_tenant_id() AND deleted_at IS NULL
       AND (permission_scope('tickets.view') = 'all' OR assigned_to = auth.uid());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO d FROM devices WHERE id = t.device_id;
    SELECT * INTO v_old FROM device_external_info
     WHERE tenant_id = t.tenant_id AND device_id = d.id;
    v_had := FOUND;

    INSERT INTO device_external_info
        (tenant_id, device_id, ticket_id, serial_number, status, source,
         model_name, warranty_until, sold_date, customer_name, fetched_by, fetched_at)
    VALUES
        (t.tenant_id, d.id, t.id, d.serial_number, 'ok', 'manual',
         p_model, p_warranty_until, p_sold_date, p_customer_name, auth.uid(), now())
    ON CONFLICT (tenant_id, device_id) DO UPDATE
       SET ticket_id = EXCLUDED.ticket_id, status = 'ok', source = 'manual',
           model_name = EXCLUDED.model_name, warranty_until = EXCLUDED.warranty_until,
           sold_date = EXCLUDED.sold_date, customer_name = EXCLUDED.customer_name,
           raw_response = NULL, error_message = NULL,
           fetched_by = auth.uid(), fetched_at = now();

    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (t.tenant_id, auth.uid(), 'external_info.manual_save', 'device', d.id::text,
            CASE WHEN v_had THEN jsonb_build_object('source', v_old.source, 'model', v_old.model_name,
                 'warranty_until', v_old.warranty_until, 'sold_date', v_old.sold_date,
                 'customer_name', v_old.customer_name) END,
            jsonb_build_object('source', 'manual', 'model', p_model, 'warranty_until', p_warranty_until,
                 'sold_date', p_sold_date, 'customer_name', p_customer_name, 'ticket_id', t.id));
END;
$$;

-- The number of the service ticket in 1C (or another platform), typed in by hand
CREATE OR REPLACE FUNCTION save_manual_ticket_ref(p_ticket UUID, p_number TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    t tickets%ROWTYPE;
BEGIN
    IF NOT (is_staff() AND has_permission('tickets.external_info.edit')) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t FROM tickets
     WHERE id = p_ticket AND tenant_id = current_tenant_id() AND deleted_at IS NULL
       AND (permission_scope('tickets.view') = 'all' OR assigned_to = auth.uid());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO ticket_external_refs
        (tenant_id, ticket_id, integration_id, source, external_number, sync_status, last_synced_at)
    VALUES (t.tenant_id, t.id, NULL, 'manual', NULLIF(trim(p_number), ''), 'manual', now())
    ON CONFLICT (ticket_id) DO UPDATE
       SET external_number = NULLIF(trim(p_number), ''), source = 'manual',
           sync_status = 'manual', last_error = NULL, last_synced_at = now();

    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, new_values)
    VALUES (t.tenant_id, auth.uid(), 'external_ref.manual_save', 'ticket', t.id::text,
            jsonb_build_object('number', p_number));
END;
$$;

-- Lets any staff member's screen know whether a connection is switched on, without
-- exposing the settings themselves (those stay administrator only).
CREATE OR REPLACE FUNCTION integration_state()
RETURNS TABLE (kind TEXT, is_enabled BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT i.kind, i.is_enabled
    FROM integrations i
    WHERE i.tenant_id = current_tenant_id() AND is_staff();
$$;

REVOKE ALL ON FUNCTION save_manual_device_info(UUID, TEXT, DATE, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_manual_ticket_ref(UUID, TEXT)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION integration_state()                                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_manual_device_info(UUID, TEXT, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION save_manual_ticket_ref(UUID, TEXT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION integration_state()                                   TO authenticated;

-- ---------------------------------------------------------------------
-- 9b. SET THE DEVICE SERVICE STATUS (engineers and managers)
-- Needs tickets.edit on the ticket (data scope applies). The trigger then updates what the
-- customer sees and queues the change for the connected platform.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_device_service_status(
    p_ticket UUID, p_status device_service_status, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    t     tickets%ROWTYPE;
    v_old device_service_status;
BEGIN
    IF NOT (is_staff() AND has_permission('tickets.edit')) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t FROM tickets
     WHERE id = p_ticket AND tenant_id = current_tenant_id() AND deleted_at IS NULL
       AND (permission_scope('tickets.edit') = 'all' OR assigned_to = auth.uid());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT status INTO v_old FROM ticket_service_state WHERE ticket_id = t.id;

    INSERT INTO ticket_service_state (ticket_id, tenant_id, status, comment, changed_by, changed_at)
    VALUES (t.id, t.tenant_id, p_status, p_comment, auth.uid(), now())
    ON CONFLICT (ticket_id) DO UPDATE
       SET status = EXCLUDED.status, comment = EXCLUDED.comment,
           changed_by = auth.uid(), changed_at = now();

    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (t.tenant_id, auth.uid(), 'ticket.service_status', 'ticket', t.id::text,
            jsonb_build_object('status', v_old),
            jsonb_build_object('status', p_status, 'comment', p_comment));
END;
$$;
REVOKE ALL ON FUNCTION set_device_service_status(UUID, device_service_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_device_service_status(UUID, device_service_status, TEXT) TO authenticated;

COMMIT;
