import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LoginPolicy = {
  max_failed_attempts: number; lockout_minutes: number;
  ip_allowlist: string[]; ip_scope: "staff" | "all"; ip_include_admins: boolean; ip_apply_mobile: boolean;
  session_hours: number; idle_minutes_web: number; idle_minutes_mobile: number; alert_new_device: boolean; alert_admins: boolean;
};
const DEFAULTS: LoginPolicy = {
  max_failed_attempts: 5, lockout_minutes: 15,
  ip_allowlist: [], ip_scope: "staff", ip_include_admins: false, ip_apply_mobile: false,
  session_hours: 0, idle_minutes_web: 15, idle_minutes_mobile: 0, alert_new_device: true, alert_admins: true,
};

// 0 = off, otherwise 3..480 minutes.
const idleOf = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? (x <= 0 ? 0 : Math.min(480, Math.max(3, Math.round(x)))) : d);

export async function getLoginPolicy(tenantId: string): Promise<LoginPolicy> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("tenant_id", tenantId).eq("key", "login_security").maybeSingle();
  return parseLoginPolicy(data?.value);
}
export function parseLoginPolicy(raw: unknown): LoginPolicy {
  const v = (raw ?? {}) as Partial<LoginPolicy>;
  return {
    max_failed_attempts: Number.isFinite(v.max_failed_attempts) ? Math.max(1, Number(v.max_failed_attempts)) : DEFAULTS.max_failed_attempts,
    lockout_minutes: Number.isFinite(v.lockout_minutes) ? Math.max(1, Number(v.lockout_minutes)) : DEFAULTS.lockout_minutes,
    ip_allowlist: Array.isArray(v.ip_allowlist) ? v.ip_allowlist.filter((x): x is string => typeof x === "string") : DEFAULTS.ip_allowlist,
    ip_scope: v.ip_scope === "all" ? "all" : "staff",
    ip_include_admins: v.ip_include_admins === true,
    ip_apply_mobile: v.ip_apply_mobile === true,
    session_hours: Number.isFinite(v.session_hours) ? Math.min(720, Math.max(0, Number(v.session_hours))) : 0,
    idle_minutes_web: idleOf(v.idle_minutes_web, DEFAULTS.idle_minutes_web),
    idle_minutes_mobile: idleOf(v.idle_minutes_mobile, DEFAULTS.idle_minutes_mobile),
    alert_new_device: v.alert_new_device !== false,
    alert_admins: v.alert_admins !== false,
  };
}

// ---- IP allow-list: single addresses and IPv4 ranges like 192.168.1.0/24 (IPv6: exact addresses) ----
const v4 = (ip: string): number | null => {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
};
const normIp = (ip: string) => ip.trim().toLowerCase().replace(/^::ffff:/, "");
export function validIpEntry(e: string): boolean {
  const [addr, bits] = e.trim().split("/");
  if (v4(addr) !== null) return bits === undefined || (/^\d{1,2}$/.test(bits) && Number(bits) <= 32);
  return bits === undefined && /^[0-9a-f:]{3,45}$/i.test(addr) && addr.includes(":");
}
export function ipInList(ip: string | null, list: string[]): boolean {
  if (!ip) return false;
  const me = normIp(ip);
  const meN = v4(me);
  for (const raw of list) {
    const [addr, bits] = raw.trim().toLowerCase().split("/");
    const a = v4(addr);
    if (a !== null && meN !== null) {
      const b = bits === undefined ? 32 : Number(bits);
      const mask = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
      if (((a & mask) >>> 0) === ((meN & mask) >>> 0)) return true;
    } else if (a === null && addr === me) return true;
  }
  return false;
}

// Is this sign-in / request allowed from this address? Administrators are exempt unless the policy says otherwise,
// so an administrator can never be locked out by a wrong list.
export function ipAllowed(policy: LoginPolicy, o: { ip: string | null; staff: boolean; admin: boolean; client: "web" | "mobile" }): boolean {
  if (policy.ip_allowlist.length === 0) return true;
  if (o.client === "mobile" && !policy.ip_apply_mobile) return true;
  if (policy.ip_scope === "staff" && !o.staff) return true;
  if (o.admin && !policy.ip_include_admins) return true;
  return ipInList(o.ip, policy.ip_allowlist);
}

export function browserLabel(ua: string | null): string {
  if (!ua) return "—";
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${b}${o ? " / " + o : ""}`;
}

// Remembers the browser / phone and raises an alert (to the user, and to administrators) when an account is used from a new one.
// A user's very first device is remembered silently.
export async function registerDevice(o: {
  tenantId: string; userId: string; email: string; name: string; deviceId: string; client: "web" | "mobile"; label: string; ua: string | null; ip: string | null; policy: LoginPolicy;
}) {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("known_devices").select("id").eq("user_id", o.userId);
  const known = (existing ?? []).length;
  const { data: row } = await db.from("known_devices").select("id").eq("user_id", o.userId).eq("device_id", o.deviceId).maybeSingle();
  const now = new Date().toISOString();
  if (row) { await db.from("known_devices").update({ last_seen_at: now, last_ip: o.ip, user_agent: o.ua }).eq("id", row.id); return false; }
  await db.from("known_devices").insert({ tenant_id: o.tenantId, user_id: o.userId, device_id: o.deviceId, client: o.client, label: o.label, user_agent: o.ua, first_ip: o.ip, last_ip: o.ip });
  if (known === 0) return false;
  await db.from("login_events").insert({ tenant_id: o.tenantId, user_id: o.userId, email_attempted: o.email, event: "new_device_login", client: o.client, ip_address: o.ip, user_agent: o.ua, device_label: o.label });
  const data = { device: o.label, ip: o.ip ?? "?", name: o.name };
  const rows: { tenant_id: string; user_id: string; kind: string; ticket_id: null; data: object }[] = [];
  if (o.policy.alert_new_device) rows.push({ tenant_id: o.tenantId, user_id: o.userId, kind: "login_new_device", ticket_id: null, data });
  if (o.policy.alert_admins) {
    const { data: adm } = await db.from("user_roles").select("user_id, roles!inner(is_admin,deleted_at)").eq("roles.is_admin", true).is("roles.deleted_at", null);
    const ids = Array.from(new Set((adm ?? []).map((a: any) => a.user_id as string))).filter((id) => id !== o.userId);
    if (ids.length) {
      const { data: us } = await db.from("users").select("id").in("id", ids).eq("tenant_id", o.tenantId).is("deleted_at", null);
      for (const u of us ?? []) rows.push({ tenant_id: o.tenantId, user_id: u.id, kind: "login_new_device_admin", ticket_id: null, data });
    }
  }
  if (rows.length) await db.from("notifications").insert(rows);
  return true;
}

export async function clientInfo() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for") ?? "";
  const ip = (fwd.split(",")[0] || h.get("x-real-ip") || "").trim() || null;
  return { ip, ua: (h.get("user-agent") ?? "").slice(0, 300) || null };
}

type Ev = "logout" | "login_success" | "login_failed" | "account_locked" | "account_unlocked";
export async function logLoginEvent(o: { tenantId: string; userId?: string | null; email: string; event: Ev; reason?: string | null }) {
  const { ip, ua } = await clientInfo();
  await supabaseAdmin().from("login_events").insert({
    tenant_id: o.tenantId, user_id: o.userId ?? null, email_attempted: o.email, event: o.event,
    client: "web", ip_address: ip, user_agent: ua, failure_reason: o.reason ?? null,
  });
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("user_roles").select("roles!inner(is_admin,deleted_at)").eq("user_id", userId).eq("roles.is_admin", true).is("roles.deleted_at", null).limit(1);
  return (data ?? []).length > 0;
}
