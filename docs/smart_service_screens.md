# Smart Service System: Screen List (v1)

Covers the **Web app (staff)**, the **Mobile app (customers)** and the **customer web portal** (section 3b).  
Endpoints referenced are from `smart_service_api_endpoints.md`.

---

## 1. Shared design rules

### Themes (design tokens)

Define colors as variables once and switch the set for light / dark. Never hard-code colors in screens.

| Token | Dark theme | Light theme |
|---|---|---|
| `bg` | Navy `#0A1628` | `#F4F8FC` |
| `surface` | Dark blue `#10264A` | `#FFFFFF` |
| `surface-alt` | `#16305C` | `#E8F1FA` |
| `primary` | Light blue `#4DA3FF` | `#1E6FD9` |
| `accent` | `#8CC8FF` | `#0A3A7A` |
| `text` | `#EAF2FF` | `#0A1628` |
| `text-muted` | `#9FB6D4` | `#5A6B82` |
| `border` | `#1F3D6E` | `#D3E0EF` |

These hex values are a starting palette. Replace them with your brand colors.

Status colors (same meaning in both themes): New = blue, Assigned = indigo, In progress = amber, Waiting for customer = orange, Resolved = green, Closed = grey.

Theme options: **Light / Dark / System**, saved to the user profile (`PATCH /me/preferences`).

### Languages (English / Azərbaycan / Русский)

- Language switcher on login screen and in Settings.
- All UI text from translation files (no hard-coded strings). Content (FAQs, videos) comes translated from the API.
- Leave room for text growth: Russian and Azerbaijani strings are often 20-30% longer than English.
- Use locale-aware dates and numbers. Use a font that supports Azerbaijani letters (ə, ğ, ı, ö, ş, ü, ç) and Cyrillic.

### Common UI states (every list and detail screen)

Loading skeleton · Empty state · Error with retry · Offline banner (mobile) · No-permission message.

---

## 2. Mobile app (resellers, installers, companies)

### Navigation

Bottom tabs: **Home · Tickets · Devices · Help · Profile**  
Floating "+ New ticket" button on Home and Tickets.

### Screens

**A. Onboarding and access**

| # | Screen | Key content |
|---|---|---|
| M1 | Splash / language select | Logo, language picker (EN / AZ / RU), theme follows system |
| M2 | Login | Email, password, forgot password, register link |
| M3 | Register | Account type (reseller / installer / company), first name, last name, **company name (required)**, **city (required)**, phone, email, password, terms. Optional: country, tax ID. Inline validation, and the Register button stays disabled until all required fields are filled |
| M4 | Email verification | Code entry, resend |
| M5 | Pending approval | Explains the account awaits approval, push when approved |
| M6 | Rejected / suspended | Reason and contact support |
| M7 | Forgot / reset password | Email step, code step, new password step |

**B. Home**

| # | Screen | Key content |
|---|---|---|
| M8 | Home | Greeting, open tickets summary, quick actions (New ticket, Add device, Ask AI), latest ticket updates, featured tutorials |
| M9 | Notifications | List, unread badge, tap opens the related ticket |

**C. Devices**

| # | Screen | Key content |
|---|---|---|
| M10 | My devices | List with model, SN, warranty badge, search. Two tabs: **Current** and **Transferred**. Transferred devices (ones this user used to own) are read-only, show the user's old tickets, and have no "Create ticket" button |
| M11 | Add device | **Scan the label**: barcode / QR first, text recognition as fallback. The detected SN is shown for the user to confirm or edit. Live validation (`/devices/lookup`), shows model and warranty before saving. If the SN belongs to someone else, goes to M12a |
| M12 | Device details | Model info, warranty, ticket history, "Create ticket", linked tutorials and config videos |
| M12a | Ownership request | Shown when the SN is already registered. Explains that the device belongs to another user, asks the user to photograph the label as proof, and submits the request. Shows "Pending" (staff approval mode) or confirms immediately (automatic mode) |

**D. Tickets**

| # | Screen | Key content |
|---|---|---|
| M13 | Tickets list | Tabs: Open / Resolved / All, status chips, a **device status** chip, search, filter |
| M14 | New ticket | Select device (or add by SN), subject, description, photo / video / file attachments, priority hint |
| M15 | Ticket details | Header (ticket no, status, assigned engineer), **device status** (Diagnose / Ready / Repair is not possible / Pickup new device), status timeline, chat thread, attach button, typing indicator |
| M16 | Attachment viewer | Image / video / PDF preview |
| M17 | Rate ticket | 1-5 stars and comment after resolution; "Reopen" option |

**E. Help**

| # | Screen | Key content |
|---|---|---|
| M18 | Help center | Search, categories, tabs: Config videos / Tutorials / FAQs |
| M19 | Content list | By category and device model |
| M20 | Video player | Streaming, subtitles in selected language, fullscreen |
| M21 | FAQ detail | Question, answer, "Did this help?", "Still need help? Create ticket" |
| M22 | AI assistant | Chat, streamed answers, source links to FAQs / videos, 👍 / 👎, "Create ticket from this chat" |

**F. Profile**

| # | Screen | Key content |
|---|---|---|
| M23 | Profile | Name, company, role, contact info |
| M24 | Settings | Language, theme (Light / Dark / System), notification toggles, change password, about, log out |

**Mobile push notifications:** registration approved or rejected, ticket assigned, new message, status changed, ticket resolved (ask for rating).

---

## 3. Web app (service staff)

### Navigation (sidebar, items shown by permission)

**Dashboard · Tickets · Devices · Customers · Content · AI Assistant · Reports · Administration**

Top bar: global search, notifications bell, language switcher, theme toggle, user menu.

### Screens

**A. Access**

| # | Screen | Key content |
|---|---|---|
| W1 | Login | Email, password, language and theme toggles, forgot password |
| W2 | Forgot / reset password | Same flow as mobile |
| W3 | My profile and settings | Name, language, theme, password, notification preferences |

**B. Dashboard (content depends on role)**

| # | Screen | Key content |
|---|---|---|
| W4 | Engineer dashboard | My open tickets, waiting for customer, due soon, unassigned queue to claim |
| W5 | Manager dashboard | Unassigned tickets, workload per engineer, SLA risk, pending registrations, quick assign |
| W6 | CEO dashboard | Read-only KPIs: open vs closed, first response and resolution times, satisfaction, trends, top companies and device models |

**C. Tickets**

| # | Screen | Key content |
|---|---|---|
| W7 | Ticket list | Table with filters (status, priority, engineer, company, date), saved views, bulk assign, export |
| W8 | Kanban board (optional) | Columns by status, drag to change status |
| W9 | Ticket details | Two-column: chat (public reply vs **internal note** toggle) and side panel with customer, company, device and warranty, assignee, priority, due date, status history, attachments, quick actions (assign, change status, close, reopen) |
| W10 | Assign dialog | Engineer list with current workload |
| W9a | External device data panel (**staff only**) | Part of the ticket side panel (W9). Shows data from the connected platform: device model, sold date, customer name, warranty date, "fetched at", status. **Refresh** button. Warns if the sold-to name differs from the customer who registered the device. Shows "data unavailable, retry" if the other platform does not answer. Never appears in any customer screen. **Works without any connection:** if no connection is switched on, or the other platform does not answer, the panel shows an **Enter manually** form (model, warranty until, sold date, customer name) and a label showing the source, such as "From 1C, fetched 10:42" or "Entered by Aydin, 10:50". Manual entry is always allowed and can correct automatic data; a later automatic fetch asks before replacing it |
| W9b | Device service status (staff) | Part of the ticket side panel. Dropdown: **In progress / Done / RMA / Repair is not possible**, with an optional resolution comment. Each option shows what the **customer will see**: In progress = Diagnose, Done = Ready, RMA = Pickup new device, Repair is not possible = Repair is not possible. Below it the connection state: "Sent to 1C, number 000123" or "Pending" or "Failed" with the reason and a **Retry** button. When "Done" is chosen, the screen suggests resolving the ticket (the engineer confirms). **Without a connection** the status is simply saved here, nothing is sent, and a **1C number** field lets the engineer type the number of the service ticket by hand |

**D. Devices and customers**

| # | Screen | Key content |
|---|---|---|
| W11 | Devices list and details | Search by SN, model, owner, warranty, ticket history; add / edit / delete (`device.manage`) |
| W12 | Device models | CRUD for models |
| W13 | Serial number import | Upload CSV, preview, validation errors, confirm |
| W14 | Customers (companies) list | Filter by type and status, ticket counts |
| W15 | Company details | Info, users, devices, tickets |
| W16 | Pending registrations | Every new reseller, installer and company waits here until approved. Review details, approve / reject with reason. Available to the administrator and to service managers (permission `registration.approve`, set by the administrator). The customer is notified by push and email |
| W16a | Device ownership requests | Queue with the claimant, current owner (staff only), SN, label photo, date. Approve / reject with note. History of past transfers |

**E. Content management**

| # | Screen | Key content |
|---|---|---|
| W17 | Content library | Tabs: FAQs / Config videos / Tutorials / Documents; filter by category and model; publish status |
| W18 | Content editor | Language tabs (EN / AZ / RU), title, body, video upload with progress, subtitle upload, category, device model, visibility, publish toggle |
| W19 | Categories | Tree with drag-to-reorder and translated names |

**F. AI assistant**

| # | Screen | Key content |
|---|---|---|
| W20 | AI chat | Same as mobile, plus insert-into-ticket-reply action |
| W21 | AI knowledge status (admin / manager) | Reindex button, indexed item count, low-rated answers to review |

**G. Reports**

| # | Screen | Key content |
|---|---|---|
| W22 | Reports hub | Date range, filters, charts and tables: tickets by status, engineer performance, by company, by model, SLA; export XLSX / PDF |

**H. Administration (administrator, plus roles granted by permission)**

| # | Screen | Key content |
|---|---|---|
| W23 | Users list | Staff and customers, filters, status |
| W24 | User editor | Details, roles, active toggle, reset password, suspend, delete |
| W25 | Roles list | System roles marked and locked from deletion |
| W26 | Role editor | **Permission matrix: a tree of every menu and submenu, with three checkboxes per row: View, Edit, Delete** (ticking Delete also ticks Edit and View; ticking Edit also ticks View; ticking a submenu also ticks its parent's View). A data-scope selector (**All records / Own records only**) sits next to the permissions where it applies. New menus appear here automatically. Admin-only menus show a padlock and cannot be ticked. The **Administrator role is shown locked**: full access, cannot be edited or deleted, and the last active administrator cannot be removed or deactivated. All other roles are created and edited here |
| W27 | Audit log | Filter by actor, entity, action and date; before / after diff view |
| W28 | System settings | SLA times, upload limits, email templates, default language, branding (logo, colors, default language), **device claim mode** (staff approval / automatic transfer) |
| W29 | Trash / recovery (recommended) | Soft-deleted items with restore, since the administrator can delete everything |
| W30 | **Login security** (administrator only) | Sections: password rules (minimum length); two-factor authentication (required for administrator, optional or required for staff, reset a user's setup); lockout (failed attempts, lock minutes); sessions (idle timeout, maximum session length); IP allow-list for staff; new-device alerts. Tables: **active sessions** with a "Sign out" button and "Sign out everywhere" per user, and **locked accounts** with "Unlock". Every change asks for confirmation and is written to the audit log |
| W31 | **Login history** (administrator only) | Read-only table, newest first: **date and time** (viewer's local time, UTC on hover), user, role, event, result, client (web / iOS / Android), IP address, location, browser or device, failure reason. Filters: user, event, success / failed, client, IP, date range. Failed attempts and new-device logins are highlighted. Row details panel, export to Excel / CSV. Records cannot be edited or deleted |
| W32 | **Integrations** (administrator only) | Connect the other platform: address, login method, secret, field mapping, **status mapping**, enable / disable (separately for **device lookup** and **ticket sync**; with both off the service center runs in **manual mode**), **Send existing tickets** for a date range after switching on, "Test with a serial number", last success and last error. Also the **sync queue**: pending, sent, failed and dead items with Retry |

---

## 3b. Web portal for customers (office laptops)

Customers can also log in from a browser. Build this as **one web app with two experiences**: after login, the app checks the user type (`kind`) and shows either the staff layout (section 3) or the customer portal below. One codebase means one design system and one set of themes and translations.

**Navigation (top bar or slim sidebar):** Home · Tickets · Devices · Help · Profile. Same bell, language switcher and theme toggle as staff.

| # | Web portal screen | Based on | Desktop-specific changes |
|---|---|---|---|
| C1 | Login, register, verify email, pending approval, reset password | M2-M7 | Centered card layout. Registration has the same required fields (company name and city included) |
| C2 | Home | M8 | Wider layout: open tickets, latest updates and featured tutorials side by side |
| C3 | Tickets list | M13 | Table with status filter, search and date range instead of cards |
| C4 | New ticket | M14 | Drag-and-drop file upload, paste screenshots from clipboard |
| C5 | Ticket details | M15 | Chat on the left, ticket info and timeline on the right. Customers never see internal notes |
| C6 | My devices, add device, device details | M10-M12 | Type the SN or **upload a photo of the label** (the text is read automatically). On a phone browser the camera can be used directly. Optional **bulk add devices via CSV**, handy for resellers |
| C7 | Help center, video player, FAQ detail | M18-M21 | Larger video player, side list of related videos |
| C8 | AI assistant | M22 | Chat panel, "Create ticket from this chat" |
| C9 | Profile and settings | M23-M24 | Language, theme, password, notification preferences |

**Customer web rules**
- Customers see only their own company's data, enforced by the API (not just hidden in the menu).
- Same status colors, translations and light/dark tokens as the other apps.
- Responsive down to tablet width, so the same page works on a small laptop window.
- Browser notifications (web push) for ticket updates, plus email as a fallback when the tab is closed.

---

## 3c. Platform console (platform owner only)

A small separate admin area for you as the platform owner. Tenant users never see it. For the first version it can be a simple internal page or scripts.

| # | Screen | Key content |
|---|---|---|
| P1 | Tenants list | Name, slug, status, user / ticket counts |
| P2 | Create tenant | Name, slug, default language, first administrator's email. Creates the default roles and settings |
| P3 | Tenant details | Branding, suspend / reactivate, usage |

---

## 4. Who sees what (starting roles)

The table shows the starting templates. Only the **Administrator** is fixed. The administrator can change what every other role may do.


| Area | Admin | CEO | Manager | Engineer | Customer (mobile) |
|---|---|---|---|---|---|
| Dashboard | ✔ | ✔ (KPIs) | ✔ | ✔ (own) | Home |
| All tickets | ✔ | view | ✔ | own / claim | own only |
| Assign tickets | ✔ | ✘ | ✔ | ✘ | ✘ |
| Devices and customers | ✔ | view | ✔ | view | own devices |
| Content management | ✔ | ✘ | ✔ | ✘ | view only |
| AI assistant | ✔ | ✔ | ✔ | ✔ | ✔ |
| Reports | ✔ | ✔ | ✔ | ✘ | ✘ |
| Users, roles, audit, settings | ✔ | ✘ | ✘ | ✘ | ✘ |
| **Login security and login history** (not delegable) | ✔ | ✘ | ✘ | ✘ | ✘ |
| External device data (from the other platform) | ✔ | ✘ | ✔ | ✔ | ✘ never |

Since the administrator edits permissions, menu items and buttons must be shown or hidden from the permission list returned by `GET /me`, not from fixed role names.

---

## 5. Suggested design and build order

1. Design system: tokens, buttons, inputs, chips, tables, chat bubbles, both themes
2. Auth and registration (M1-M7, W1-W3, C1). Build the customer web portal (C1-C9) alongside the matching mobile screens, since it uses the same API
3. Admin: users, roles, registrations (W16, W23-W26)
4. Devices (M10-M12, W11-W13)
5. Ticketing core (M13-M17, W7, W9, W10)
6. Notifications (M9)
7. Help content (M18-M21, W17-W19)
8. AI assistant (M22, W20-W21)
9. Dashboards and reports (W4-W6, W22)
10. Audit, settings, trash (W27-W29)

## 6. Decisions and open questions

**Decided**
- Each customer sees **only the devices they registered** and their own tickets. Colleagues from the same company do not share data.
- **Nothing is lost.** After a transfer, the previous owner keeps read-only access to the device and all their old tickets, and the new owner starts with a clean history. Every owner is recorded in the device's ownership history. Records are never permanently deleted, only soft-deleted and restorable from the Trash screen (W29).
- Company name and city are required at registration. Companies are kept for reporting and staff views only.
- Customers use both the mobile app and the web portal. A separate Windows app is not planned for v1.
- Adding a device is done mainly by **scanning the label**. If the device belongs to someone else, the user sends an **ownership request**. Both modes are built: staff approval (default) and automatic transfer, switched by an administrator setting.
- Videos are hosted on **Cloudflare Stream**. The mobile app uses **React Native (Expo)**. Backend: **Supabase**; web hosting: **Vercel**. The team is two people (you and me).

- **HARD RULE: every menu and submenu has the permissions View, Edit and Delete.** Edit means create and change; Delete means soft delete (restorable from Trash). The database creates the three permissions automatically for every new menu, so no menu can exist without them. Delete implies Edit, and Edit implies View. The role editor shows every menu automatically, and navigation is built from the View permissions, so users never see a menu they cannot view. Full list: section 7.
- **Approval:** every registered customer (reseller, installer, company) must be approved by the administrator or a service manager before using the platform.
- **Administrator:** fixed by the architecture. Always has every permission (including future ones), cannot be edited or deleted, and each tenant always keeps at least one active administrator. All other roles and permissions are created by the administrator. The CEO, manager and engineer roles are only starting templates.
- **Login security and login history:** two menus in the web app, visible and usable by the **administrator only**. They are tied to the Administrator role itself, so the administrator cannot hand them to another role. Every record in the system has a creation date and time, and login history and the audit log are immutable.
- **External device data is staff-only.** The model, sold date, customer name and warranty date from the other platform are shown to engineers (and other staff with the permission) in the ticket panel only. Customers never see them: not in the mobile app, not in the customer web portal, and not while adding a device. They are stored separately from customer data.
- **1C connection (first platform, others later):** from 1C by serial number we read model, warranty, sold date and customer name (staff only). To 1C we create the service ticket when an engineer applies a ticket, and we send the device service status (in progress / done / RMA / repair not possible) every time it changes. Everything is queued and retried, so nothing is lost if 1C is down. Other platforms plug into the same connector interface.
- **Works without any connection.** The 1C connection is optional. If it is not set up, or is switched off, or the other platform is down, every field is entered by hand (device model, warranty, sold date, customer name, 1C number, device service status) and the service center works exactly the same. Every value shows whether it was entered manually or came from the platform, and manual entries are audited.
- **What customers see (decided):** only four device statuses, in their language: **Diagnose, Ready, Repair is not possible, Pickup new device**. Staff choose the internal status (in progress, done, RMA, repair is not possible) and the system converts it: in progress = Diagnose, done = Ready, RMA = Pickup new device, repair is not possible = Repair is not possible. The internal values and all 1C data stay staff-only. The status starts as Diagnose when an engineer applies the ticket, and customers get a notification on every change.
- **1C access method (decided):** the standard OData interface, set up by a 1C specialist on a test database first.
- **Multi-tenant:** built in from day one. A tenant is a company with its own staff, customers, devices and settings. One account belongs to one tenant in v1.

**Open**
1. Do you want a **Kanban board** (W8) for engineers, or is a list enough for v1?
2. **Confirm the status conversion.** I assumed in progress = Diagnose, done = Ready, RMA = Pickup new device. Is "RMA" really the case where the customer picks up a replacement device? If it means something else (for example the device was sent to the manufacturer), tell me and I will change it, or add a fifth customer status.
3. **1C (OData):** which 1C product and version, where the serial number, warranty, sold date and customer are stored, which document is the service request, and whether the 1C database can be published over HTTPS or only inside your office network. A 1C specialist is needed to publish OData and choose the exposed objects.

---

## 7. Menu and permission catalogue

Every row has three permissions: `<key>.view`, `<key>.edit`, `<key>.delete` (so 34 menus give 102 permissions). **Admin only** rows can never be granted to any role except the Administrator.

### Web app (staff)

| Menu | Key | Screens | Notes |
|---|---|---|---|
| Dashboard | `dashboard` | W4-W6 | Content differs by role |
| Tickets | `tickets` | W7, W9, W10 | Data scope: all / own (assigned) |
| ↳ Kanban board | `tickets.board` | W8 | |
| ↳ External device data | `tickets.external_info` | W9a | Staff only, never customers. Edit = refresh |
| Devices | `devices` | W11 | |
| ↳ Device models | `devices.models` | W12 | |
| ↳ Serial number import | `devices.serial_import` | W13 | |
| ↳ Ownership requests | `devices.claims` | W16a | Edit = approve / reject |
| Customers | `customers` | (group) | |
| ↳ Companies | `customers.companies` | W14, W15 | |
| ↳ Pending registrations | `customers.registrations` | W16 | Edit = approve / reject |
| Content | `content` | (group) | |
| ↳ Content library | `content.library` | W17, W18 | FAQs, videos, tutorials, documents |
| ↳ Categories | `content.categories` | W19 | |
| AI Assistant | `ai` | (group) | |
| ↳ Assistant | `ai.assistant` | W20 | Edit = ask questions |
| ↳ Knowledge status | `ai.knowledge` | W21 | Edit = reindex |
| Reports | `reports` | W22 | Edit = save report views, delete = remove them |
| Administration | `admin` | (group) | |
| ↳ Users | `admin.users` | W23, W24 | |
| ↳ Roles and permissions | `admin.roles` | W25, W26 | Administrator role is locked |
| ↳ Audit log | `admin.audit` | W27 | Records are immutable, so edit and delete do nothing here |
| ↳ System settings | `admin.settings` | W28 | |
| ↳ Trash and recovery | `admin.trash` | W29 | Edit = restore |
| ↳ Integrations | `admin.integrations` | W32 | **Admin only** |
| ↳ Login security | `admin.login_security` | W30 | **Admin only** |
| ↳ Login history | `admin.login_history` | W31 | **Admin only**. Records are immutable |

### Shared by web and mobile

| Menu | Key | Screens |
|---|---|---|
| Notifications | `notifications` | M9, bell in the web top bar |
| Profile and settings | `profile` | M23, M24, W3, C9 |

### Customer apps (mobile app and customer web portal)

| Menu | Key | Screens | Notes |
|---|---|---|---|
| Home | `my.home` | M8, C2 | |
| My tickets | `my.tickets` | M13-M17, C3-C5 | Edit = create tickets and reply. Own records only |
| My devices | `my.devices` | M10-M12a, C6 | Edit = add devices and ownership requests. Own records only |
| Help center | `my.help` | M18-M21, C7 | Published, customer-visible content only |
| AI assistant | `my.ai` | M22, C8 | Edit = ask questions |

The platform console (P1-P3) is not a tenant menu. It belongs to you as platform owner and sits outside the tenant permission system.

### Starting role templates

Only a starting point; the administrator can change everything except the Administrator role.

| Role | Starting permissions |
|---|---|
| Administrator | Everything, always (fixed) |
| CEO | View on dashboard, tickets, devices, companies, content, AI assistant (view and ask), reports |
| Service Manager | Edit on tickets (all), board, external device data, devices, models, serial import, ownership requests, companies, registrations, AI assistant and knowledge. Edit and delete on content library and categories. View on dashboard and reports |
| Service Engineer | View and edit tickets (own / assigned only), view and edit external device data (manual entry), view devices and content, ask the AI assistant, dashboard |
| Customer | View and edit own tickets and devices, view help content, ask the AI assistant |
| Everyone | Notifications and profile (view, edit) |
