-- =====================================================================
-- Smart Service System - deletion with reason + administrator hard delete
-- (applied as migration 011)
-- =====================================================================

-- 1. Who deleted a ticket and why (soft delete keeps the record in Trash)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS delete_reason TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- 2. Immutable history tables: still never edited or deleted, except that the link to a
--    user may be cleared (set to NULL) when that user is permanently deleted.
CREATE OR REPLACE FUNCTION prevent_change_except_user_unlink() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'user_id' - 'actor_id') = (to_jsonb(OLD) - 'user_id' - 'actor_id')
       AND ((to_jsonb(NEW) ->> 'user_id') IS NULL AND (to_jsonb(NEW) ->> 'actor_id') IS NULL) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'records_are_immutable' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_login_events_immutable ON login_events;
CREATE TRIGGER trg_login_events_immutable BEFORE UPDATE ON login_events
    FOR EACH ROW EXECUTE FUNCTION prevent_change_except_user_unlink();
CREATE TRIGGER trg_login_events_nodelete BEFORE DELETE ON login_events
    FOR EACH ROW EXECUTE FUNCTION prevent_change();
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_change_except_user_unlink();
CREATE TRIGGER trg_audit_logs_nodelete BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_change();

-- 3. Delete a ticket with a reason (service manager or anyone holding tickets.delete).
--    The ticket goes to Trash; nothing is lost.
CREATE OR REPLACE FUNCTION delete_ticket(p_ticket UUID, p_reason TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tickets%ROWTYPE;
BEGIN
    IF NOT (is_staff() AND has_permission('tickets.delete')) THEN
        RAISE EXCEPTION 'delete_not_allowed' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
        RAISE EXCEPTION 'reason_required';
    END IF;
    SELECT * INTO t FROM tickets WHERE id = p_ticket AND tenant_id = current_tenant_id() AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
    UPDATE tickets SET deleted_at = now(), delete_reason = btrim(p_reason), deleted_by = auth.uid() WHERE id = p_ticket;
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values)
    VALUES (t.tenant_id, auth.uid(), 'ticket.delete', 'ticket', p_ticket::text,
            jsonb_build_object('ticket_no', t.ticket_no, 'subject', t.subject, 'reason', btrim(p_reason)));
END;
$$;

-- 4. Permanently delete a ticket (administrator only, reason required, recorded in the audit log)
CREATE OR REPLACE FUNCTION hard_delete_ticket(p_ticket UUID, p_reason TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tickets%ROWTYPE;
BEGIN
    IF NOT is_tenant_admin() THEN
        RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
        RAISE EXCEPTION 'reason_required';
    END IF;
    SELECT * INTO t FROM tickets WHERE id = p_ticket AND tenant_id = current_tenant_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
    DELETE FROM device_external_info WHERE ticket_id = p_ticket;
    DELETE FROM integration_outbox   WHERE ticket_id = p_ticket;
    DELETE FROM ticket_external_refs WHERE ticket_id = p_ticket;
    DELETE FROM ticket_service_state WHERE ticket_id = p_ticket;
    DELETE FROM tickets WHERE id = p_ticket;   -- messages, attachments, history, notifications cascade
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values)
    VALUES (t.tenant_id, auth.uid(), 'ticket.hard_delete', 'ticket', p_ticket::text,
            jsonb_build_object('ticket_no', t.ticket_no, 'subject', t.subject, 'reason', btrim(p_reason)));
END;
$$;

-- 5. Permanently delete a user (administrator only, no approval step).
--    Blocked for: yourself, administrators, and users who still own tickets or devices.
--    Where the user is only named on other records (who changed, who reviewed ...), that link is cleared.
--    The sign-in account in auth.users is removed by the web app afterwards.
CREATE OR REPLACE FUNCTION hard_delete_user(p_user UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    u users%ROWTYPE;
    fk RECORD;
    n BIGINT;
    blockers TEXT := '';
BEGIN
    IF NOT is_tenant_admin() THEN
        RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
    END IF;
    IF p_user = auth.uid() THEN RAISE EXCEPTION 'cannot_delete_yourself'; END IF;
    SELECT * INTO u FROM users WHERE id = p_user AND tenant_id = current_tenant_id();
    IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
    IF EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = p_user AND r.is_admin) THEN
        RAISE EXCEPTION 'cannot_delete_administrator';
    END IF;

    -- first pass: find records that block the delete (NOT NULL links, or customer-owned data)
    FOR fk IN
        SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, a.attnotnull AS notnull
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass
          AND c.confdeltype = 'a' AND c.connamespace = 'public'::regnamespace
          AND c.conrelid <> 'public.users'::regclass
    LOOP
        EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', fk.tbl, fk.col) INTO n USING p_user;
        IF n > 0 AND (fk.notnull OR (fk.tbl, fk.col) IN (('tickets','customer_id'), ('devices','owner_id'), ('devices','added_by'))) THEN
            blockers := blockers || format('%s (%s records), ', fk.tbl, n);
        END IF;
    END LOOP;
    IF blockers <> '' THEN
        RAISE EXCEPTION 'user_has_records: %', rtrim(blockers, ', ');
    END IF;

    -- second pass: clear the remaining links (history stays, name link removed)
    FOR fk IN
        SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass
          AND c.confdeltype = 'a' AND c.connamespace = 'public'::regnamespace
          AND c.conrelid <> 'public.users'::regclass
    LOOP
        EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', fk.tbl, fk.col, fk.col) USING p_user;
    END LOOP;
    UPDATE users SET registration_reviewed_by = NULL WHERE registration_reviewed_by = p_user;

    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, old_values)
    VALUES (u.tenant_id, auth.uid(), 'user.hard_delete', 'user', p_user::text,
            jsonb_build_object('email', u.email, 'name', btrim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), 'kind', u.kind));
    DELETE FROM user_roles WHERE user_id = p_user;
    DELETE FROM users WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION prevent_change_except_user_unlink() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_ticket(UUID, TEXT)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION hard_delete_ticket(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION hard_delete_user(UUID)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_ticket(UUID, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_ticket(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_user(UUID)         TO authenticated;
