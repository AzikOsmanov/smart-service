import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLoginPolicy, logLoginEvent } from "@/lib/login-security";

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
  const { tenantId, uid } = await requireAdmin();
  const attempts = Math.round(Number(fd.get("attempts")));
  const minutes = Math.round(Number(fd.get("minutes")));
  if (!(attempts >= 1 && attempts <= 20) || !(minutes >= 1 && minutes <= 1440)) redirect("/admin/login-security?error=" + encodeURIComponent("Attempts must be 1–20 and minutes 1–1440."));
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("settings").select("value").eq("tenant_id", tenantId).eq("key", "login_security").maybeSingle();
  const value = { ...((cur?.value as object) ?? {}), max_failed_attempts: attempts, lockout_minutes: minutes };
  const { error } = await admin.from("settings").upsert({ tenant_id: tenantId, key: "login_security", value, updated_by: uid, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,key" });
  if (error) redirect("/admin/login-security?error=" + encodeURIComponent(error.message));
  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: uid, action: "settings.login_security", entity_type: "settings", entity_id: "login_security", old_values: cur?.value ?? null, new_values: value });
  revalidatePath("/admin/login-security");
  redirect("/admin/login-security?ok=" + encodeURIComponent("Saved."));
}

async function unlock(fd: FormData) {
  "use server";
  const { tenantId, uid } = await requireAdmin();
  const id = String(fd.get("id"));
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("email").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!u) redirect("/admin/login-security?error=" + encodeURIComponent("User not found."));
  await admin.from("users").update({ locked_until: null, failed_login_count: 0 }).eq("id", id).eq("tenant_id", tenantId);
  await logLoginEvent({ tenantId, userId: id, email: u!.email, event: "account_unlocked", reason: "by administrator" });
  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: uid, action: "user.unlock", entity_type: "user", entity_id: id, old_values: null, new_values: null });
  revalidatePath("/admin/login-security");
  redirect("/admin/login-security?ok=" + encodeURIComponent(`${u!.email} unlocked.`));
}

export default async function LoginSecurity({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { tenantId } = await requireAdmin();
  const policy = await getLoginPolicy(tenantId);
  const { data: locked } = await supabaseAdmin().from("users").select("id,first_name,last_name,email,locked_until").eq("tenant_id", tenantId).gt("locked_until", new Date().toISOString()).order("locked_until");
  return (
    <div>
      <p><a href="/admin/settings">← Settings</a> · <a href="/admin/login-history">Login history</a></p>
      <h1>Login security</h1>
      {error && <p className="err">{error}</p>}
      {ok && <p>{ok}</p>}
      <form action={savePolicy} className="card" style={{ maxWidth: 520 }}>
        <h2>Lock after failed sign-ins</h2>
        <label>Failed attempts before the account is locked<input name="attempts" type="number" min={1} max={20} defaultValue={policy.max_failed_attempts} required /></label>
        <label>Lock time (minutes)<input name="minutes" type="number" min={1} max={1440} defaultValue={policy.lockout_minutes} required /></label>
        <button>Save</button>
        <p><small>The administrator can unlock an account at any time below. Every sign-in, failure and lock is recorded in Login history.</small></p>
      </form>
      <div className="card">
        <h2>Locked accounts ({(locked ?? []).length})</h2>
        {(locked ?? []).length === 0 && <p>No accounts are locked.</p>}
        {(locked ?? []).map((u) => (
          <form key={u.id} action={unlock} className="row">
            <input type="hidden" name="id" value={u.id} />
            <span><b>{u.first_name} {u.last_name}</b> · {u.email} · until {new Date(u.locked_until!).toLocaleString()}</span>
            <button>Unlock</button>
          </form>
        ))}
      </div>
    </div>
  );
}
