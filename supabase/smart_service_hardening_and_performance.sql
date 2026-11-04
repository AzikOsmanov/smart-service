-- =====================================================================
-- Smart Service System - hardening and performance (applied as migrations 009 and 010)
-- Run AFTER smart_service_schema.sql and smart_service_rls_and_functions.sql.
--
-- Deployed to Supabase project "smart-service" (ref ihzmgayisuovnmxrftop, region eu-central-1).
-- Found by Supabase's security and performance advisors on the first real run, then
-- re-checked with a 43-point behavior test (rolled back, nothing left in the database).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 009. SECURITY HARDENING
-- * every function has a fixed search_path
-- * trigger functions and internal helpers cannot be called through the public API
-- * helper functions used by row-level-security rules are callable by signed-in users only
-- * the intended entry points (review_registration, submit_device_claim, review_device_claim,
--   save_manual_device_info, save_manual_ticket_ref, integration_state, set_device_service_status)
--   stay callable by signed-in users only (granted in the security file)
-- ---------------------------------------------------------------------
ALTER FUNCTION set_updated_at()            SET search_path = public;
ALTER FUNCTION prevent_change()            SET search_path = public;
ALTER FUNCTION create_menu_permissions()   SET search_path = public;
ALTER FUNCTION assert_menu_permissions()   SET search_path = public;
ALTER FUNCTION seed_tenant_defaults(uuid)  SET search_path = public;

REVOKE ALL ON FUNCTION handle_new_user()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION log_ticket_status()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION on_service_state_change()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION on_ticket_applied()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_last_admin_role_row()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_last_admin_user()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION track_device_owner()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION other_active_admin_exists(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_updated_at()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION prevent_change()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_menu_permissions()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION assert_menu_permissions()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seed_tenant_defaults(uuid)     FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION current_company_id()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION current_tenant_id()     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION has_permission(text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_approved_customer()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_staff()              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_tenant_admin()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION permission_scope(text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_company_id()   TO authenticated;
GRANT EXECUTE ON FUNCTION current_tenant_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION has_permission(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION is_approved_customer() TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff()             TO authenticated;
GRANT EXECUTE ON FUNCTION is_tenant_admin()      TO authenticated;
GRANT EXECUTE ON FUNCTION permission_scope(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 010. PERFORMANCE
-- ---------------------------------------------------------------------
-- Primary keys for the two tables that only had a unique index
ALTER TABLE settings               ADD PRIMARY KEY USING INDEX settings_tenant_key_uq;
ALTER TABLE serial_number_registry ADD PRIMARY KEY USING INDEX serial_registry_uq;

-- Rules that call auth.uid() are re-evaluated for every row unless the call is wrapped in
-- a sub-select. Rewrites every policy that uses auth.uid() (rerun after adding new policies).
DO $$
DECLARE
    p   record;
    sql text;
BEGIN
    FOR p IN
        SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (coalesce(qual, '') LIKE '%auth.uid()%' OR coalesce(with_check, '') LIKE '%auth.uid()%')
    LOOP
        sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
        IF p.qual IS NOT NULL THEN
            sql := sql || ' USING (' || replace(p.qual, 'auth.uid()', '(SELECT auth.uid())') || ')';
        END IF;
        IF p.with_check IS NOT NULL THEN
            sql := sql || ' WITH CHECK (' || replace(p.with_check, 'auth.uid()', '(SELECT auth.uid())') || ')';
        END IF;
        EXECUTE sql;
    END LOOP;
END $$;

-- An index for every foreign key that has none (speeds up joins and deletes)
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.conrelid::regclass AS tbl, c.conname,
               (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
                FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
          AND NOT EXISTS (
                SELECT 1 FROM pg_index i
                WHERE i.indrelid = c.conrelid
                  AND (string_to_array(i.indkey::text, ' '))[1:cardinality(c.conkey)]
                      = (SELECT array_agg(u.k::text ORDER BY u.ord) FROM unnest(c.conkey) WITH ORDINALITY AS u(k, ord))
          )
    LOOP
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)', left(r.conname || '_idx', 63), r.tbl, r.cols);
    END LOOP;
END $$;
