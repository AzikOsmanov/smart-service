# Smart Service System: API Endpoint List (v1)

Base URL: `/api/v1`  
Format: JSON over HTTPS. Auth: `Authorization: Bearer <JWT>`.  
Language: client sends `Accept-Language: en | az | ru`; content endpoints return the matching translation (fallback: `en`).

**Legend:** 🌐 Staff (web app) · 📱 Customer (mobile app **and** customer web portal, same endpoints) · 🔓 Public (no token)  
The **Permission** column shows the menu permission the API checks on every request. **Every menu and submenu has exactly three permissions: `view`, `edit`, `delete`** (code = `<menu>.<level>`). `edit` covers creating and changing, `delete` covers every DELETE endpoint (a soft delete), and `delete` implies `edit`, which implies `view`. Customers use the `my.*` menus. The full list is in the menu catalogue in `smart_service_screens.md`.

---

## 1. Authentication

| Method | Endpoint | Who | Description |
|---|---|---|---|
| POST | `/auth/register` | 🔓 📱 | Customer registration (reseller / installer / company). Creates user + company with status `pending`. **Required:** `tenant` (resolved automatically from the web address or app build), `account_type`, `first_name`, `last_name`, `email`, `phone`, `password`, `company_name`, `city`. Optional: `country`, `tax_id`. Returns `422` if `company_name` or `city` is missing |
| POST | `/auth/login` | 🔓 | Email + password, returns access + refresh tokens |
| POST | `/auth/refresh` | 🔓 | Exchange refresh token for new access token |
| POST | `/auth/logout` | 🌐 📱 | Revoke refresh token and push token |
| POST | `/auth/forgot-password` | 🔓 | Send reset link / code |
| POST | `/auth/reset-password` | 🔓 | Set new password with reset token |
| POST | `/auth/verify-email` | 🔓 | Confirm email with code |
| POST | `/auth/resend-verification` | 🔓 | Resend verification code |
| POST | `/auth/change-password` | 🌐 📱 | Change password while logged in |

## 2. Profile and preferences

| Method | Endpoint | Who | Description |
|---|---|---|---|
| GET | `/me` | 🌐 📱 | Current user, roles, permissions, company |
| PATCH | `/me` | 🌐 📱 | Update name, phone |
| PATCH | `/me/preferences` | 🌐 📱 | Language (`en/az/ru`) and theme (`light/dark/system`) |
| POST | `/me/push-tokens` | 📱 | Register device push token (FCM/APNs) |
| DELETE | `/me/push-tokens/{token}` | 📱 | Remove push token |

## 3. Devices

| Method | Endpoint | Who | Permission | Description |
|---|---|---|---|---|
| GET | `/devices` | 🌐 📱 | `my.devices.view` (customer) / `devices.view` (staff) | Customers see only devices they own or **used to own** (transferred devices stay as read-only history). Filter `scope=current\|former`. New tickets can only be created for current devices. Staff can search all |
| POST | `/devices` | 📱 🌐 | `my.devices.edit` (customer) / `devices.edit` (staff) | Add device by serial number (checks `serial_number_registry`). Sets `owner_id` to the logged-in customer. If the SN is already registered by another user, returns `409` with a "contact support" message and does not reveal who owns it |
| GET | `/devices/{id}` | 🌐 📱 | same | Device details, model, warranty, ticket history |
| PATCH | `/devices/{id}` | 🌐 | `devices.edit` | Edit device |
| DELETE | `/devices/{id}` | 🌐 | `devices.delete` | Soft delete |
| GET | `/devices/lookup?sn=...` | 📱 | `my.devices.view` | Validate a serial number before adding (shows model + warranty) |
| GET | `/device-models` | 🌐 📱 | `my.devices.view` / `devices.models.view` | List models |
| POST / PATCH / DELETE | `/device-models[/{id}]` | 🌐 | `devices.models.edit` / `devices.models.delete` | Manage models |
| POST | `/devices/claims` | 📱 | `my.devices.edit` | Request ownership of a device already registered by another user. Body: `serial_number`, `label_photo` (storage key). Returns `pending` or, in auto mode, `approved` |
| GET | `/devices/claims` | 📱 🌐 | own / `devices.claims.view` | Customers see their own requests and status; reviewers see the queue |
| POST | `/devices/claims/{id}/review` | 🌐 | `devices.claims.edit` | Approve or reject (`approve`, `note`). Approval moves the device to the claimant and writes the audit log. The previous owner keeps read-only access to the device record and keeps all their tickets |
| POST | `/serial-numbers/import` | 🌐 | `devices.serial_import.edit` | Bulk import official SN list (CSV) |

## 4. Tickets

| Method | Endpoint | Who | Permission | Description |
|---|---|---|---|---|
| POST | `/tickets` | 📱 | `my.tickets.edit` | Create ticket (`device_id`, subject, description, attachments). The device must belong to the logged-in customer, otherwise `403` |
| GET | `/tickets` | 🌐 📱 | `tickets.view` (staff) / `my.tickets.view` (customer) | List with filters: `status`, `priority`, `assigned_to`, `company_id`, `device_id`, `q`, `from`, `to`, paging, sort |
| GET | `/tickets/{id}` | 🌐 📱 | same | Ticket details (internal notes hidden from customers) |
| PATCH | `/tickets/{id}` | 🌐 | `tickets.edit` | Change subject, priority, due date |
| POST | `/tickets/{id}/assign` | 🌐 | `tickets.edit` | Assign or reassign engineer. Starts the external lookup if no result is stored yet |
| POST | `/tickets/{id}/claim` | 🌐 | `tickets.edit` | Engineer picks an unassigned ticket. Starts the external serial-number lookup (section 14) |
| POST | `/tickets/{id}/status` | 🌐 | `tickets.edit` | Change status (validated transitions; `comment` optional) |
| POST | `/tickets/{id}/close` | 🌐 | `tickets.edit` | Close ticket |
| POST | `/tickets/{id}/reopen` | 🌐 📱 | `tickets.edit` / owner | Reopen a resolved ticket |
| POST | `/tickets/{id}/rating` | 📱 | owner | Customer satisfaction 1-5 |
| DELETE | `/tickets/{id}` | 🌐 | `tickets.delete` | Soft delete |
| GET | `/tickets/{id}/history` | 🌐 📱 | same | Status timeline |
| GET | `/tickets/{id}/external-info` | 🌐 **staff only** | `tickets.external_info.view` | Stored result from the connected platform: model, sold date, customer name, warranty date, fetched at, status. Customers get `403` |
| GET | `/tickets/{id}/service-status` | 🌐 **staff only** | `tickets.view` | Internal device service status and comment. Customers get `403` |
| POST | `/tickets/{id}/service-status` | 🌐 **staff only** | `tickets.edit` | Body: `status` (`in_progress` / `done` / `rma` / `repair_not_possible`), optional `comment`. Saves the internal status, updates the status the customer sees (section 14d), and queues it for the connected platform if one is switched on |
| POST | `/tickets/{id}/external-sync/retry` | 🌐 **staff only** | `tickets.external_info.edit` | Retry a failed send to the connected platform |
| PUT | `/tickets/{id}/external-info/manual` | 🌐 **staff only** | `tickets.external_info.edit` | **Manual mode.** Body: `model_name`, `warranty_until`, `sold_date`, `customer_name`. Saves the device data typed in by hand (source `manual`) and writes an audit record. Works with or without a connection |
| PUT | `/tickets/{id}/external-ref/manual` | 🌐 **staff only** | `tickets.external_info.edit` | **Manual mode.** Body: `number` of the service ticket in 1C (or another platform) typed in by hand |
| GET | `/integrations/state` | 🌐 staff | any staff | Whether the lookup and the ticket sync are switched on, so screens show the right form. Settings stay administrator only |
| POST | `/tickets/{id}/external-info/refresh` | 🌐 **staff only** | `tickets.external_info.edit` | Ask the connected platform again. A manual entry is kept unless the body has `replace_manual: true` |

**Allowed status transitions**

```
new → assigned → in_progress ⇄ waiting_customer → resolved → closed
resolved → in_progress (reopen)
```

### Ticket messages and attachments

| Method | Endpoint | Who | Description |
|---|---|---|---|
| GET | `/tickets/{id}/messages` | 🌐 📱 | Paged message list (customers never see `is_internal`) |
| POST | `/tickets/{id}/messages` | 🌐 📱 | Send message (`is_internal` allowed for staff only) |
| DELETE | `/tickets/{id}/messages/{msgId}` | 🌐 | Soft delete message (`tickets.delete`) |
| POST | `/tickets/{id}/attachments/presign` | 🌐 📱 | Get pre-signed upload URL (client uploads straight to S3/Blob) |
| POST | `/tickets/{id}/attachments` | 🌐 📱 | Confirm upload and register file |
| GET | `/attachments/{id}/download` | 🌐 📱 | Short-lived download URL |

**Real-time (WebSocket / SignalR hub `/hubs/tickets`)**

- Client → server: `JoinTicket(ticketId)`, `Typing(ticketId)`
- Server → client: `MessageReceived`, `TicketStatusChanged`, `TicketAssigned`

## 5. Knowledge content (FAQs, videos, tutorials)

| Method | Endpoint | Who | Permission | Description |
|---|---|---|---|---|
| GET | `/content` | 🌐 📱 | `content.library.view` (staff) / `my.help.view` (customer) | Filters: `kind` (faq / config_video / tutorial_video / document), `category_id`, `device_model_id`, `q` |
| GET | `/content/{id}` | 🌐 📱 | `content.library.view` (staff) / `my.help.view` (customer) | Item in the requested language; video returns a short-lived signed playback URL (HLS) from Cloudflare Stream |
| POST | `/content` | 🌐 | `content.library.edit` | Create item with translations for en/az/ru |
| PATCH | `/content/{id}` | 🌐 | `content.library.edit` | Edit, publish / unpublish |
| DELETE | `/content/{id}` | 🌐 | `content.library.delete` | Soft delete |
| POST | `/content/{id}/video/presign` | 🌐 | `content.library.edit` | Direct-upload URL for Cloudflare Stream (the file goes from the browser straight to the video service) |
| GET | `/content-categories` | 🌐 📱 | `content.categories.view` / `my.help.view` | Category tree |
| POST / PATCH / DELETE | `/content-categories[/{id}]` | 🌐 | `content.categories.edit` / `content.categories.delete` | Manage categories |

## 6. AI assistant

| Method | Endpoint | Who | Permission | Description |
|---|---|---|---|---|
| POST | `/ai/conversations` | 🌐 📱 | `ai.assistant.edit` | Start conversation |
| GET | `/ai/conversations` | 🌐 📱 | `ai.assistant.view` | List own conversations |
| GET | `/ai/conversations/{id}/messages` | 🌐 📱 | `ai.assistant.view` | Message history |
| POST | `/ai/conversations/{id}/messages` | 🌐 📱 | `ai.assistant.edit` | Ask a question. Answer is streamed (SSE) and includes `source_content_ids` (FAQs/videos used) |
| POST | `/ai/messages/{id}/feedback` | 🌐 📱 | `ai.assistant.edit` | 👍 / 👎 |
| POST | `/ai/conversations/{id}/create-ticket` | 📱 | `my.tickets.edit` | Escalate to a ticket when AI can't solve it |
| POST | `/ai/reindex` | 🌐 | `ai.knowledge.edit` | Rebuild the AI knowledge index after content changes |

## 7. Notifications

| Method | Endpoint | Who | Description |
|---|---|---|---|
| GET | `/notifications` | 🌐 📱 | Paged list, filter `is_read` |
| GET | `/notifications/unread-count` | 🌐 📱 | Badge number |
| POST | `/notifications/{id}/read` | 🌐 📱 | Mark one as read |
| POST | `/notifications/read-all` | 🌐 📱 | Mark all as read |

## 8. Administration (web only)

### Users and registrations

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/admin/users` | `admin.users.view` | Search / filter by `kind`, role, status, company |
| POST | `/admin/users` | `admin.users.edit` | Create staff or customer |
| GET | `/admin/users/{id}` | `admin.users.view` | Details |
| PATCH | `/admin/users/{id}` | `admin.users.edit` | Edit, activate / deactivate |
| DELETE | `/admin/users/{id}` | `admin.users.delete` | Soft delete |
| PUT | `/admin/users/{id}/roles` | `admin.roles.edit` | Set user's roles |
| POST | `/admin/users/{id}/reset-password` | `admin.users.edit` | Force password reset |
| GET | `/admin/registrations` | `customers.registrations.view` | Pending customer registrations of the caller's tenant. Every new reseller, installer or company waits here; the **administrator or a service manager** (if the administrator granted the permission) decides |
| POST | `/admin/registrations/{id}/approve` | `customers.registrations.edit` | Approve (sends email + push) |
| POST | `/admin/registrations/{id}/reject` | `customers.registrations.edit` | Reject with reason |
| POST | `/admin/users/{id}/suspend` | `admin.users.edit` | Suspend customer access |

### Companies

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET / POST | `/admin/companies` | `customers.companies.view` / `customers.companies.edit` | List / create |
| GET / PATCH / DELETE | `/admin/companies/{id}` | `customers.companies.view` / `customers.companies.edit` / `customers.companies.delete` | Details / edit / soft delete |

### Roles and permissions

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/admin/roles` | `admin.roles.view` | List roles with permission counts |
| POST | `/admin/roles` | `admin.roles.edit` | Create custom role |
| PATCH | `/admin/roles/{id}` | `admin.roles.edit` | Rename / describe |
| DELETE | `/admin/roles/{id}` | `admin.roles.delete` | Delete (blocked for the Administrator and other built-in roles, and for roles still assigned) |
| GET | `/admin/permissions` | `admin.roles.view` | Full permission catalogue |
| PUT | `/admin/roles/{id}/permissions` | `admin.roles.edit` | Replace role's permission set. The **Administrator role is fixed by the platform** and rejects any edit (`403 role_protected`): it always has every permission, including future ones |

### System

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/admin/audit-logs` | `admin.audit.view` | Filter by actor, entity, action, date |
| GET / PUT | `/admin/settings` | `admin.settings.view` / `admin.settings.edit` | System settings (SLA hours, email templates, upload limits) |

### Login security and login history (administrator only)

These are **not delegable**: they check for the Administrator role itself, not a permission code, so no other role can be given access. Everyone else receives `403`. Every change writes an audit record with date and time.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/security/settings` | Current login security settings |
| PUT | `/admin/security/settings` | Change: password minimum length, two-factor rules (admin / staff), failed-attempt limit, lockout minutes, idle timeout, maximum session length, IP allow-list for staff, new-device alerts |
| GET | `/admin/security/sessions` | Active sessions (user, device, browser, IP, started, last seen). Filter by user |
| DELETE | `/admin/security/sessions/{id}` | Sign one session out |
| POST | `/admin/security/users/{id}/sign-out-everywhere` | End all sessions of a user |
| GET | `/admin/security/locked-accounts` | Accounts locked after failed attempts |
| POST | `/admin/security/users/{id}/unlock` | Unlock an account |
| GET | `/admin/security/mfa` | Two-factor status per staff user |
| POST | `/admin/security/users/{id}/reset-mfa` | Reset a user's two-factor setup |
| GET | `/admin/login-history` | Filters: `user_id`, `event`, `result` (success / failed), `client` (web / ios / android), `ip`, `from`, `to`, paging. Newest first |
| GET | `/admin/login-history/export?format=xlsx\|csv` | Export the filtered list |

**Events recorded:** successful and failed sign-in, sign-out, password change and reset request, two-factor enabled / disabled / failed, account locked / unlocked, session revoked, sign-in from a new device.

**How it is recorded:** sign-in goes through the server route `/auth/login` (not straight from the app to Supabase), so every attempt, including failures for unknown emails, is logged and the lockout and IP rules are enforced. Each record stores date and time (UTC, shown in the viewer's time zone), user, client (web / iOS / Android), IP address, approximate location, browser or device, and the failure reason.

**Immutable:** login history and the audit log cannot be edited or deleted by anyone. The database rejects it.

## 9. Reports and dashboards (CEO / manager)

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/reports/overview` | `reports.view` | Open / closed tickets, average first response, average resolution time |
| GET | `/reports/tickets-by-status` | `reports.view` | Counts per status for a date range |
| GET | `/reports/engineer-performance` | `reports.view` | Tickets handled, resolution time, ratings per engineer |
| GET | `/reports/by-company` | `reports.view` | Ticket volume per reseller / installer / company |
| GET | `/reports/by-device-model` | `reports.view` | Most problematic models |
| GET | `/reports/sla` | `reports.view` | SLA breaches |
| GET | `/reports/export?type=...&format=xlsx\|pdf` | `reports.view` | Export report |

## 10. Standard conventions

- **Pagination:** `?page=1&page_size=25`, response `{ data: [], page, page_size, total }`
- **Errors:** `{ "error": { "code": "ticket.invalid_transition", "message": "...", "details": {} } }`  
  Codes: `400` validation · `401` not logged in · `403` no permission · `404` not found · `409` conflict (e.g. duplicate SN) · `429` rate limit
- **Dates:** ISO 8601, UTC. **Every record has a creation date and time** (`created_at`); records that change also have `updated_at`. Screens show times in the viewer's local time zone.
- **IDs:** UUIDs. Tickets also expose a readable `ticket_no`.
- **Rate limiting:** stricter on `/auth/*` and `/ai/*`.
- **Customer web portal:** customers log in from a browser with the same `/auth/*` endpoints. Allow the web origin in CORS, and register web push tokens with `platform: "web"`. Customers get `403` on every `/admin/*`, `/reports/*` and staff-only endpoint, so no extra API is needed.
- **Session length:** office browsers are often shared or left open, so use short-lived access tokens with refresh and add an idle-timeout on the web.
- **Audit:** every `POST / PATCH / PUT / DELETE` under `/admin/*` writes to `audit_logs`.
- **Versioning:** breaking changes go to `/api/v2`. Mobile apps in the wild can't be force-updated instantly, so keep v1 alive.
- **Docs:** generate an OpenAPI (Swagger) spec from the code so the web and mobile teams can generate typed clients.

## 11. Suggested build order

1. Auth, `/me`, preferences
2. Admin: users, roles, permissions, registrations, audit
3. Devices and serial numbers
4. Tickets, messages, attachments, real-time hub
5. Notifications and push
6. Content (FAQ / videos) and categories
7. AI assistant
8. Reports

## 12. Implementation on Supabase, Vercel and Cloudflare

| Part | Where it runs | Notes |
|---|---|---|
| Database, login, storage, real-time chat | **Supabase** | Customers and staff read and write many tables directly, protected by row-level security (`smart_service_rls_and_functions.sql`) |
| Routes that only read or write one user's own data (devices, tickets, messages, notifications, content reads, profile) | Supabase direct calls | No custom server code needed; the endpoint list above is the contract |
| Registration | Supabase Auth + signup trigger | `supabase.auth.signUp()` with company name, city and other fields as metadata |
| Device claims | Database functions | `submit_device_claim`, `review_device_claim` |
| Admin actions (create staff, approve registrations, roles, settings, audit) | Server code on **Vercel** (service role) | Checks the permission, performs the change, writes `audit_logs` |
| AI assistant, reports, exports, push notifications, email | Server code on **Vercel** / Supabase Edge Functions | Needs secret keys that must never be in the apps |
| Web app (staff and customer portal) | **Vercel** | One Next.js app, two layouts by user type |
| Video | **Cloudflare Stream** | Signed, short-lived playback URLs; subtitles in en / az / ru |
| Mobile app | React Native (Expo) | Uses the same Supabase calls; store release via App Store / Google Play |

**Setting `device_claim_mode`:** `staff_approval` (default) or `auto_transfer`. Changed by the administrator in System settings.

## 13. Multi-tenant platform

**What a tenant is:** one company running its own service center on the platform, with its own staff, customers, devices, tickets, content, roles, settings and branding. Tenants never see each other's data.

| Topic | Rule |
|---|---|
| Isolation | Every business table has `tenant_id`; row-level security limits each user to their own tenant. A suspended tenant gets no access at all |
| Which tenant | Resolved from the web address (for example `acme.yourplatform.com`) or from the app build / link. Sent as `tenant` at registration and fixed to the account afterwards |
| Users | In v1 one account belongs to **one** tenant (login email is unique across the platform) |
| Roles | Each tenant has its own roles. The **Administrator** role is fixed by the platform. Every other role and permission is created and edited by that tenant's administrator |
| Serial numbers | Unique **within a tenant**, not across tenants |
| Settings | Per tenant (for example `device_claim_mode`, SLA times, branding, default language) |
| Files | Storage paths start with the tenant id |
| Admin code | Server code always takes the tenant from the caller's login, never from the request body |

### Platform owner endpoints (you, not tenant administrators)

Separate platform console, server-only, never exposed to tenant users.

| Method | Endpoint | Description |
|---|---|---|
| GET / POST | `/platform/tenants` | List / create a tenant. Creating runs `seed_tenant_defaults()` and creates the first administrator |
| GET / PATCH | `/platform/tenants/{id}` | View / edit name, slug, branding, default language |
| POST | `/platform/tenants/{id}/suspend` | Suspend or reactivate a tenant |
| GET | `/platform/usage` | Tickets, users and storage per tenant (for future billing) |

### Not in v1 (planned for later)
- One person belonging to several tenants
- Custom domains per tenant
- Per-tenant billing and plans
- Full white-label branding beyond logo and colors

## 14. External device lookup (staff only)

**Purpose:** when an engineer applies (takes) a ticket, our server asks another platform for the device's serial number and shows the engineer the model, sold date, customer name and warranty date.

**Who sees it: engineers and other staff with `tickets.external_info.view`, and nobody else.**

| Rule | How it is enforced |
|---|---|
| Never visible to customers (mobile app or customer web portal) | Stored in its own table with a staff-only security policy. Customer endpoints never read it |
| Never mixed into customer data | Not copied into `devices`, `tickets` or any table customers can read. The customer's own warranty field (from our imported serial list, if used) stays separate |
| Not used when a customer adds a device | `/devices/lookup` uses only our own data, so nothing from the other platform appears while adding a device or creating a ticket |
| Server-side only | The call runs on our server. The other platform's key is kept in Supabase Vault and never reaches any app |
| The lookup changes nothing | Reading by serial number never changes anything in the other platform. Writing is limited to creating the service ticket and sending the device status (section 14b) |
| Failure-safe | If the other platform is slow or down, the ticket still works. The panel shows "data unavailable" with a Retry button. Requests have a timeout and a rate limit |
| Traceable | Each lookup is written to `audit_logs` with date, time and the engineer who triggered it |
| Per tenant | Each tenant connects its own platform and field mapping |

**Flow**
1. Customer creates a ticket. Engineers see it in the queue.
2. Engineer clicks **Apply** (`/tickets/{id}/claim`). The server fetches the serial number from the connected platform and saves the result.
3. The ticket's side panel shows it with "fetched at". **Refresh** fetches again.
4. If the sold-to name differs from the customer who registered the device, the panel flags it for the engineer.

**Integration settings (administrator only)**

| Method | Endpoint | Description |
|---|---|---|
| GET / PUT | `/admin/integrations/device-lookup` | Address, login method, secret reference, field mapping, enable / disable |
| POST | `/admin/integrations/device-lookup/test` | Test with a sample serial number |

**To be defined once we know the other platform:** its address and API documentation, login method (API key, token, OAuth), how to look up a serial number, and how its field names map to ours. If it has no API, a scheduled file import can fill the same table.

## 15. Menu permissions (hard rule)

**Rule:** every menu and every submenu, in every app, has the permissions `view`, `edit` and `delete`. No menu can exist without them: the database creates the three permissions automatically when a menu is added, and a check (`assert_menu_permissions()`) must return zero rows in every test run.

| Level | Allows |
|---|---|
| `view` | See the menu and read its records |
| `edit` | Create and change records (includes view) |
| `delete` | Delete records, always as a soft delete that can be restored from Trash (includes edit and view) |

**Data scope.** For each permission the administrator also chooses **All records** or **Own records only**. For example the Service Engineer template has `tickets.view` and `tickets.edit` with *own*, so engineers see and change only tickets assigned to them, while managers have *all*.

**Admin-only menus.** Integrations, Login security and Login history also have the three permissions, but they can never be granted to any role except the Administrator. The database rejects it.

**The Administrator role** always has every permission of every menu, including menus added in the future.

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/me` | any logged-in user | Returns the user's permissions with data scope. The apps build their navigation from the `view` permissions, so a menu a user may not view is never shown |
| GET | `/admin/menus` | `admin.roles.view` | Menu tree with the three permissions of each menu, for the role editor |
| PUT | `/admin/roles/{id}/permissions` | `admin.roles.edit` | Body: list of `{ permission, data_scope }`. Rejects admin-only permissions and the Administrator role |

**When a new menu or submenu is added**
1. Add one row to `menus` (key, parent, app, name). The three permissions appear automatically.
2. The role editor shows it automatically, and the Administrator can already use it.
3. Protect the screen and its endpoints with `<menu>.view`, `.edit` and `.delete`.
4. Add the menu to the catalogue in `smart_service_screens.md`.

## 14b. Two-way connection: 1C first, other platforms later

**1C is only the first platform.** The server talks to every platform through the same connector interface, so adding another platform means writing one new connector and a field mapping, not changing tickets, screens or the database.

| Connector function | Direction | What it does |
|---|---|---|
| `lookupDevice(serial)` | read from 1C | Returns model, warranty, sold date, customer name |
| `createServiceTicket(ticket)` | write to 1C | Creates the service ticket in 1C, returns its id and number |
| `updateStatus(externalId, status, comment)` | write to 1C | Sends the device service status |

### Fields

**Read from 1C by serial number** (staff only, never shown to customers):

| Field | Used for |
|---|---|
| Device model | Ticket side panel (W9a) |
| Warranty (until date) | Same; also lets the engineer see if the device is in warranty |
| Sold date | Same |
| Customer name | Same; flagged if it differs from the customer who registered the device |

**Sent to 1C:**

| Field | When | Notes |
|---|---|---|
| **Device service status**: `in_progress`, `done`, `rma`, `repair_not_possible` | Every time an engineer changes it | The field you asked for. Mapped to 1C's own values (see below) |
| Our ticket number | On create | Also the reference used to avoid duplicates |
| Serial number | On create | Key to find the device in 1C |
| Customer (company, city, contact name and phone) | On create | As registered in our system |
| Problem description and date opened | On create | |
| Assigned engineer | On create | |
| Resolution comment | With status `done`, `rma`, `repair_not_possible` | Optional, written by the engineer |

Nothing else is sent. More fields can be added later through the field mapping.

### When it happens
1. The engineer clicks **Apply** on a new ticket: the server reads the device data from 1C and the ticket is queued for creation in 1C. (The tenant can choose to create it at ticket creation instead of at Apply. Default: at Apply.)
2. The engineer sets the **device service status**. The status is queued and sent to 1C.
3. The ticket panel shows the 1C number and the state: *pending*, *synced* or *failed* (with Retry).

### Reliable delivery (outbox)
- Every change to send is saved in the same database transaction as the change itself (`integration_outbox`), so nothing is lost if 1C is unreachable.
- A background worker sends the queue, about every minute, and builds the message from fresh data at send time.
- Failed items are retried with growing delays (for example 1, 5, 15, 60 minutes). After 5 attempts the item is marked `dead` and shows in the administrator's sync queue with a Retry button.
- The outbox id is sent to 1C as an idempotency key, and the ticket number is checked in 1C before creating, so a retry never makes a duplicate service ticket.
- If 1C rejects the serial number (not found), the ticket still works in our system and the failure is shown to staff.
- Timeouts (about 10 seconds), a rate limit and an audit record for every call protect both systems.

### Status mapping (editable per tenant)

Our four statuses are mapped to the values 1C uses. These are examples; the real values come from your 1C setup.

| Our status | Example 1C value |
|---|---|
| `in_progress` | In progress |
| `done` | Done |
| `rma` | RMA |
| `repair_not_possible` | Repair is not possible |

### Admin endpoints (administrator only, Integrations menu)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/integrations` | Both connections (lookup and ticket sync) with provider, status, last success, last error |
| PUT | `/admin/integrations/{kind}` | `kind` = `device_lookup` or `service_sync`. Provider, address, login method, secret reference, field mapping, status mapping, enable / disable |
| POST | `/admin/integrations/{kind}/test` | Test with a sample serial number (lookup) or a dry-run message (sync) |
| GET | `/admin/integrations/outbox` | Sync queue. Filter by `status` (pending / sent / failed / dead) and ticket |
| POST | `/admin/integrations/outbox/{id}/retry` | Retry one item now |

### What 1C needs to provide

1C does not talk to the internet by itself, so these points must be agreed with whoever looks after your 1C:

1. **Access method: standard OData interface (decided).** See section 14e. A 1C specialist publishes the 1C database and chooses which objects are exposed.
2. **Which 1C configuration and document.** Which 1C product and version you use, and which document or catalog is the service request (and where the serial number, warranty, sold date and customer are stored).
3. **Network.** If 1C runs inside your office network, our cloud server cannot reach it directly. Options: publish it over HTTPS behind a reverse proxy, a VPN, or a small relay program inside your network. Cloud hosting addresses are not fixed by default, so an IP allow-list may need a fixed-address option. To be checked when we know your setup.
4. **A service account** in 1C with only the rights these calls need, plus a **test database** to try everything first.
5. **A rule for duplicates:** 1C looks up our ticket number before creating, so retries are safe.

### Security and visibility
- Credentials are kept in Supabase Vault and used only on the server.
- Lookup results, the 1C link and the **internal** device service status are staff only. Customers see only a simplified device status (section 14d), never the internal values or any 1C data.
- All calls and all failures are logged; the sync queue is visible to the administrator only.

## 14c. Working without a connection (manual mode)

**The service center must work completely without any connection to 1C or another platform.** The connection only saves typing. Nothing in tickets, devices or status depends on it.

| Situation | What happens |
|---|---|
| No connection set up or switched off | The ticket panel shows an **Enter manually** form for model, warranty until, sold date and customer name, and a field for the **1C number**. The device service status is still set by the engineer and simply stays in our system. Nothing is queued |
| Connection on, but 1C is down or does not know the serial number | The engineer sees "data unavailable" and can fill the same form by hand. The ticket is never blocked |
| Connection on, engineer wants to correct a value | Manual entry is always allowed and is marked as manual. A later automatic fetch does not overwrite it unless the engineer chooses **Replace with data from the platform** |
| Connection switched on later | New tickets sync automatically from then on. Tickets that already exist are not sent by surprise; the administrator can choose **Send existing tickets** (a date range) from the Integrations screen. If a ticket already has a manually typed 1C number, the worker links to it instead of creating a second service ticket |
| Connection switched off again | Existing data stays. New changes are simply saved here and nothing is queued |

**The same fields in both modes**

| Field | Manual | Automatic |
|---|---|---|
| Device model | typed or picked by engineer | read from 1C |
| Warranty until | typed | read from 1C |
| Sold date | typed | read from 1C |
| Customer name | typed | read from 1C |
| Device service status | chosen by engineer | chosen by engineer, then sent to 1C |
| 1C service ticket number | typed | returned by 1C when the ticket is created |

**Source label.** Every stored value shows where it came from and when: "From 1C, fetched 10:42" or "Entered by Aydin, 10:50". Manual entries and edits are written to the audit log.

**Permission.** Manual entry uses `tickets.external_info.edit`, which the Service Engineer and Service Manager templates have, so engineers can do it themselves. Customers never see any of this data.

| Method | Endpoint | Administrator only | Description |
|---|---|---|---|
| POST | `/admin/integrations/service_sync/backfill` | yes | Queue existing tickets (date range) for sending after the connection is switched on |

## 14d. What the customer sees: device status

Customers see one simple **device status** on their ticket, in the mobile app and the customer web portal. It is shown in their language (English, Azerbaijani, Russian) and is separate from the ticket status (New, Assigned, In progress ...).

| Staff set (internal, also sent to 1C) | Customer sees |
|---|---|
| `in_progress` | **Diagnose** |
| `done` | **Ready** |
| `rma` | **Pickup new device** |
| `repair_not_possible` | **Repair is not possible** |

- The mapping above is applied automatically by the database whenever staff change the internal status, so the two can never disagree.
- The moment an engineer applies (takes) a ticket, the status starts as `in_progress`, so the customer sees **Diagnose** right away.
- The customer gets a push notification (and a browser notification on the web portal) when the status changes.
- The ticket returned to the customer contains only `device_status` with one of `diagnose`, `ready`, `repair_not_possible`, `pickup_new_device`. The internal value (for example `rma`) is stored in a staff-only table and is never returned to customers.
- Manual mode and the connected mode behave the same: staff choose the status, and the customer sees the same four values.

## 14e. 1C through OData

**Method:** the standard OData interface of 1C:Enterprise (decided). Facts from 1C's own documentation:
- The platform generates the REST/OData interface automatically from version 8.3.5, using OData 3.0, with JSON and Atom/XML formats. It reads, creates and edits data, and can post documents. No programming in 1C is needed for the interface itself.
- Someone with access to the 1C server publishes the database to a web server (Apache or IIS) with the **Publish standard OData interface** option, then chooses which catalogs and documents are exposed (a short step in 1C).
- 1C applies its normal access rights to every OData request, so the service account gets only the rights it needs.

**How our connector uses it**

| Connector function | OData call (names depend on your 1C configuration) |
|---|---|
| `lookupDevice(serial)` | A filtered read on the object that holds the serial number, then reads of the linked sale / customer data. Returns model, warranty, sold date, customer name |
| `createServiceTicket(ticket)` | Creates a document (the service request) from our ticket data, then posts it if the process requires it. Our ticket number is stored in it |
| `updateStatus(externalId, status, comment)` | Updates the status field of that document |

The real object and field names, and the status values, are stored per tenant in the integration's `field_map` and status mapping, for example:

```json
{
  "lookup":   { "entity": "Catalog_SerialNumbers", "serial_field": "Description",
                "model": "Nomenclature/Description", "sold_date": "SaleDate",
                "warranty_until": "WarrantyUntil", "customer": "Counterparty/Description" },
  "create":   { "entity": "Document_ServiceRequest", "post": true, "our_ticket_number_field": "ExternalNumber" },
  "status":   { "field": "RepairStatus", "values": { "in_progress": "InProgress", "done": "Done",
                "rma": "RMA", "repair_not_possible": "RepairNotPossible" } }
}
```

This is only an illustration. The real names come from your 1C.

**Points to confirm with your 1C specialist**
1. Which 1C product and version (the version must be 8.3.5 or later).
2. Where the serial number, warranty, sold date and customer are stored. They may be in several objects (a serial number catalog, a sales document, a counterparty), so one lookup can need two or three reads.
3. Which document is the service request, and which fields it must have filled in.
4. Whether the database can be published to the internet over HTTPS, or only inside your office network (then a VPN or a small relay program is needed).
5. A service account with only the needed rights, and a **test database** to try everything first.

**If OData is not enough.** If a calculation (for example warranty end) or a business rule only exists inside 1C, the 1C specialist can add a small custom HTTP service for that one step. Our connector interface does not change.

**Practical limits:** use only HTTPS; filter on an indexed serial number field and request only the fields we need, because OData reads on large 1C tables can be slow; calls have a timeout, and failures are retried by the queue.
