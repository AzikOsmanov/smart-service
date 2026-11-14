import { startDemo, startDemoCustomer } from "@/lib/demo-actions";
import PasswordInput from "@/components/PasswordInput";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLoginPolicy, logLoginEvent, clientInfo, ipAllowed, isAdminUser, registerDevice, browserLabel } from "@/lib/login-security";
import HashAuth from "@/components/HashAuth";
import { getPortal } from "@/lib/i18n-portal";
import { getStaff } from "@/lib/i18n-staff";

async function signIn(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const fail = (code: string, n?: number): never => redirect("/login?e=" + code + (n ? "&n=" + n : ""));
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("id,tenant_id,kind,first_name,last_name,is_active,locked_until,failed_login_count").eq("email", email).is("deleted_at", null).maybeSingle();
  const tenantId = u?.tenant_id ?? (await admin.from("tenants").select("id").eq("slug", "default").maybeSingle()).data?.id;

  if (u && u.is_active === false) {
    if (tenantId) await logLoginEvent({ tenantId, userId: u.id, email, event: "login_failed", reason: "deactivated" });
    fail("deactivated");
  }
  if (u?.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.max(1, Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000));
    await logLoginEvent({ tenantId: u.tenant_id, userId: u.id, email, event: "login_failed", reason: "locked" });
    fail("locked", mins);
  }

  // Network allow-list: checked before the password, so a blocked address learns nothing.
  if (u && tenantId) {
    const policy = await getLoginPolicy(tenantId);
    if (policy.ip_allowlist.length) {
      const { ip } = await clientInfo();
      const admin2 = policy.ip_include_admins ? false : await isAdminUser(u.id);
      if (!ipAllowed(policy, { ip, staff: u.kind === "staff", admin: admin2, client: "web" })) {
        await logLoginEvent({ tenantId, userId: u.id, email, event: "login_failed", reason: "ip_not_allowed" });
        fail("ip");
      }
    }
  }

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (u && tenantId) {
      const policy = await getLoginPolicy(tenantId);
      const count = (u.failed_login_count ?? 0) + 1;
      if (count >= policy.max_failed_attempts) {
        await admin.from("users").update({ failed_login_count: 0, locked_until: new Date(Date.now() + policy.lockout_minutes * 60000).toISOString() }).eq("id", u.id);
        await logLoginEvent({ tenantId, userId: u.id, email, event: "account_locked", reason: `${policy.max_failed_attempts} failed attempts` });
      } else {
        await admin.from("users").update({ failed_login_count: count }).eq("id", u.id);
      }
      await logLoginEvent({ tenantId, userId: u.id, email, event: "login_failed", reason: error.message.slice(0, 120) });
    } else if (tenantId) {
      await logLoginEvent({ tenantId, email, event: "login_failed", reason: "unknown email" });
    }
    fail(/invalid login/i.test(error.message) ? "creds" : /not confirmed/i.test(error.message) ? "unconfirmed" : "raw:" + encodeURIComponent(error.message.slice(0, 160)));
  }
  if (u && tenantId) {
    await admin.from("users").update({ failed_login_count: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq("id", u.id);
    await logLoginEvent({ tenantId, userId: u.id, email, event: "login_success" });
    const policy = await getLoginPolicy(tenantId);
    const jar = await cookies();
    const secure = process.env.NODE_ENV === "production";
    // Session length: the browser remembers when this sign-in must end (checked on every request).
    if (policy.session_hours > 0) jar.set("ss_exp", String(Date.now() + policy.session_hours * 3600 * 1000), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    else jar.delete("ss_exp");
    // Inactivity sign-out: the server remembers when this browser was last active (refreshed by /api/activity and page visits).
    if (policy.idle_minutes_web > 0) {
      jar.set("ss_idle", String(policy.idle_minutes_web), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
      jar.set("ss_act", String(Date.now()), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    } else { jar.delete("ss_idle"); jar.delete("ss_act"); }
    // New-device alert: every browser gets a private id the first time it signs in.
    let deviceId = jar.get("ss_dev")?.value ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(deviceId)) { deviceId = crypto.randomUUID(); jar.set("ss_dev", deviceId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 }); }
    const { ip, ua } = await clientInfo();
    try { await registerDevice({ tenantId, userId: u.id, email, name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || email, deviceId, client: "web", label: browserLabel(ua), ua, ip, policy }); } catch { /* an alert problem must never block sign-in */ }
  }
  redirect("/dashboard");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; e?: string; n?: string }> }) {
  const sp = await searchParams;
  const { S } = await getStaff();
  const n = String(Math.min(9999, Math.max(1, Number(sp.n) || 1)));
  const codes: Record<string, string> = { deactivated: S.loginDeactivated, locked: S.loginLocked.replace("{n}", n), ip: S.loginIpBlocked, blocked: S.accessIpBlocked, session: S.loginSessionEnded, idle: S.loginIdle, creds: S.loginBadCreds, unconfirmed: S.loginEmailUnconfirmed };
  const error = sp.e ? (codes[sp.e] ?? (sp.e.startsWith("raw:") ? (() => { try { return decodeURIComponent(sp.e!.slice(4)); } catch { return ""; } })() : "")) : sp.error;
  const { t } = await getT();
  const { L } = await getPortal();
  return (
    <form action={signIn} className="card">
      <h1>{t("signIn")}</h1>
      <HashAuth L={L} />
      <label>{t("email")}<input name="email" type="email" required /></label>
      <label>{t("password")}<PasswordInput name="password" autoComplete="current-password" required /></label>
      {error && <p className="err">{error}</p>}
      <button>{t("signIn")}</button>
      <p><a href="/forgot">{L.forgotLink}</a></p>
      <p>{t("noAccount")} <a href="/register">{t("register")}</a></p>
      <hr style={{ border: 0, borderTop: "1px solid var(--border, #8884)", margin: "14px 0" }} />
      <p style={{ margin: "0 0 8px" }}><small>{S.demoNote}</small></p>
      <div className="row"><button type="submit" formAction={startDemo} formNoValidate className="btn">{S.demoTryStaff}</button><button type="submit" formAction={startDemoCustomer} formNoValidate className="btn">{S.demoTryCustomer}</button></div>
      <p style={{ marginBottom: 0 }}><a href="/download">{S.dlLogin}</a></p>
    </form>
  );
}
