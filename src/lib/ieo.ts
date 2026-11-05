// IEP (iep.infraneuro.com, "IEO" in code) connector, server only. Separate from 1C. Three ways to talk to IEO, chosen by the administrator:
//   rest    - JSON over HTTP, paths and field names come from the settings
//   odata   - OData v2/v3/v4 style entity sets
//   iep     - IEP is a Supabase app: we sign in as a dedicated IEP user and call its own functions (lookup_service_serial, create_service_ticket, set_service_ticket_status)
//   webhook - we POST signed JSON events to a URL; IEO can also call us back (see /api/webhooks/ieo/[id])
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkBaseUrl } from "@/lib/onec";

export type IeoMode = "rest" | "odata" | "webhook" | "iep";
export type IeoMap = {
  mode?: IeoMode;
  auth_header?: string;   // header name for api_key (default X-API-Key)
  lookup?: { entity?: string; path?: string; serial_field?: string; result_path?: string; model_field?: string; warranty_field?: string; sold_field?: string; customer_field?: string };
  ticket?: {
    entity?: string; create_path?: string; create_method?: string; update_path?: string; update_method?: string;
    ticket_no_field?: string; serial_field?: string; subject_field?: string; description_field?: string; customer_field?: string; status_field?: string;
    id_field?: string; number_field?: string; extra?: Record<string, unknown>;
  };
  status_map?: Partial<Record<"in_progress" | "done" | "rma" | "repair_not_possible", string>>;
};
export type IeoConn = {
  id: string; tenant_id: string; kind: string; base_url: string; auth_type: string; is_enabled: boolean; fm: IeoMap;
  username: string; password: string; token: string; webhook_secret: string;
};

export async function loadIeoById(id: string): Promise<IeoConn | null> {
  const { data: row } = await supabaseAdmin().from("integrations").select("id,tenant_id,kind,base_url,auth_type,field_map,is_enabled").eq("id", id).maybeSingle();
  return row ? withSecret(row) : null;
}
export async function loadIeo(kind: "ieo_device_lookup" | "ieo_service_sync", tenantId: string, opts: { onlyEnabled?: boolean } = {}): Promise<IeoConn | null> {
  const { data: row } = await supabaseAdmin().from("integrations").select("id,tenant_id,kind,base_url,auth_type,field_map,is_enabled").eq("tenant_id", tenantId).eq("kind", kind).maybeSingle();
  if (!row || (opts.onlyEnabled && !row.is_enabled)) return null;
  return withSecret(row);
}
async function withSecret(row: any): Promise<IeoConn> {
  const { data: secret } = await supabaseAdmin().rpc("integration_read_secret", { p_integration: row.id });
  let j: any = {};
  try { j = JSON.parse(String(secret ?? "{}")); } catch { /* no secret saved yet */ }
  return {
    id: row.id, tenant_id: row.tenant_id, kind: row.kind, base_url: row.base_url ?? "", auth_type: row.auth_type, is_enabled: row.is_enabled,
    fm: (row.field_map ?? {}) as IeoMap, username: j.u ?? "", password: j.p ?? "", token: j.t ?? "", webhook_secret: j.w ?? "",
  };
}

const get = (o: any, path?: string) => (path ? path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o) : undefined);
const q1 = (s: string) => s.replace(/'/g, "''");
const asDate = (v: unknown): string | null => {
  const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m && m[1] !== "0001" ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars[k] ?? ""));

function authHeaders(c: IeoConn): Record<string, string> {
  if (c.auth_type === "basic") return c.username ? { Authorization: "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64") } : {};
  if (c.auth_type === "bearer") return c.token ? { Authorization: `Bearer ${c.token}` } : {};
  if (c.auth_type === "api_key") return c.token ? { [c.fm.auth_header || "X-API-Key"]: c.token } : {};
  return {};
}

async function http(c: IeoConn, method: string, url: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const bad = checkBaseUrl(url);
  if (bad) throw new Error(bad);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const raw = body === undefined ? undefined : JSON.stringify(body);
    const res = await fetch(url, {
      method, cache: "no-store", signal: ctrl.signal,
      headers: { Accept: "application/json", ...(raw ? { "Content-Type": "application/json" } : {}), ...authHeaders(c), ...extra },
      body: raw,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok && res.status !== 404) {
      const detail = json?.error?.message ?? json?.message ?? json?.error ?? json?.["odata.error"]?.message?.value ?? text;
      throw new Error(`IEP answered ${res.status}${res.status === 401 || res.status === 403 ? " (access key or login rejected)" : ""}: ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).replace(/\s+/g, " ").slice(0, 250)}`);
    }
    return { status: res.status, json };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("IEP did not answer within 20 seconds.");
    throw e instanceof Error ? e : new Error(String(e));
  } finally { clearTimeout(timer); }
}
const join = (base: string, path: string) => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;


// ---- IEP (Supabase) mode -------------------------------------------------------------------------------------------------
// base_url = https://<ref>.supabase.co, token = IEP anon key, username/password = the dedicated IEP user (role reception).
const IEP_STATUS: Record<string, string> = { in_progress: "diagnosis", done: "completed", rma: "replacement_device", repair_not_possible: "not_repairable" };
async function iepSession(c: IeoConn): Promise<{ key: string; jwt: string }> {
  if (!c.token || !c.username || !c.password) throw new Error("IEP needs the anon key, the IEP user e-mail and the password.");
  const base = c.base_url.replace(/\/+$/, "");
  const r = await http(c, "POST", `${base}/auth/v1/token?grant_type=password`, { email: c.username, password: c.password }, { apikey: c.token });
  const jwt = r.json?.access_token;
  if (!jwt) throw new Error("IEP sign-in failed: " + String(r.json?.error_description ?? r.json?.msg ?? "no token returned"));
  return { key: c.token, jwt };
}
async function iepCall(c: IeoConn, ses: { key: string; jwt: string }, method: string, path: string, body?: unknown): Promise<any> {
  const r = await http(c, method, `${c.base_url.replace(/\/+$/, "")}/rest/v1/${path}`, body, { apikey: ses.key, Authorization: `Bearer ${ses.jwt}`, "Content-Profile": "public", "Accept-Profile": "public" });
  return r.json;
}
async function iepLookup(c: IeoConn, serial: string): Promise<Lookup> {
  const ses = await iepSession(c);
  const j = await iepCall(c, ses, "POST", "rpc/lookup_service_serial", { p_serial: serial });
  if (!j?.matched) return { found: false, model: null, warranty_until: null, sold_date: null, customer_name: null, raw: null };
  const name = [j.product_brand, j.product_model || j.product_name].filter(Boolean).join(" ") || null;
  const model = name ? (j.warranty_label ? `${name} (${j.warranty_label})` : name) : null;
  return { found: true, model, warranty_until: asDate(j.warranty_until), sold_date: asDate(j.purchase_date), customer_name: null, raw: j };
}
async function iepCreate(c: IeoConn, t: NewTicket): Promise<{ id: string | null; number: string }> {
  const ses = await iepSession(c);
  const name = (t.customer || "").trim() || "Smart Service customer";
  const found = await iepCall(c, ses, "GET", `customers?select=id&deleted_at=is.null&display_name=ilike.${encodeURIComponent(name.replace(/[%*,()]/g, " ").trim())}&limit=1`);
  let customerId: string | undefined = found?.[0]?.id;
  if (!customerId) customerId = String(await iepCall(c, ses, "POST", "rpc/create_customer", { p_display_name: name, p_customer_type: "business", p_notes: "Created by Smart Service" }));
  const complaint = [t.subject, t.description].filter(Boolean).join("\n");
  const id = String(await iepCall(c, ses, "POST", "rpc/create_service_ticket", { p_payload: { serial_number: t.serial, customer_id: customerId, customer_complaint: `[Smart Service #${t.ticket_no}] ${complaint}`.slice(0, 2000) } }));
  const row = await iepCall(c, ses, "GET", `service_tickets?select=ticket_number&id=eq.${encodeURIComponent(id)}&limit=1`);
  return { id, number: String(row?.[0]?.ticket_number ?? t.ticket_no) };
}
async function iepStatus(c: IeoConn, externalId: string, status: string): Promise<void> {
  const value = (c.fm.status_map as Record<string, string> | undefined)?.[status] || IEP_STATUS[status];
  if (!value) throw new Error(`No IEP status is mapped for "${status}".`);
  const ses = await iepSession(c);
  await iepCall(c, ses, "POST", "rpc/set_service_ticket_status", { p_ticket_id: externalId, p_status: value });
}

export function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export type Lookup = { found: boolean; model: string | null; warranty_until: string | null; sold_date: string | null; customer_name: string | null; raw: unknown };
export async function lookupDevice(c: IeoConn, serial: string): Promise<Lookup> {
  const m = c.fm.lookup ?? {};
  const mode = c.fm.mode ?? "rest";
  const none: Lookup = { found: false, model: null, warranty_until: null, sold_date: null, customer_name: null, raw: null };
  let rec: any;
  if (mode === "iep") return iepLookup(c, serial);
  if (mode === "webhook") throw new Error("In webhook mode IEO sends the device data to us; there is nothing to ask. Switch the mode to REST or OData to read on demand.");
  if (mode === "odata") {
    if (!m.entity || !m.serial_field) throw new Error("Device lookup is not configured: set the entity and the serial number field.");
    const url = `${join(c.base_url, encodeURIComponent(m.entity))}?$format=json&$top=1&$filter=${encodeURIComponent(`${m.serial_field} eq '${q1(serial)}'`)}`;
    const r = await http(c, "GET", url);
    rec = (r.json?.value ?? r.json?.d?.results ?? [])[0];
  } else {
    if (!m.path) throw new Error("Device lookup is not configured: set the path, for example /devices/{serial}.");
    const r = await http(c, "GET", join(c.base_url, fill(m.path, { serial })));
    if (r.status === 404) return none;
    rec = get(r.json, m.result_path) ?? r.json;
    if (Array.isArray(rec)) rec = rec[0];
  }
  if (!rec || typeof rec !== "object") return none;
  const s = (p?: string) => { const v = get(rec, p); return v == null || v === "" ? null : String(v); };
  return { found: true, model: s(m.model_field), warranty_until: asDate(get(rec, m.warranty_field)), sold_date: asDate(get(rec, m.sold_field)), customer_name: s(m.customer_field), raw: rec };
}

export type NewTicket = { ticket_no: number | string; serial: string; subject: string; description: string; customer: string };
export async function createTicket(c: IeoConn, t: NewTicket): Promise<{ id: string | null; number: string }> {
  const m = c.fm.ticket ?? {};
  const mode = c.fm.mode ?? "rest";
  const idF = m.id_field || (mode === "odata" ? "Ref_Key" : "id"), numF = m.number_field || (mode === "odata" ? "Number" : "number");
  if (mode === "iep") return iepCreate(c, t);
  if (mode === "webhook") {
    const payload = { event: "ticket.created", ticket: { ticket_no: t.ticket_no, serial: t.serial, subject: t.subject, description: t.description, customer: t.customer, ...(m.extra ?? {}) } };
    await postSigned(c, payload);
    return { id: String(t.ticket_no), number: String(t.ticket_no) };
  }
  const body: Record<string, unknown> = { ...(m.extra ?? {}) };
  const put = (f: string | undefined, v: unknown) => { if (f) body[f] = v; };
  put(m.ticket_no_field, String(t.ticket_no)); put(m.serial_field, t.serial); put(m.subject_field, t.subject); put(m.description_field, t.description); put(m.customer_field, t.customer);
  let res: any;
  if (mode === "odata") {
    if (!m.entity) throw new Error("Ticket sync is not configured: set the entity name.");
    res = (await http(c, "POST", `${join(c.base_url, encodeURIComponent(m.entity))}?$format=json`, body)).json;
    res = res?.d ?? res;
  } else {
    if (!m.create_path) throw new Error("Ticket sync is not configured: set the create path, for example /tickets.");
    res = (await http(c, (m.create_method || "POST").toUpperCase(), join(c.base_url, m.create_path), body)).json;
  }
  const id = get(res, idF), num = get(res, numF);
  return { id: id == null ? String(t.ticket_no) : String(id), number: String(num ?? t.ticket_no) };
}

export async function updateStatus(c: IeoConn, ref: { id: string; number: string; ticket_no: string }, status: string): Promise<void> {
  const m = c.fm.ticket ?? {};
  const mode = c.fm.mode ?? "rest";
  if (mode === "iep") return iepStatus(c, ref.id, status);
  const value = (c.fm.status_map as Record<string, string> | undefined)?.[status] ?? (mode === "webhook" ? status : undefined);
  if (!value) throw new Error(`No IEP value is mapped for the status "${status}".`);
  if (mode === "webhook") { await postSigned(c, { event: "ticket.status_changed", ticket: { ticket_no: ref.ticket_no, external_id: ref.id, status: value, internal_status: status } }); return; }
  if (!m.status_field) throw new Error("Ticket sync is not configured: set the status field.");
  if (mode === "odata") {
    if (!m.entity) throw new Error("Ticket sync is not configured: set the entity name.");
    await http(c, "PATCH", `${join(c.base_url, encodeURIComponent(m.entity))}(guid'${q1(ref.id)}')?$format=json`, { [m.status_field]: value });
    return;
  }
  if (!m.update_path) throw new Error("Ticket sync is not configured: set the update path, for example /tickets/{id}.");
  await http(c, (m.update_method || "PATCH").toUpperCase(), join(c.base_url, fill(m.update_path, { id: ref.id, number: ref.number, ticket_no: ref.ticket_no })), { [m.status_field]: value });
}

async function postSigned(c: IeoConn, payload: unknown) {
  const body = JSON.stringify(payload);
  const sig: Record<string, string> = {};
  if (c.webhook_secret) sig["X-Signature"] = sign(c.webhook_secret, body);
  await http(c, "POST", c.base_url, JSON.parse(body), sig);   // http() re-serialises the same JSON, so the signature matches the bytes sent
}

export async function testReach(c: IeoConn): Promise<string> {
  const mode = c.fm.mode ?? "rest";
  if (mode === "iep") { const ses = await iepSession(c); await iepCall(c, ses, "POST", "rpc/lookup_service_serial", { p_serial: "TEST-CONNECTION" }); return "Connected to IEP and signed in."; }
  if (mode === "webhook") { await postSigned(c, { event: "ping" }); return "Connected. IEP accepted a test ping."; }
  const base = c.base_url.replace(/\/+$/, "");
  const target = mode === "odata" ? `${join(base, encodeURIComponent(c.fm.ticket?.entity || c.fm.lookup?.entity || ""))}?$format=json&$top=1` : base;
  if (mode === "odata" && !(c.fm.ticket?.entity || c.fm.lookup?.entity)) throw new Error("Set the entity name first.");
  const r = await http(c, "GET", target);
  return r.status === 404 ? "The address answered 404 (not found). Check the base address." : `Connected. IEP answered ${r.status}.`;
}
