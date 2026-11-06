import SettingsNav from "@/components/SettingsNav";
import { notFound, redirect } from "next/navigation";
import { fmtDT } from "@/lib/fmt-time";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLoginPolicy, logLoginEvent, clientInfo, validIpEntry, ipInList } from "@/lib/login-security";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

async function requireAdmin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { sb, tenantId: me!.tenant_id as string, uid: auth.user!.id };
}

async function savePolicy(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId, uid } = await requireAdmin();
  const attempts = Math.round(Number(fd.get("attempts")));
  const minutes = Math.round(Number(fd.get("minutes")));
  if (!(attempts >= 1 && attempts <= 20) || !(minutes >= 1 && minutes <= 1440)) redirect("/admin/login-security?error=" + encodeURIComponent(S.errAttempts));
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("settings").select("value").eq("tenant_id", tenantId).eq("key", "login_security").maybeSingle();
  const value = { ...((cur?.value as object) ?? {}), max_failed_attempts: attempts, lockout_minutes: minutes };
  const { error } = await admin.from("settings").upsert({ tenant_id: tenantId, key: "login_security", value, updated_by: uid, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,key" });
  if (error) redirect("/admin/login-security?error=" + encodeURIComponent(error.message));
  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: uid, action: "settings.login_security", entity_type: "settings", entity_id: "login_security", old_values: cur?.value ?? null, new_values: value });
  revalidatePath("/admin/login-security");
  redirect("/admin/login-security?ok=" + encodeURIComponent(S.savedOk));
}

// Merges new fields into the stored policy without touching the others.
async function mergePolicy(patch: Record<string, unknown>) {
  const { tenantId, uid } = await requireAdmin();
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("settings").select("value").eq("tenant_id", tenantId).eq("key", "login_security").maybeSingle();
  const value = { ...((cur?.value as object) ?? {}), ...patch };
  const { error } = await admin.from("settings").upsert({ tenant_id: tenantId, key: "login_security", value, updated_by: uid, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,key" });
  if (error) redirect("/admin/login-security?error=" + encodeURIComponent(error.message));
  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: uid, action: "settings.login_security", entity_type: "settings", entity_id: "login_security", old_values: cur?.value ?? null, new_values: value });
  revalidatePath("/admin/login-security");
}

async function saveIp(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireAdmin();
  const list = Array.from(new Set(String(fd.get("list") ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)));
  const bad = list.find((x) => !validIpEntry(x));
  if (bad) redirect("/admin/login-security?error=" + encodeURIComponent(fmt(S.errIpBad, { bad })));
  const includeAdmins = fd.get("admins") === "on";
  const { ip } = await clientInfo();
  if (list.length && includeAdmins && !ipInList(ip, list)) redirect("/admin/login-security?error=" + encodeURIComponent(fmt(S.errIpSelf, { ip: ip ?? "?" })));
  await mergePolicy({ ip_allowlist: list, ip_scope: fd.get("scope") === "all" ? "all" : "staff", ip_include_admins: includeAdmins, ip_apply_mobile: fd.get("mobile") === "on" });
  redirect("/admin/login-security?ok=" + encodeURIComponent(S.savedOk));
}

async function saveSession(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireAdmin();
  const hours = Number(fd.get("hours"));
  if (!Number.isFinite(hours) || hours < 0 || hours > 720) redirect("/admin/login-security?error=" + encodeURIComponent(S.errSess));
  await mergePolicy({ session_hours: Math.round(hours * 10) / 10 });
  redirect("/admin/login-security?ok=" + encodeURIComponent(S.savedOk));
}

async function saveIdle(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireAdmin();
  const web = Math.round(Number(fd.get("web"))), mob = Math.round(Number(fd.get("mobile")));
  const ok = (n: number) => Number.isFinite(n) && (n === 0 || (n >= 3 && n <= 480));
  if (!ok(web) || !ok(mob)) redirect("/admin/login-security?error=" + encodeURIComponent(S.errIdle));
  await mergePolicy({ idle_minutes_web: web, idle_minutes_mobile: mob });
  redirect("/admin/login-security?ok=" + encodeURIComponent(S.savedOk));
}

async function saveAlerts(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireAdmin();
  await mergePolicy({ alert_new_device: fd.get("user") === "on", alert_admins: fd.get("admins") === "on" });
  redirect("/admin/login-security?ok=" + encodeURIComponent(S.savedOk));
}

async function saveMfa(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireAdmin();
  await mergePolicy({ require_2fa_staff: fd.get("staff") === "on" });
  redirect("/admin/login-security?ok=" + encodeURIComponent(S.savedOk));
}

async function unlock(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId, uid } = await requireAdmin();
  const id = String(fd.get("id"));
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("email").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!u) redirect("/admin/login-security?error=" + encodeURIComponent(S.errUserNotFound));
  await admin.from("users").update({ locked_until: null, failed_login_count: 0 }).eq("id", id).eq("tenant_id", tenantId);
  await logLoginEvent({ tenantId, userId: id, email: u!.email, event: "account_unlocked", reason: "by administrator" });
  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: uid, action: "user.unlock", entity_type: "user", entity_id: id, old_values: null, new_values: null });
  revalidatePath("/admin/login-security");
  redirect("/admin/login-security?ok=" + encodeURIComponent(fmt(S.okUnlocked, { email: u!.email })));
}

export default async function LoginSecurity({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { tenantId } = await requireAdmin();
  const { S } = await getStaff();
  const policy = await getLoginPolicy(tenantId);
  const { ip: myIp } = await clientInfo();
  const { data: locked } = await supabaseAdmin().from("users").select("id,first_name,last_name,email,locked_until").eq("tenant_id", tenantId).gt("locked_until", new Date().toISOString()).order("locked_until");
  return (
    <div>
      <SettingsNav active="login-security" />
      <h1>{S.loginSecurity}</h1>
      {error && <p className="err">{error}</p>}
      {ok && <p>{ok}</p>}
      <form action={savePolicy} className="card" style={{ maxWidth: 520 }}>
        <h2>{S.lockAfterFailed}</h2>
        <label>{S.failedAttempts}<input name="attempts" type="number" min={1} max={20} defaultValue={policy.max_failed_attempts} required /></label>
        <label>{S.lockMinutes}<input name="minutes" type="number" min={1} max={1440} defaultValue={policy.lockout_minutes} required /></label>
        <button>{S.save}</button>
        <p><small>{S.lockHint}</small></p>
      </form>
      <form action={saveIp} className="card" style={{ maxWidth: 520 }}>
        <h2>{S.ipTitle}</h2>
        <p><small>{S.ipHint}</small></p>
        <label>{S.ipList}<textarea name="list" rows={5} defaultValue={policy.ip_allowlist.join("\n")} /></label>
        <label>{S.ipScope}
          <select name="scope" defaultValue={policy.ip_scope}><option value="staff">{S.ipScopeStaff}</option><option value="all">{S.ipScopeAll}</option></select>
        </label>
        <label className="row"><input type="checkbox" name="admins" defaultChecked={policy.ip_include_admins} style={{ width: "auto" }} /> {S.ipAdmins}</label>
        <label className="row"><input type="checkbox" name="mobile" defaultChecked={policy.ip_apply_mobile} style={{ width: "auto" }} /> {S.ipMobile}</label>
        <p><small>{fmt(S.ipYour, { ip: myIp ?? "?" })}</small></p>
        <button>{S.save}</button>
      </form>
      <form action={saveSession} className="card" style={{ maxWidth: 520 }}>
        <h2>{S.sessTitle}</h2>
        <label>{S.sessHours}<input name="hours" type="number" min={0} max={720} step={0.5} defaultValue={policy.session_hours} required /></label>
        <p><small>{S.sessHint}</small></p>
        <button>{S.save}</button>
      </form>
      <form action={saveIdle} className="card" style={{ maxWidth: 520 }}>
        <h2>{S.idleTitle}</h2>
        <label>{S.idleWeb}<input name="web" type="number" min={0} max={480} step={1} defaultValue={policy.idle_minutes_web} required /></label>
        <label>{S.idleMobile}<input name="mobile" type="number" min={0} max={480} step={1} defaultValue={policy.idle_minutes_mobile} required /></label>
        <p><small>{S.idleHint}</small></p>
        <button>{S.save}</button>
      </form>
      <form action={saveMfa} className="card" style={{ maxWidth: 520 }}>
        <h2>{S.mfaPolicyTitle}</h2>
        <label className="row"><input type="checkbox" name="staff" defaultChecked={policy.require_2fa_staff} style={{ width: "auto" }} /> {S.mfaPolicyStaff}</label>
        <p><small>{S.mfaPolicyHint}</small></p>
        <button>{S.save}</button>
      </form>
      <form action={saveAlerts} className="card" style={{ maxWidth: 520 }}>
        <h2>{S.alertTitle}</h2>
        <label className="row"><input type="checkbox" name="user" defaultChecked={policy.alert_new_device} style={{ width: "auto" }} /> {S.alertUser}</label>
        <label className="row"><input type="checkbox" name="admins" defaultChecked={policy.alert_admins} style={{ width: "auto" }} /> {S.alertAdmins}</label>
        <button>{S.save}</button>
      </form>
      <div className="card">
        <h2>{fmt(S.lockedAccounts, { n: String((locked ?? []).length) })}</h2>
        {(locked ?? []).length === 0 && <p>{S.noLocked}</p>}
        {(locked ?? []).map((u) => (
          <form key={u.id} action={unlock} className="row">
            <input type="hidden" name="id" value={u.id} />
            <span><b>{u.first_name} {u.last_name}</b> · {u.email} · {S.untilWord2} {fmtDT(u.locked_until!)}</span>
            <button>{S.unlock}</button>
          </form>
        ))}
      </div>
    </div>
  );
}
