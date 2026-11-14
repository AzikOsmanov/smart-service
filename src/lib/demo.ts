import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// The demo company: a separate tenant ("demo") with sample data. Visitors get a throw-away staff account; everything is reset daily.
type Admin = SupabaseClient;
export const VISITOR_PREFIX = "demo-v-";
const VISITOR_COMPANY = "Demo visitor company";
const rnd = (n = 12) => randomBytes(n).toString("hex");
const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
};

export async function demoTenantId(admin: Admin): Promise<string | null> {
  const { data } = await admin.from("tenants").select("id").eq("slug", "demo").eq("is_demo", true).is("deleted_at", null).maybeSingle();
  return (data?.id as string) ?? null;
}

async function roleId(admin: Admin, tenantId: string, code: string): Promise<string> {
  return (must(await admin.from("roles").select("id").eq("tenant_id", tenantId).eq("code", code).is("deleted_at", null).maybeSingle(), `role ${code}`) as { id: string }).id;
}

// A person of the demo company that stays between resets (sample customers and an engineer).
async function ensureUser(admin: Admin, tenantId: string, o: { email: string; first: string; last: string; kind: "staff" | "customer"; role: string; companyId?: string; type?: string }): Promise<string> {
  const { data: ex } = await admin.from("users").select("id").eq("email", o.email).maybeSingle();
  if (ex) return ex.id as string;
  const c = await admin.auth.admin.createUser({ email: o.email, password: rnd(16), email_confirm: true });
  if (c.error || !c.data.user) throw new Error(`demo user ${o.email}: ${c.error?.message}`);
  const id = c.data.user.id;
  const ins = await admin.from("users").insert({ id, tenant_id: tenantId, kind: o.kind, email: o.email, first_name: o.first, last_name: o.last, registration: "approved", is_active: true, email_verified_at: new Date().toISOString(), ...(o.companyId ? { company_id: o.companyId, customer_type: o.type } : {}) });
  if (ins.error) { await admin.auth.admin.deleteUser(id); throw new Error(`demo user row: ${ins.error.message}`); }
  const ur = await admin.from("user_roles").insert({ user_id: id, role_id: await roleId(admin, tenantId, o.role) });
  if (ur.error) throw new Error(`demo user role: ${ur.error.message}`);
  return id;
}

export async function seedDemo(admin: Admin, tenantId: string): Promise<void> {
  const w = await admin.rpc("wipe_tenant_data", { p_tenant: tenantId });
  if (w.error) throw new Error(`wipe: ${w.error.message}`);

  // Companies (kept between resets)
  const want = [["Baku Security Systems", "installer", "Baku"], ["Caspian Integrators", "company", "Sumqayit"], ["Nova Reseller", "reseller", "Ganja"]] as const;
  const companies: string[] = [];
  for (const [name, type, city] of want) {
    const { data: ex } = await admin.from("companies").select("id").eq("tenant_id", tenantId).eq("name", name).is("deleted_at", null).maybeSingle();
    if (ex) { companies.push(ex.id as string); continue; }
    companies.push((must(await admin.from("companies").insert({ tenant_id: tenantId, name, type, city, status: "approved" }).select("id").single(), "company") as { id: string }).id);
  }
  const custs = [
    await ensureUser(admin, tenantId, { email: "demo-customer1@example.com", first: "Elvin", last: "Mammadov", kind: "customer", role: "customer", companyId: companies[0], type: "installer" }),
    await ensureUser(admin, tenantId, { email: "demo-customer2@example.com", first: "Leyla", last: "Aliyeva", kind: "customer", role: "customer", companyId: companies[1], type: "company" }),
    await ensureUser(admin, tenantId, { email: "demo-customer3@example.com", first: "Rashad", last: "Huseynov", kind: "customer", role: "customer", companyId: companies[2], type: "reseller" }),
  ];
  const eng = await ensureUser(admin, tenantId, { email: "demo-engineer@example.com", first: "Nigar", last: "Ismayilova", kind: "staff", role: "engineer" });

  const models = must(await admin.from("device_models").insert([
    { tenant_id: tenantId, name: "IPC-HFW2431S-S-S2 (4MP bullet)", sku: "DH-IPC-HFW2431S", category: "Camera" },
    { tenant_id: tenantId, name: "IPC-HDW2431T-AS (4MP dome)", sku: "DH-IPC-HDW2431T", category: "Camera" },
    { tenant_id: tenantId, name: "NVR4208-8P-4KS2/L (8 ch recorder)", sku: "DHI-NVR4208-8P", category: "Recorder" },
    { tenant_id: tenantId, name: "NVR301-08S3-P8 (8 ch recorder)", sku: "UNV-NVR301-08S3", category: "Recorder" },
    { tenant_id: tenantId, name: "VTO2211G-P (IP intercom)", sku: "DHI-VTO2211G-P", category: "Intercom" },
  ]).select("id"), "models") as { id: string }[];

  const day = 86400000, now = Date.now();
  const dev = (i: number, m: number, c: number, warrantyDays: number) => ({ tenant_id: tenantId, serial_number: `DEMO${(1000 + i)}${rnd(3).toUpperCase()}`, model_id: models[m].id, owner_id: custs[c], company_id: companies[c], added_by: custs[c], is_verified: true, warranty_until: new Date(now + warrantyDays * day).toISOString().slice(0, 10) });
  const devices = must(await admin.from("devices").insert([dev(1, 0, 0, 300), dev(2, 1, 0, 120), dev(3, 2, 0, -40), dev(4, 3, 1, 500), dev(5, 0, 1, 20), dev(6, 4, 1, 700), dev(7, 2, 2, 90), dev(8, 1, 2, -200)]).select("id"), "devices") as { id: string }[];

  type T = [number, number, string, string, string, string, string, number, boolean];   // device, customer, subject, description, status, priority, device status, days ago, has staff reply
  const rows: T[] = [
    [0, 0, "Camera image is blurry at night", "The picture becomes very blurry after dark. IR LEDs seem to work.", "new", "normal", "diagnose", 0, false],
    [2, 0, "Recorder does not see the hard disk", "NVR shows no HDD after a power cut. Disk is 4 TB, was working before.", "in_progress", "high", "diagnose", 2, true],
    [3, 1, "Cannot add camera to the recorder", "Camera is found in the network but the recorder cannot add it by ONVIF.", "assigned", "normal", "diagnose", 3, false],
    [4, 1, "Dome camera reboots every few minutes", "The camera restarts by itself. PoE switch is new.", "waiting_customer", "high", "diagnose", 5, true],
    [5, 1, "Intercom has no sound from the panel", "Video works but there is no sound from the outdoor panel.", "resolved", "normal", "ready", 8, true],
    [6, 2, "Firmware update failed", "Update stopped at 40% and the recorder now boots into recovery.", "in_progress", "urgent", "diagnose", 1, true],
    [7, 2, "Dome camera lens condensation", "There is water inside the dome after rain.", "closed", "low", "repair_not_possible", 20, true],
    [1, 0, "Request: replace faulty camera", "The camera stopped working completely. Please check warranty.", "resolved", "normal", "pickup_new_device", 12, true],
  ];
  for (const [d, c, subject, description, status, priority, ds, ago, reply] of rows) {
    const created = new Date(now - ago * day - 3600000).toISOString();
    const tk = must(await admin.from("tickets").insert({ tenant_id: tenantId, customer_id: custs[c], company_id: companies[c], device_id: devices[d].id, assigned_to: status === "new" ? null : eng, subject, description, status, priority, customer_device_status: ds, created_at: created }).select("id").single(), "ticket") as { id: string };
    const msgs: Record<string, unknown>[] = [{ tenant_id: tenantId, ticket_id: tk.id, sender_id: custs[c], sender_kind: "customer", body: description, created_at: created }];
    if (reply) msgs.push({ tenant_id: tenantId, ticket_id: tk.id, sender_id: eng, sender_kind: "staff", body: "Thank you for the details. We are checking the device and will update this ticket.", created_at: new Date(now - ago * day + 3600000).toISOString() });
    const m = await admin.from("ticket_messages").insert(msgs);
    if (m.error) throw new Error(`messages: ${m.error.message}`);
  }
}

// A throw-away staff account (Service Manager role) for one visitor.
export async function createVisitor(admin: Admin, tenantId: string): Promise<{ email: string; password: string }> {
  const email = `${VISITOR_PREFIX}${rnd(6)}@example.com`, password = rnd(16);
  const c = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (c.error || !c.data.user) throw new Error(c.error?.message ?? "create failed");
  const id = c.data.user.id;
  const ins = await admin.from("users").insert({ id, tenant_id: tenantId, kind: "staff", email, first_name: "Demo", last_name: "Visitor", registration: "approved", is_active: true, email_verified_at: new Date().toISOString() });
  const ur = ins.error ? null : await admin.from("user_roles").insert({ user_id: id, role_id: await roleId(admin, tenantId, "manager") });
  if (ins.error || ur?.error) { await admin.from("users").delete().eq("id", id); await admin.auth.admin.deleteUser(id); throw new Error(ins.error?.message ?? ur?.error?.message); }
  return { email, password };
}

// A throw-away customer (own company, 2 devices, 2 tickets) for one visitor of the customer portal demo.
export async function createCustomerVisitor(admin: Admin, tenantId: string): Promise<{ email: string; password: string }> {
  const email = `${VISITOR_PREFIX}${rnd(6)}@example.com`, password = rnd(16);
  const suffix = rnd(3);
  const company = (must(await admin.from("companies").insert({ tenant_id: tenantId, name: `${VISITOR_COMPANY} ${suffix}`, type: "installer", city: "Baku", status: "approved" }).select("id").single(), "company") as { id: string }).id;
  const c = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (c.error || !c.data.user) { await admin.from("companies").delete().eq("id", company); throw new Error(c.error?.message ?? "create failed"); }
  const id = c.data.user.id;
  try {
    const ins = await admin.from("users").insert({ id, tenant_id: tenantId, kind: "customer", email, first_name: "Demo", last_name: "Customer", company_id: company, customer_type: "installer", registration: "approved", is_active: true, email_verified_at: new Date().toISOString() });
    if (ins.error) throw new Error(ins.error.message);
    const ur = await admin.from("user_roles").insert({ user_id: id, role_id: await roleId(admin, tenantId, "customer") });
    if (ur.error) throw new Error(ur.error.message);
    const models = (must(await admin.from("device_models").select("id").eq("tenant_id", tenantId).is("deleted_at", null).order("created_at").limit(3), "models") as { id: string }[]);
    const eng = (await admin.from("users").select("id").eq("email", "demo-engineer@example.com").maybeSingle()).data?.id as string | undefined;
    const day = 86400000, now = Date.now();
    const dev = (i: number, m: number, days: number) => ({ tenant_id: tenantId, serial_number: `DEMO${2000 + i}${rnd(3).toUpperCase()}`, model_id: models[m % models.length].id, owner_id: id, company_id: company, added_by: id, is_verified: true, warranty_until: new Date(now + days * day).toISOString().slice(0, 10) });
    const devices = must(await admin.from("devices").insert([dev(1, 0, 300), dev(2, 2, -30)]).select("id"), "devices") as { id: string }[];
    const mk = async (d: number, subject: string, description: string, status: string, ago: number, reply: boolean) => {
      const created = new Date(now - ago * day - 3600000).toISOString();
      const tk = must(await admin.from("tickets").insert({ tenant_id: tenantId, customer_id: id, company_id: company, device_id: devices[d].id, assigned_to: status === "new" ? null : eng ?? null, subject, description, status, priority: "normal", customer_device_status: "diagnose", created_at: created }).select("id").single(), "ticket") as { id: string };
      const msgs: Record<string, unknown>[] = [{ tenant_id: tenantId, ticket_id: tk.id, sender_id: id, sender_kind: "customer", body: description, created_at: created }];
      if (reply && eng) msgs.push({ tenant_id: tenantId, ticket_id: tk.id, sender_id: eng, sender_kind: "staff", body: "Thank you. We received your device and are checking it. We will update this ticket.", created_at: new Date(now - ago * day + 3600000).toISOString() });
      const m = await admin.from("ticket_messages").insert(msgs);
      if (m.error) throw new Error(m.error.message);
    };
    await mk(0, "Camera image is blurry at night", "The picture becomes very blurry after dark.", "new", 0, false);
    await mk(1, "Recorder does not see the hard disk", "NVR shows no HDD after a power cut.", "in_progress", 2, true);
  } catch (e) {
    await admin.from("users").delete().eq("id", id); await admin.auth.admin.deleteUser(id);
    throw e;
  }
  return { email, password };
}

export async function removeVisitors(admin: Admin, tenantId: string, olderThanMs: number): Promise<number> {
  const before = new Date(Date.now() - olderThanMs).toISOString();
  const { data } = await admin.from("users").select("id").eq("tenant_id", tenantId).like("email", `${VISITOR_PREFIX}%`).lt("created_at", before).limit(500);
  let n = 0;
  for (const u of data ?? []) {
    const d = await admin.from("users").delete().eq("id", u.id);
    if (d.error) { await admin.from("users").update({ is_active: false, deleted_at: new Date().toISOString() }).eq("id", u.id); continue; }
    await admin.auth.admin.deleteUser(u.id as string);
    n++;
  }
  await admin.from("companies").delete().eq("tenant_id", tenantId).like("name", `${VISITOR_COMPANY}%`);   // customer visitors' companies (their devices and tickets were wiped by the reset)
  return n;
}
