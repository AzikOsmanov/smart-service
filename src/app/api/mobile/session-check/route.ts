import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLoginPolicy, ipAllowed, isAdminUser, registerDevice, clientInfo, logLoginEvent } from "@/lib/login-security";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

// The mobile app asks this after signing in and whenever it comes back to the foreground:
// is this phone allowed (network allow-list), is the device new (alert), and how long may a session last?
export async function POST(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const db = supabaseAdmin();
  const { data: au } = await db.auth.getUser(jwt);
  if (!au.user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const deviceId = String(body.device_id ?? "").slice(0, 80);
  const label = String(body.device_name ?? "Mobile app").slice(0, 80);
  const first = body.first === true;   // true right after a sign-in

  const { data: u } = await db.from("users").select("id,tenant_id,kind,email,first_name,last_name").eq("id", au.user.id).maybeSingle();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const policy = await getLoginPolicy(u.tenant_id);
  const { ip, ua } = await clientInfo();
  const admin = policy.ip_include_admins ? false : await isAdminUser(u.id);
  if (!ipAllowed(policy, { ip, staff: u.kind === "staff", admin, client: "mobile" })) {
    if (first) await logLoginEvent({ tenantId: u.tenant_id, userId: u.id, email: u.email, event: "login_failed", reason: "ip_not_allowed (mobile)" });
    return NextResponse.json({ ok: false, reason: "ip" }, { headers: CORS });
  }
  // A sign-in is recorded when the person just typed their password, and also when a saved session
  // starts on a phone not seen for 12 hours (e.g. after an app update), so the history never misses a phone.
  let resumed = false;
  if (!first && deviceId) {
    const { data: kd } = await db.from("known_devices").select("last_seen_at").eq("user_id", u.id).eq("device_id", deviceId).maybeSingle();
    resumed = !kd || Date.now() - new Date(kd.last_seen_at).getTime() > 12 * 3600 * 1000;
  }
  if (first || resumed) {
    await db.from("login_events").insert({ tenant_id: u.tenant_id, user_id: u.id, email_attempted: u.email, event: "login_success", client: "mobile", ip_address: ip, user_agent: ua, device_label: label, failure_reason: resumed ? "session resumed" : null });
    if (first) await db.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", u.id);
  }
  await db.from("users").update({ last_seen_at: new Date().toISOString(), last_seen_client: "mobile" }).eq("id", u.id);
  if (deviceId) {
    try { await registerDevice({ tenantId: u.tenant_id, userId: u.id, email: u.email, name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email, deviceId, client: "mobile", label, ua, ip, policy }); } catch { /* never blocks */ }
  }
  return NextResponse.json({ ok: true, session_hours: policy.session_hours, idle_minutes: policy.idle_minutes_mobile }, { headers: CORS });
}
