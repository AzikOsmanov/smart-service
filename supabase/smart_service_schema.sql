-- =====================================================================
-- Smart Service System - PostgreSQL schema (v1)
-- Requires PostgreSQL 13+ (gen_random_uuid is built in)
-- Conventions: UUID primary keys, soft delete via deleted_at,
-- timestamps in UTC (timestamptz).
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;   -- Supabase keeps extensions in the 'extensions' schema   -- case-insensitive emails

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE language_code        AS ENUM ('en', 'az', 'ru');
CREATE TYPE theme_mode           AS ENUM ('light', 'dark', 'system');
CREATE TYPE user_kind            AS ENUM ('staff', 'customer');
CREATE TYPE customer_type        AS ENUM ('reseller', 'installer', 'company');
CREATE TYPE registration_status  AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE ticket_status        AS ENUM ('new', 'assigned', 'in_progress',
                                          'waiting_customer', 'resolved', 'closed');
CREATE TYPE ticket_priority      AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE content_kind         AS ENUM ('faq', 'config_video', 'tutorial_video', 'document');
CREATE TYPE sender_kind          AS ENUM ('customer', 'staff', 'system');
CREATE TYPE ai_sender            AS ENUM ('user', 'assistant');
CREATE TYPE claim_status         AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE device_service_status AS ENUM ('in_progress', 'done', 'rma', 'repair_not_possible');   -- internal, staff only
CREATE TYPE customer_device_status AS ENUM ('diagnose', 'ready', 'repair_not_possible', 'pickup_new_device');  -- what the customer sees

-- ---------------------------------------------------------------------
-- HELPER: auto-update updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 0. TENANTS (multi-tenant from day one)
-- A tenant is one company running its own service center on the platform, with its
-- own staff, customers, devices, tickets, content, roles and settings.
-- Every business table below carries tenant_id and row-level security keeps tenants apart.
-- ---------------------------------------------------------------------
CREATE TYPE tenant_status AS ENUM ('active', 'suspended');

CREATE TABLE tenants (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    slug             TEXT NOT NULL UNIQUE,                 -- used in the web address / app config
    status           tenant_status NOT NULL DEFAULT 'active',
    default_language language_code NOT NULL DEFAULT 'en',
    branding         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- logo, colors (future white-label)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);
CREATE TRIGGER trg_tenants_upd BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 1. ROLES & PERMISSIONS (RBAC, fully configurable by administrator)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL,                   -- e.g. 'admin', 'manager' (unique per tenant)
    name        TEXT NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,  -- built-in role: cannot be deleted or renamed
    is_admin    BOOLEAN NOT NULL DEFAULT FALSE,  -- THE administrator role: fixed by the platform, always has
                                                 -- every permission (present and future), cannot be edited or deleted
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE permissions (
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,            -- <menu key>.<level>, e.g. 'tickets.view'
    resource    TEXT NOT NULL,                   -- the menu key, e.g. 'tickets'
    action      TEXT NOT NULL,                   -- always 'view', 'edit' or 'delete'
    description TEXT
);

CREATE TABLE role_permissions (
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    data_scope    TEXT NOT NULL DEFAULT 'all' CHECK (data_scope IN ('all', 'own')),  -- 'own' = only own / assigned records
    PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- 2. COMPANIES & USERS
-- ---------------------------------------------------------------------
CREATE TABLE companies (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    type            customer_type NOT NULL,
    tax_id          TEXT,
    country         TEXT,
    city            TEXT NOT NULL,                        -- required at registration
    address         TEXT,
    phone           TEXT,
    status          registration_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE users (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind              user_kind NOT NULL,                 -- staff (web) or customer (mobile)
    email             extensions.citext NOT NULL,
    phone             TEXT,
    -- Supabase Auth keeps passwords. users.id equals auth.users.id (set by the signup trigger
    -- in smart_service_rls_and_functions.sql), so no password column is stored here.
    first_name        TEXT NOT NULL,
    last_name         TEXT NOT NULL,
    company_id        UUID REFERENCES companies(id),      -- customers belong to a company
    customer_type     customer_type,                      -- only for customers
    registration      registration_status NOT NULL DEFAULT 'pending',
    registration_reviewed_by UUID REFERENCES users(id),   -- administrator or service manager
    registration_reviewed_at TIMESTAMPTZ,
    registration_note TEXT,
    language          language_code NOT NULL DEFAULT 'en',
    theme             theme_mode NOT NULL DEFAULT 'system',
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified_at TIMESTAMPTZ,
    last_login_at     TIMESTAMPTZ,
    failed_login_count INT NOT NULL DEFAULT 0,             -- reset on successful login
    locked_until      TIMESTAMPTZ,                         -- temporary lockout after too many failures
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ,
    CONSTRAINT customer_has_type    CHECK (kind = 'staff' OR customer_type IS NOT NULL),
    CONSTRAINT customer_has_company CHECK (kind = 'staff' OR company_id IS NOT NULL)
);
-- Unique email among non-deleted users only
CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX users_company_idx ON users (company_id);
CREATE INDEX users_kind_idx ON users (kind, registration);

CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE push_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    token       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. DEVICES
-- ---------------------------------------------------------------------
CREATE TABLE device_models (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    sku         TEXT,
    category    TEXT,
    image_url   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE devices (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number   TEXT NOT NULL,
    model_id        UUID REFERENCES device_models(id),
    owner_id        UUID REFERENCES users(id),            -- the customer who registered it; only this user sees it
    company_id      UUID REFERENCES companies(id),        -- owner's company, for reporting only (not for visibility)
    added_by        UUID REFERENCES users(id),            -- who created the record (customer or staff)
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,       -- matched against imported SN list
    warranty_until  DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX devices_sn_uq ON devices (tenant_id, upper(serial_number)) WHERE deleted_at IS NULL;
CREATE INDEX devices_company_idx ON devices (company_id);
CREATE INDEX devices_owner_idx   ON devices (owner_id);

-- Optional: official serial number list imported from manufacturing/ERP
CREATE TABLE serial_number_registry (
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    serial_number  TEXT NOT NULL,
    model_id       UUID REFERENCES device_models(id),
    manufactured_at DATE,
    warranty_until DATE
);

-- Ownership requests: a second user scans the label of a device registered by someone else.
-- Handled by submit_device_claim() / review_device_claim() in smart_service_rls_and_functions.sql
CREATE TABLE device_claims (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id         UUID NOT NULL REFERENCES devices(id),
    claimant_id       UUID NOT NULL REFERENCES users(id),
    previous_owner_id UUID REFERENCES users(id),
    label_photo_key   TEXT NOT NULL,                      -- photo of the SN label (proof)
    status            claim_status NOT NULL DEFAULT 'pending',
    reviewed_by       UUID REFERENCES users(id),          -- NULL when auto-transferred
    review_note       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX device_claims_one_pending_uq
    ON device_claims (device_id, claimant_id) WHERE status = 'pending';
CREATE INDEX device_claims_status_idx ON device_claims (status, created_at);

-- Every owner of a device, past and present. Nothing is overwritten: when a device is
-- transferred, the previous owner's row is closed (owned_until) and keeps read-only access.
CREATE TABLE device_ownership_history (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id    UUID NOT NULL REFERENCES devices(id),
    user_id      UUID NOT NULL REFERENCES users(id),
    company_id   UUID REFERENCES companies(id),
    owned_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
    owned_until  TIMESTAMPTZ                               -- NULL = current owner
);
CREATE INDEX device_owner_hist_user_idx   ON device_ownership_history (user_id);
CREATE INDEX device_owner_hist_device_idx ON device_ownership_history (device_id);
CREATE UNIQUE INDEX device_one_current_owner_uq
    ON device_ownership_history (device_id) WHERE owned_until IS NULL;

CREATE OR REPLACE FUNCTION track_device_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
            RETURN NEW;
        END IF;
        UPDATE device_ownership_history
           SET owned_until = now()
         WHERE device_id = NEW.id AND owned_until IS NULL;
    END IF;
    IF NEW.owner_id IS NOT NULL THEN
        INSERT INTO device_ownership_history (tenant_id, device_id, user_id, company_id)
        VALUES (NEW.tenant_id, NEW.id, NEW.owner_id, NEW.company_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_device_owner_track
    AFTER INSERT OR UPDATE OF owner_id ON devices
    FOR EACH ROW EXECUTE FUNCTION track_device_owner();

-- ---------------------------------------------------------------------
-- 4. TICKETS
-- ---------------------------------------------------------------------
CREATE SEQUENCE ticket_number_seq START 1000;

CREATE TABLE tickets (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_no       BIGINT NOT NULL UNIQUE DEFAULT nextval('ticket_number_seq'),
    customer_id     UUID NOT NULL REFERENCES users(id),
    company_id      UUID REFERENCES companies(id),
    device_id       UUID NOT NULL REFERENCES devices(id),
    assigned_to     UUID REFERENCES users(id),            -- service engineer
    subject         TEXT NOT NULL,
    description     TEXT NOT NULL,
    status          ticket_status NOT NULL DEFAULT 'new',
    priority        ticket_priority NOT NULL DEFAULT 'normal',
    customer_device_status customer_device_status,         -- the ONLY device status customers see (derived from the internal one)
    due_at          TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    satisfaction    SMALLINT CHECK (satisfaction BETWEEN 1 AND 5),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX tickets_status_idx   ON tickets (status, priority);
CREATE INDEX tickets_customer_idx ON tickets (customer_id);
CREATE INDEX tickets_assigned_idx ON tickets (assigned_to, status);
CREATE INDEX tickets_device_idx   ON tickets (device_id);

CREATE TABLE ticket_messages (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id    UUID REFERENCES users(id),               -- NULL for system messages
    sender_kind  sender_kind NOT NULL,
    body         TEXT NOT NULL,
    is_internal  BOOLEAN NOT NULL DEFAULT FALSE,          -- internal staff note, hidden from customer
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at    TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ
);
CREATE INDEX ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);

CREATE TABLE ticket_attachments (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    message_id   UUID REFERENCES ticket_messages(id) ON DELETE SET NULL,
    uploaded_by  UUID REFERENCES users(id),
    file_name    TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    storage_key  TEXT NOT NULL,                           -- path in S3 / Azure Blob
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_status_history (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    from_status  ticket_status,
    to_status    ticket_status NOT NULL,
    changed_by   UUID REFERENCES users(id),
    comment      TEXT,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_history_ticket_idx ON ticket_status_history (ticket_id, changed_at);

-- Log every status change automatically
CREATE OR REPLACE FUNCTION log_ticket_status() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO ticket_status_history (tenant_id, ticket_id, from_status, to_status, changed_by)
        VALUES (NEW.tenant_id, NEW.id, NULL, NEW.status, NEW.customer_id);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO ticket_status_history (tenant_id, ticket_id, from_status, to_status)
        VALUES (NEW.tenant_id, NEW.id, OLD.status, NEW.status);
        IF NEW.status = 'resolved' AND NEW.resolved_at IS NULL THEN NEW.resolved_at = now(); END IF;
        IF NEW.status = 'closed'   AND NEW.closed_at   IS NULL THEN NEW.closed_at   = now(); END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 5. CONTENT: FAQs, configuration videos, tutorials (multilingual)
-- ---------------------------------------------------------------------
CREATE TABLE content_categories (
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id   UUID REFERENCES content_categories(id),
    slug        TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE content_category_translations (
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    category_id UUID NOT NULL REFERENCES content_categories(id) ON DELETE CASCADE,
    language    language_code NOT NULL,
    name        TEXT NOT NULL,
    PRIMARY KEY (category_id, language)
);

CREATE TABLE content_items (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind           content_kind NOT NULL,
    category_id    UUID REFERENCES content_categories(id),
    device_model_id UUID REFERENCES device_models(id),    -- optional link to a model
    video_key      TEXT,                                  -- video ID in Cloudflare Stream (played via signed URL)
    thumbnail_url  TEXT,
    duration_sec   INT,
    is_published   BOOLEAN NOT NULL DEFAULT FALSE,
    visible_to_customers BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);
CREATE INDEX content_items_kind_idx ON content_items (kind, is_published);

CREATE TABLE content_translations (
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_id   UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    language     language_code NOT NULL,
    title        TEXT NOT NULL,                           -- FAQ question or video title
    body         TEXT,                                    -- FAQ answer or description
    subtitle_url TEXT,                                    -- per-language subtitles for videos
    PRIMARY KEY (content_id, language)
);

-- ---------------------------------------------------------------------
-- 6. AI ASSISTANT
-- ---------------------------------------------------------------------
CREATE TABLE ai_conversations (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT,
    language    language_code NOT NULL DEFAULT 'en',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    sender           ai_sender NOT NULL,
    body             TEXT NOT NULL,
    source_content_ids UUID[],                            -- FAQs/videos used to answer
    feedback         SMALLINT CHECK (feedback IN (-1, 1)),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conv_idx ON ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- 7. NOTIFICATIONS, AUDIT LOG, SETTINGS
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,                            -- e.g. 'ticket.status_changed'
    title       TEXT NOT NULL,
    body        TEXT,
    ticket_id   UUID REFERENCES tickets(id) ON DELETE CASCADE,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE audit_logs (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id     UUID REFERENCES users(id),
    action       TEXT NOT NULL,                           -- create / update / delete / login ...
    entity_type  TEXT NOT NULL,
    entity_id    TEXT,
    old_values   JSONB,
    new_values   JSONB,
    ip_address   INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_actor_idx  ON audit_logs (actor_id, created_at DESC);

CREATE TABLE settings (
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    key         TEXT NOT NULL,
    value       JSONB NOT NULL,
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. updated_at TRIGGERS
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_roles_upd     BEFORE UPDATE ON roles          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_companies_upd BEFORE UPDATE ON companies      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_upd     BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_models_upd    BEFORE UPDATE ON device_models  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_devices_upd   BEFORE UPDATE ON devices        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tickets_upd   BEFORE UPDATE ON tickets        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_content_upd   BEFORE UPDATE ON content_items  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ticket_status_ins AFTER INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION log_ticket_status();
CREATE TRIGGER trg_ticket_status_upd BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION log_ticket_status();

-- ---------------------------------------------------------------------
-- 7b. EXTERNAL PLATFORM DATA (staff only): lookup by SN, ticket and status sync.
-- The connection is OPTIONAL. Without it the service center works fully: staff type the same
-- fields in by hand (source = 'manual'), and nothing is queued for sending.
-- When an engineer applies (takes) a ticket, server code asks the connected platform for
-- the serial number and stores the answer here. This data is for engineers ONLY:
--   * it lives in its own table, with a staff-only row-level security policy;
--   * it is never copied into devices, tickets or any table a customer can read;
--   * customer endpoints (mobile app and customer web portal) never return it.
-- ---------------------------------------------------------------------
CREATE TABLE integrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    kind          TEXT NOT NULL CHECK (kind IN ('device_lookup', 'service_sync')),  -- read by SN / push tickets and status
    provider      TEXT NOT NULL DEFAULT 'onec',           -- 'onec' first; other platforms use the same connector interface
    name          TEXT NOT NULL,
    base_url      TEXT NOT NULL,
    auth_type     TEXT NOT NULL CHECK (auth_type IN ('api_key', 'bearer', 'basic', 'oauth2')),
    secret_ref    TEXT,                                   -- name of the secret in Supabase Vault; the secret itself is never stored here
    field_map     JSONB NOT NULL DEFAULT '{}'::jsonb,     -- how the other platform's fields map to ours
    is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    last_success_at TIMESTAMPTZ,
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integrations_tenant_kind_uq ON integrations (tenant_id, kind);
CREATE TRIGGER trg_integrations_upd BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE device_external_info (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    device_id      UUID NOT NULL REFERENCES devices(id),
    ticket_id      UUID REFERENCES tickets(id),           -- ticket that triggered the latest lookup
    serial_number  TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('ok', 'not_found', 'error')),
    source         TEXT NOT NULL DEFAULT 'integration' CHECK (source IN ('integration', 'manual')),  -- 'manual' = typed in by staff
    model_name     TEXT,
    sold_date      DATE,
    customer_name  TEXT,                                  -- buyer according to the other platform
    warranty_until DATE,
    raw_response   JSONB,
    error_message  TEXT,
    fetched_by     UUID REFERENCES users(id),
    fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),    -- when fetched, or when entered by hand (fetched_by = who)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Latest result per device (a refresh replaces it; each fetch is also written to audit_logs)
CREATE UNIQUE INDEX device_external_info_device_uq ON device_external_info (tenant_id, device_id);
CREATE TRIGGER trg_device_ext_info_upd BEFORE UPDATE ON device_external_info
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Link between one of our tickets and its service ticket in the other platform (1C).
-- Staff only; customers never see it.
CREATE TABLE ticket_external_refs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    ticket_id       UUID NOT NULL REFERENCES tickets(id),
    integration_id  UUID REFERENCES integrations(id),     -- NULL when the number was typed in by hand
    source          TEXT NOT NULL DEFAULT 'integration' CHECK (source IN ('integration', 'manual')),
    external_id     TEXT,                                 -- id of the document in 1C
    external_number TEXT,                                 -- number shown to staff, e.g. the 1C document number
    sync_status     TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'manual')),
    last_synced_at  TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ticket_external_refs_uq ON ticket_external_refs (ticket_id);   -- one link per ticket
CREATE TRIGGER trg_ticket_ext_refs_upd BEFORE UPDATE ON ticket_external_refs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Outbox: every change to send to the other platform is queued here in the same database
-- transaction as the change itself, then a background worker sends it with retries.
-- Nothing is lost if 1C is down; items are retried with growing delays and, after the
-- maximum attempts, marked 'dead' for an administrator to retry manually.
-- The outbox row id is sent to the other platform as the idempotency key (no duplicates).
CREATE TABLE integration_outbox (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq              BIGINT GENERATED ALWAYS AS IDENTITY,   -- send order: a status update never overtakes the create
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    integration_id   UUID NOT NULL REFERENCES integrations(id),
    ticket_id        UUID NOT NULL REFERENCES tickets(id),
    operation        TEXT NOT NULL CHECK (operation IN ('create_ticket', 'update_status')),
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
    attempts         INT NOT NULL DEFAULT 0,
    next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error       TEXT,
    sent_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The payload is built from fresh data at send time, so only ids are stored here.
CREATE INDEX integration_outbox_ticket_seq_idx ON integration_outbox (ticket_id, seq);
CREATE INDEX integration_outbox_due_idx ON integration_outbox (status, next_attempt_at)
    WHERE status IN ('pending', 'failed');
CREATE UNIQUE INDEX integration_outbox_create_once_uq
    ON integration_outbox (integration_id, ticket_id) WHERE operation = 'create_ticket';

-- INTERNAL DEVICE SERVICE STATUS (staff only).
-- Customers never read this table. They see only tickets.customer_device_status, which the
-- trigger below derives from the internal status:
--     in_progress          -> diagnose
--     done                 -> ready
--     rma                  -> pickup_new_device
--     repair_not_possible  -> repair_not_possible
-- Staff set it with set_device_service_status() (security file). Each change is also queued
-- for the connected platform (1C) when a connection is switched on.
CREATE TABLE ticket_service_state (
    ticket_id   UUID PRIMARY KEY REFERENCES tickets(id),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    status      device_service_status NOT NULL,
    comment     TEXT,                                     -- resolution comment, sent to 1C with final statuses
    changed_by  UUID REFERENCES users(id),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION on_service_state_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_int UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    -- what the customer sees
    UPDATE tickets
       SET customer_device_status = (CASE NEW.status
               WHEN 'in_progress'         THEN 'diagnose'
               WHEN 'done'                THEN 'ready'
               WHEN 'rma'                 THEN 'pickup_new_device'
               WHEN 'repair_not_possible' THEN 'repair_not_possible'
           END)::customer_device_status
     WHERE id = NEW.ticket_id;

    -- queue the status for the connected platform, if a connection is switched on
    SELECT id INTO v_int FROM integrations
     WHERE tenant_id = NEW.tenant_id AND kind = 'service_sync' AND is_enabled;
    IF v_int IS NOT NULL THEN
        INSERT INTO integration_outbox (tenant_id, integration_id, ticket_id, operation)
        VALUES (NEW.tenant_id, v_int, NEW.ticket_id, 'update_status');
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_service_state_change AFTER INSERT OR UPDATE OF status ON ticket_service_state
    FOR EACH ROW EXECUTE FUNCTION on_service_state_change();

-- When an engineer applies (takes) a ticket:
--  1. the device status starts as "in progress", so the customer sees "Diagnose" at once;
--  2. the service ticket is queued for creation in the connected platform (if switched on).
CREATE OR REPLACE FUNCTION on_ticket_applied() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_int UUID;
BEGIN
    IF NOT (OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL) THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_int FROM integrations
     WHERE tenant_id = NEW.tenant_id AND kind = 'service_sync' AND is_enabled;
    IF v_int IS NOT NULL THEN
        INSERT INTO integration_outbox (tenant_id, integration_id, ticket_id, operation)
        VALUES (NEW.tenant_id, v_int, NEW.id, 'create_ticket')
        ON CONFLICT (integration_id, ticket_id) WHERE operation = 'create_ticket' DO NOTHING;
    END IF;

    INSERT INTO ticket_service_state (ticket_id, tenant_id, status, changed_by)
    VALUES (NEW.id, NEW.tenant_id, 'in_progress', NEW.assigned_to)
    ON CONFLICT (ticket_id) DO NOTHING;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ticket_applied AFTER UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION on_ticket_applied();

-- ---------------------------------------------------------------------
-- 8a. LOGIN HISTORY (administrator-only menu) and IMMUTABLE RECORDS
-- Written by server code (service role) on every sign-in attempt and security event.
-- Timestamps are stored in UTC and shown in the viewer's local time.
-- ---------------------------------------------------------------------
CREATE TYPE login_event_type AS ENUM (
    'login_success', 'login_failed', 'logout',
    'password_changed', 'password_reset_requested',
    'mfa_enabled', 'mfa_disabled', 'mfa_failed',
    'account_locked', 'account_unlocked', 'session_revoked', 'new_device_login'
);

CREATE TABLE login_events (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    user_id          UUID REFERENCES users(id),            -- NULL if the email is unknown
    email_attempted  extensions.citext,
    event            login_event_type NOT NULL,
    client           TEXT CHECK (client IN ('web', 'ios', 'android')),
    ip_address       INET,
    user_agent       TEXT,
    device_label     TEXT,                                 -- e.g. "Chrome on Windows"
    country          TEXT,
    city             TEXT,
    failure_reason   TEXT,                                 -- wrong_password, locked, ip_blocked, mfa_failed ...
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_events_tenant_time_idx ON login_events (tenant_id, created_at DESC);
CREATE INDEX login_events_user_time_idx   ON login_events (user_id, created_at DESC);
CREATE INDEX login_events_event_idx       ON login_events (tenant_id, event, created_at DESC);

-- Login history and audit log can never be edited or deleted, even by server code
CREATE OR REPLACE FUNCTION prevent_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'records_are_immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER trg_login_events_immutable BEFORE UPDATE OR DELETE ON login_events
    FOR EACH ROW EXECUTE FUNCTION prevent_change();
CREATE TRIGGER trg_audit_logs_immutable   BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_change();

-- ---------------------------------------------------------------------
-- 8b. TENANT-SCOPED UNIQUE RULES AND INDEXES
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX roles_tenant_code_uq   ON roles (tenant_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX roles_one_admin_uq     ON roles (tenant_id) WHERE is_admin;       -- exactly one admin role per tenant
CREATE UNIQUE INDEX device_models_sku_uq   ON device_models (tenant_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX content_cat_slug_uq    ON content_categories (tenant_id, slug);
CREATE UNIQUE INDEX settings_tenant_key_uq ON settings (tenant_id, key);
CREATE UNIQUE INDEX serial_registry_uq     ON serial_number_registry (tenant_id, serial_number);

CREATE INDEX users_tenant_idx    ON users (tenant_id, kind, registration);
CREATE INDEX devices_tenant_idx  ON devices (tenant_id);
CREATE INDEX tickets_tenant_idx  ON tickets (tenant_id, status, priority);
CREATE INDEX content_tenant_idx  ON content_items (tenant_id, kind, is_published);
CREATE INDEX audit_tenant_idx    ON audit_logs (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 9. MENU CATALOGUE AND PERMISSIONS  (HARD RULE)
-- Every menu and every submenu has exactly three permissions: view, edit, delete.
--   view   = see the menu and its records
--   edit   = create and change records
--   delete = delete (soft delete) records, nothing else
-- The permission code is <menu key>.<level>, for example tickets.board.edit.
-- The database creates the three permissions automatically when a menu is added, so a
-- menu without permissions cannot exist. Menus are defined by the platform and shared by
-- all tenants; each tenant's administrator decides which role gets which permission.
-- Menus marked admin_only still have the three permissions, but they can never be granted
-- to any role except the Administrator.
-- ---------------------------------------------------------------------
CREATE TABLE menus (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,                   -- e.g. 'tickets.board'
    parent_id   UUID REFERENCES menus(id),              -- submenu -> menu
    app         TEXT NOT NULL CHECK (app IN ('web', 'customer', 'both')),
    name        TEXT NOT NULL,                          -- English default; translated in the apps
    sort_order  INT NOT NULL DEFAULT 0,
    admin_only  BOOLEAN NOT NULL DEFAULT FALSE,         -- not delegable (login security, login history, integrations)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE permissions
    ADD CONSTRAINT permissions_level_chk CHECK (action IN ('view', 'edit', 'delete')),
    ADD CONSTRAINT permissions_menu_fk   FOREIGN KEY (resource) REFERENCES menus(key);

CREATE OR REPLACE FUNCTION create_menu_permissions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO permissions (code, resource, action, description)
    SELECT NEW.key || '.' || l, NEW.key, l, initcap(l) || ' - ' || NEW.name
    FROM unnest(ARRAY['view', 'edit', 'delete']) AS l;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_menu_permissions AFTER INSERT ON menus
    FOR EACH ROW EXECUTE FUNCTION create_menu_permissions();

-- Menus and permissions are permanent
CREATE TRIGGER trg_menus_no_delete       BEFORE DELETE ON menus
    FOR EACH ROW EXECUTE FUNCTION prevent_change();
CREATE TRIGGER trg_permissions_no_delete BEFORE DELETE ON permissions
    FOR EACH ROW EXECUTE FUNCTION prevent_change();

-- Safety check for tests / CI: returns a row for every menu that lacks view, edit or delete.
-- It must always return zero rows.
CREATE OR REPLACE FUNCTION assert_menu_permissions() RETURNS TABLE (menu_key TEXT, missing TEXT[])
LANGUAGE sql STABLE AS $$
    SELECT t.key, t.missing
    FROM (SELECT m.key,
                 ARRAY(SELECT l FROM unnest(ARRAY['view', 'edit', 'delete']) AS l
                       WHERE NOT EXISTS (SELECT 1 FROM permissions p
                                         WHERE p.resource = m.key AND p.action = l)) AS missing
          FROM menus m) t
    WHERE cardinality(t.missing) > 0;
$$;

-- Top-level menus
INSERT INTO menus (key, app, name, sort_order, admin_only) VALUES
 ('dashboard', 'web', 'Dashboard', 10, FALSE),
 ('tickets', 'web', 'Tickets', 20, FALSE),
 ('devices', 'web', 'Devices', 30, FALSE),
 ('customers', 'web', 'Customers', 40, FALSE),
 ('content', 'web', 'Content', 50, FALSE),
 ('ai', 'web', 'AI Assistant', 60, FALSE),
 ('reports', 'web', 'Reports', 70, FALSE),
 ('admin', 'web', 'Administration', 80, FALSE),
 ('notifications', 'both', 'Notifications', 90, FALSE),
 ('profile', 'both', 'Profile and settings', 100, FALSE),
 ('my.home', 'customer', 'Home', 110, FALSE),
 ('my.tickets', 'customer', 'My tickets', 120, FALSE),
 ('my.devices', 'customer', 'My devices', 130, FALSE),
 ('my.help', 'customer', 'Help center', 140, FALSE),
 ('my.ai', 'customer', 'AI assistant', 150, FALSE);

-- Submenus
INSERT INTO menus (key, parent_id, app, name, sort_order, admin_only)
SELECT v.key, p.id, v.app, v.name, v.sort_order, v.admin_only
FROM (VALUES
 ('tickets.board', 'tickets', 'web', 'Kanban board', 1, FALSE),
 ('tickets.external_info', 'tickets', 'web', 'External device data', 2, FALSE),
 ('devices.models', 'devices', 'web', 'Device models', 1, FALSE),
 ('devices.serial_import', 'devices', 'web', 'Serial number import', 2, FALSE),
 ('devices.claims', 'devices', 'web', 'Ownership requests', 3, FALSE),
 ('customers.companies', 'customers', 'web', 'Companies', 1, FALSE),
 ('customers.registrations', 'customers', 'web', 'Pending registrations', 2, FALSE),
 ('content.library', 'content', 'web', 'Content library', 1, FALSE),
 ('content.categories', 'content', 'web', 'Categories', 2, FALSE),
 ('ai.assistant', 'ai', 'web', 'Assistant', 1, FALSE),
 ('ai.knowledge', 'ai', 'web', 'Knowledge status', 2, FALSE),
 ('admin.users', 'admin', 'web', 'Users', 1, FALSE),
 ('admin.roles', 'admin', 'web', 'Roles and permissions', 2, FALSE),
 ('admin.audit', 'admin', 'web', 'Audit log', 3, FALSE),
 ('admin.settings', 'admin', 'web', 'System settings', 4, FALSE),
 ('admin.trash', 'admin', 'web', 'Trash and recovery', 5, FALSE),
 ('admin.integrations', 'admin', 'web', 'Integrations', 6, TRUE),
 ('admin.login_security', 'admin', 'web', 'Login security', 7, TRUE),
 ('admin.login_history', 'admin', 'web', 'Login history', 8, TRUE)
) AS v(key, parent_key, app, name, sort_order, admin_only)
JOIN menus p ON p.key = v.parent_key;

-- ---------------------------------------------------------------------
-- 10. NEW-TENANT SETUP
-- The Administrator role is NOT given rows in role_permissions: it is fixed by the platform
-- and always has every permission, including those of menus added in the future.
-- Every other role below is only a starting template; the administrator can edit, delete
-- or replace them, and create new roles. data_scope 'own' means "only my own or assigned
-- records" (for example an engineer sees only tickets assigned to them).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_tenant_defaults(p_tenant UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO roles (tenant_id, code, name, description, is_system, is_admin) VALUES
     (p_tenant, 'admin',    'Administrator',   'Fixed by the platform: full access to everything, cannot be edited or deleted', TRUE,  TRUE),
     (p_tenant, 'ceo',      'CEO',             'Starting template: read-only dashboards and reports',  FALSE, FALSE),
     (p_tenant, 'manager',  'Service Manager', 'Starting template: tickets, engineers, registrations, content', FALSE, FALSE),
     (p_tenant, 'engineer', 'Service Engineer','Starting template: handles assigned tickets',          FALSE, FALSE),
     (p_tenant, 'customer', 'Customer',        'Reseller, installer or company (mobile app and web portal)', TRUE, FALSE);

    INSERT INTO role_permissions (role_id, permission_id, data_scope)
    SELECT r.id, p.id, t.scope
    FROM (VALUES
      ('ceo', 'dashboard.view', 'all'),
      ('ceo', 'tickets.view', 'all'),
      ('ceo', 'devices.view', 'all'),
      ('ceo', 'customers.view', 'all'),
      ('ceo', 'customers.companies.view', 'all'),
      ('ceo', 'content.view', 'all'),
      ('ceo', 'content.library.view', 'all'),
      ('ceo', 'ai.view', 'all'),
      ('ceo', 'ai.assistant.view', 'all'),
      ('ceo', 'ai.assistant.edit', 'all'),
      ('ceo', 'reports.view', 'all'),
      ('ceo', 'notifications.view', 'all'),
      ('ceo', 'notifications.edit', 'all'),
      ('ceo', 'profile.view', 'all'),
      ('ceo', 'profile.edit', 'all'),
      ('manager', 'dashboard.view', 'all'),
      ('manager', 'tickets.view', 'all'),
      ('manager', 'tickets.edit', 'all'),
      ('manager', 'tickets.board.view', 'all'),
      ('manager', 'tickets.board.edit', 'all'),
      ('manager', 'tickets.external_info.view', 'all'),
      ('manager', 'tickets.external_info.edit', 'all'),
      ('manager', 'devices.view', 'all'),
      ('manager', 'devices.edit', 'all'),
      ('manager', 'devices.models.view', 'all'),
      ('manager', 'devices.models.edit', 'all'),
      ('manager', 'devices.serial_import.view', 'all'),
      ('manager', 'devices.serial_import.edit', 'all'),
      ('manager', 'devices.claims.view', 'all'),
      ('manager', 'devices.claims.edit', 'all'),
      ('manager', 'customers.view', 'all'),
      ('manager', 'customers.companies.view', 'all'),
      ('manager', 'customers.companies.edit', 'all'),
      ('manager', 'customers.registrations.view', 'all'),
      ('manager', 'customers.registrations.edit', 'all'),
      ('manager', 'content.view', 'all'),
      ('manager', 'content.library.view', 'all'),
      ('manager', 'content.library.edit', 'all'),
      ('manager', 'content.library.delete', 'all'),
      ('manager', 'content.categories.view', 'all'),
      ('manager', 'content.categories.edit', 'all'),
      ('manager', 'content.categories.delete', 'all'),
      ('manager', 'ai.view', 'all'),
      ('manager', 'ai.assistant.view', 'all'),
      ('manager', 'ai.assistant.edit', 'all'),
      ('manager', 'ai.knowledge.view', 'all'),
      ('manager', 'ai.knowledge.edit', 'all'),
      ('manager', 'reports.view', 'all'),
      ('manager', 'notifications.view', 'all'),
      ('manager', 'notifications.edit', 'all'),
      ('manager', 'profile.view', 'all'),
      ('manager', 'profile.edit', 'all'),
      ('engineer', 'dashboard.view', 'all'),
      ('engineer', 'tickets.view', 'own'),
      ('engineer', 'tickets.edit', 'own'),
      ('engineer', 'tickets.external_info.view', 'all'),
      ('engineer', 'tickets.external_info.edit', 'all'),
      ('engineer', 'devices.view', 'all'),
      ('engineer', 'content.view', 'all'),
      ('engineer', 'content.library.view', 'all'),
      ('engineer', 'ai.view', 'all'),
      ('engineer', 'ai.assistant.view', 'all'),
      ('engineer', 'ai.assistant.edit', 'all'),
      ('engineer', 'notifications.view', 'all'),
      ('engineer', 'notifications.edit', 'all'),
      ('engineer', 'profile.view', 'all'),
      ('engineer', 'profile.edit', 'all'),
      ('customer', 'my.home.view', 'own'),
      ('customer', 'my.tickets.view', 'own'),
      ('customer', 'my.tickets.edit', 'own'),
      ('customer', 'my.devices.view', 'own'),
      ('customer', 'my.devices.edit', 'own'),
      ('customer', 'my.help.view', 'own'),
      ('customer', 'my.ai.view', 'own'),
      ('customer', 'my.ai.edit', 'own'),
      ('customer', 'notifications.view', 'own'),
      ('customer', 'notifications.edit', 'own'),
      ('customer', 'profile.view', 'own'),
      ('customer', 'profile.edit', 'own')
    ) AS t(role_code, perm_code, scope)
    JOIN roles r       ON r.tenant_id = p_tenant AND r.code = t.role_code
    JOIN permissions p ON p.code = t.perm_code;

    INSERT INTO settings (tenant_id, key, value) VALUES
     (p_tenant, 'device_claim_mode', '"staff_approval"'),         -- or "auto_transfer"
     (p_tenant, 'login_security', '{
        "password_min_length": 10,
        "mfa_required_for_admin": true,
        "mfa_required_for_staff": false,
        "max_failed_attempts": 5,
        "lockout_minutes": 15,
        "session_idle_minutes": 30,
        "session_max_hours": 12,
        "ip_allowlist_enabled": false,
        "ip_allowlist": [],
        "alert_on_new_device": true
     }'::jsonb);
END;
$$;

-- First tenant (your own company). More tenants are added later with the same two steps.
INSERT INTO tenants (name, slug) VALUES ('Default company', 'default');
SELECT seed_tenant_defaults(id) FROM tenants WHERE slug = 'default';

COMMIT;
