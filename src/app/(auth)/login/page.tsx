import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLoginPolicy, logLoginEvent } from "@/lib/login-security";
import HashAuth from "@/components/HashAuth";
import { getPortal } from "@/lib/i18n-portal";

async function signIn(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const fail = (m: string): never => redirect("/login?error=" + encodeURIComponent(m));
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("id,tenant_id,is_active,locked_until,failed_login_count").eq("email", email).is("deleted_at", null).maybeSingle();
  const tenantId = u?.tenant_id ?? (await admin.from("tenants").select("id").eq("slug", "default").maybeSingle()).data?.id;

  if (u && u.is_active === false) {
    if (tenantId) await logLoginEvent({ tenantId, userId: u.id, email, event: "login_failed", reason: "deactivated" });
    fail("This account is deactivated. Contact the service center.");
  }
  if (u?.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.max(1, Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000));
    await logLoginEvent({ tenantId: u.tenant_id, userId: u.id, email, event: "login_failed", reason: "locked" });
    fail(`Too many failed attempts. The account is locked for about ${mins} more minute(s), or ask the administrator to unlock it.`);
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
    fail(error.message);
  }
  if (u && tenantId) {
    await admin.from("users").update({ failed_login_count: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq("id", u.id);
    await logLoginEvent({ tenantId, userId: u.id, email, event: "login_success" });
  }
  redirect("/tickets");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { t } = await getT();
  const { L } = await getPortal();
  return (
    <form action={signIn} className="card">
      <h1>{t("signIn")}</h1>
      <HashAuth L={L} />
      <label>{t("email")}<input name="email" type="email" required /></label>
      <label>{t("password")}<input name="password" type="password" required /></label>
      {error && <p className="err">{error}</p>}
      <button>{t("signIn")}</button>
      <p><a href="/forgot">{L.forgotLink}</a></p>
      <p>{t("noAccount")} <a href="/register">{t("register")}</a></p>
    </form>
  );
}
