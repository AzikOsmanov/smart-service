// 1C OData connector (server only). All 1C names (entity sets, fields) come from the field map saved by the administrator.
import { supabaseAdmin } from "@/lib/supabase-admin";

export type FieldMap = {
  lookup?: { entity?: string; serial_field?: string; model_field?: string; warranty_field?: string; sold_field?: string; customer_field?: string };
  ticket?: { entity?: string; ticket_no_field?: string; serial_field?: string; subject_field?: string; description_field?: string; customer_field?: string; status_field?: string; id_field?: string; number_field?: string; extra?: Record<string, unknown> };
  status_map?: Partial<Record<"in_progress" | "done" | "rma" | "repair_not_possible", string>>;
};
export type Conn = { id: string; tenant_id: string; kind: string; base_url: string; username: string; password: string; fm: FieldMap; is_enabled: boolean };

export async function loadConnection(kind: "device_lookup" | "service_sync", tenantId: string, opts: { onlyEnabled?: boolean } = {}): Promise<Conn | null> {
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("integrations").select("id,tenant_id,kind,base_url,field_map,is_enabled").eq("tenant_id", tenantId).eq("kind", kind).maybeSingle();
  if (!row || (opts.onlyEnabled && !row.is_enabled)) return null;
  return withSecret(row);
}
export async function loadConnectionById(id: string): Promise<Conn | null> {
  const { data: row } = await supabaseAdmin().from("integrations").select("id,tenant_id,kind,base_url,field_map,is_enabled").eq("id", id).maybeSingle();
  return row ? withSecret(row) : null;
}
async function withSecret(row: any): Promise<Conn> {
  const { data: secret } = await supabaseAdmin().rpc("integration_read_secret", { p_integration: row.id });
  let username = "", password = "";
  try { const j = JSON.parse(String(secret ?? "{}")); username = j.u ?? ""; password = j.p ?? ""; } catch { /* no secret saved yet */ }
  return { id: row.id, tenant_id: row.tenant_id, kind: row.kind, base_url: row.base_url ?? "", username, password, fm: (row.field_map ?? {}) as FieldMap, is_enabled: row.is_enabled };
}

export function checkBaseUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "The address is not a valid URL."; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "The address must start with https:// (or http://).";
  if (/^(169\.254\.|127\.|0\.0\.0\.0|localhost$)/i.test(u.hostname)) return "This address is not allowed.";
  return null;
}

async function call(conn: Conn, method: "GET" | "POST" | "PATCH", path: string, query: Record<string, string> = {}, body?: unknown): Promise<any> {
  const bad = checkBaseUrl(conn.base_url);
  if (bad) throw new Error(bad);
  if (!conn.username) throw new Error("The 1C login is not saved yet.");
  const qs = Object.entries({ $format: "json", ...query }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const url = `${conn.base_url.replace(/\/+$/, "")}/${path}?${qs}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method, cache: "no-store", signal: ctrl.signal,
      headers: { Authorization: "Basic " + Buffer.from(`${conn.username}:${conn.password}`).toString("base64"), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) {
      const detail = json?.["odata.error"]?.message?.value ?? json?.error?.message?.value ?? json?.error?.message ?? text;
      throw new Error(`1C answered ${res.status}${res.status === 401 ? " (login or password rejected)" : ""}: ${String(detail).replace(/\s+/g, " ").slice(0, 250)}`);
    }
    return json;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("1C did not answer within 20 seconds.");
    throw e instanceof Error ? e : new Error(String(e));
  } finally { clearTimeout(timer); }
}

const q1 = (s: string) => s.replace(/'/g, "''");
const get = (o: any, path?: string) => (path ? path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o) : undefined);
const asDate = (v: unknown): string | null => {
  const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m && m[1] !== "0001" ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const ent = (name: string) => encodeURIComponent(name);

export type Lookup = { found: boolean; model: string | null; warranty_until: string | null; sold_date: string | null; customer_name: string | null; raw: unknown };

export async function lookupDevice(conn: Conn, serial: string): Promise<Lookup> {
  const m = conn.fm.lookup;
  if (!m?.entity || !m.serial_field) throw new Error("Device lookup is not configured: set the entity and the serial number field.");
  const json = await call(conn, "GET", ent(m.entity), { $filter: `${m.serial_field} eq '${q1(serial)}'`, $top: "1" });
  const rec = (json?.value ?? [])[0];
  if (!rec) return { found: false, model: null, warranty_until: null, sold_date: null, customer_name: null, raw: null };
  const s = (p?: string) => { const v = get(rec, p); return v == null || v === "" ? null : String(v); };
  return { found: true, model: s(m.model_field), warranty_until: asDate(get(rec, m.warranty_field)), sold_date: asDate(get(rec, m.sold_field)), customer_name: s(m.customer_field), raw: rec };
}

export type NewTicket = { ticket_no: number | string; serial: string; subject: string; description: string; customer: string };
export async function createServiceTicket(conn: Conn, t: NewTicket): Promise<{ id: string | null; number: string }> {
  const m = conn.fm.ticket;
  if (!m?.entity) throw new Error("Ticket sync is not configured: set the entity name.");
  const idF = m.id_field || "Ref_Key", numF = m.number_field || "Number";
  if (m.ticket_no_field) {   // the ticket number is the duplicate key: a retry never makes a second service ticket
    const ex = await call(conn, "GET", ent(m.entity), { $filter: `${m.ticket_no_field} eq '${q1(String(t.ticket_no))}'`, $top: "1" });
    const rec = (ex?.value ?? [])[0];
    if (rec) return { id: rec[idF] ?? null, number: String(rec[numF] ?? t.ticket_no) };
  }
  const body: Record<string, unknown> = { ...(m.extra ?? {}) };
  const put = (f: string | undefined, v: unknown) => { if (f) body[f] = v; };
  put(m.ticket_no_field, String(t.ticket_no)); put(m.serial_field, t.serial); put(m.subject_field, t.subject); put(m.description_field, t.description); put(m.customer_field, t.customer);
  const res = await call(conn, "POST", ent(m.entity), {}, body);
  return { id: res?.[idF] ?? null, number: String(res?.[numF] ?? t.ticket_no) };
}

export async function updateStatus(conn: Conn, externalId: string, status: string): Promise<void> {
  const m = conn.fm.ticket;
  if (!m?.entity || !m.status_field) throw new Error("Ticket sync is not configured: set the status field.");
  const value = (conn.fm.status_map as Record<string, string> | undefined)?.[status];
  if (!value) throw new Error(`No 1C value is mapped for the status "${status}".`);
  await call(conn, "PATCH", `${ent(m.entity)}(guid'${q1(externalId)}')`, {}, { [m.status_field]: value });
}

export async function testReach(conn: Conn, entity: string | undefined): Promise<string> {
  if (!entity) throw new Error("Set the entity name first.");
  const json = await call(conn, "GET", ent(entity), { $top: "1" });
  return `Connected. "${entity}" answered with ${(json?.value ?? []).length} record(s) in the test.`;
}
