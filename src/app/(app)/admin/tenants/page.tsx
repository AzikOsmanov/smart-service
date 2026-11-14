import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { fmtDT } from "@/lib/fmt-time";
import { fmt } from "@/lib/fmt";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";
import PopupButton from "@/components/PopupButton";
import PasswordInput from "@/components/PasswordInput";

// Platform owner only: companies (tenants) of this system.
async function requireOwner() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_platform_owner");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { tenantId: me!.tenant_id as string };
}

async function dropEmptyTenant(admin: ReturnType<typeof supabaseAdmin>, id: string) {
  const { data: roles } = await admin.from("roles").select("id").eq("tenant_id", id);
  const ids = (roles ?? []).map((r) => r.id);
  if (ids.length) await admin.from("role_permissions").delete().in("role_id", ids);
  await admin.from("roles").delete().eq("tenant_id", id);
  await admin.from("settings").delete().eq("tenant_id", id);
  await admin.from("tenants").delete().eq("id", id);
}

async function createTenant(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireOwner();
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const first = String(fd.get("first_name") ?? "").trim(), last = String(fd.get("last_name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const back = (k: "error" | "ok", m: string) => redirect(`/admin/tenants?${k}=` + encodeURIComponent(m));
  if (!name || !email || !first || !last || password.length < 8) back("error", S.tnErrFields);
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) back("error", S.tnErrSlug);
  const admin = supabaseAdmin();
  if ((await admin.from("tenants").select("id").eq("slug", slug).maybeSingle()).data) back("error", S.tnErrSlugTaken);
  const made = await admin.rpc("create_tenant", { p_name: name, p_slug: slug, p_lang: "en" });
  if (made.error || !made.data) back("error", made.error?.message ?? S.tnErrFields);
  const tenantId = made.data as string;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    await dropEmptyTenant(admin, tenantId);
    back("error", created.error?.message ?? S.tnErrFields);
  }
  const uid = created.data!.user!.id;
  const { data: role } = await admin.from("roles").select("id").eq("tenant_id", tenantId).eq("is_admin", true).maybeSingle();
  let failure: string | null = null;
  if (!role) failure = "no administrator role";
  else {
    const ins = await admin.from("users").insert({ id: uid, tenant_id: tenantId, kind: "staff", email, first_name: first, last_name: last, registration: "approved", is_active: true, email_verified_at: new Date().toISOString() });
    if (ins.error) failure = ins.error.message;
    else { const r = await admin.from("user_roles").insert({ user_id: uid, role_id: role.id }); if (r.error) failure = r.error.message; }
  }
  if (failure) {
    await admin.from("users").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    await dropEmptyTenant(admin, tenantId);
    back("error", failure);
  }
  const h = await headers();
  const link = `https://${h.get("x-forwarded-host") ?? h.get("host")}/register?t=${slug}`;
  revalidatePath("/admin/tenants");
  back("ok", fmt(S.tnCreated, { name, email, link }));
}

async function setStatus(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId } = await requireOwner();
  const id = String(fd.get("id"));
  if (id === tenantId) redirect("/admin/tenants?error=" + encodeURIComponent(S.tnSuspendSelf));
  await supabaseAdmin().from("tenants").update({ status: fd.get("status") === "suspended" ? "suspended" : "active" }).eq("id", id);
  revalidatePath("/admin/tenants");
}

async function saveApk(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId } = await requireOwner();
  const url = String(fd.get("url") ?? "").trim();
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) redirect("/admin/tenants?error=" + encodeURIComponent(S.apkErr));
  const admin = supabaseAdmin();
  const { data: def } = await admin.from("tenants").select("id").eq("slug", "default").maybeSingle();
  const tid = def?.id ?? tenantId;
  if (url) await admin.from("settings").upsert({ tenant_id: tid, key: "apk_url", value: url }, { onConflict: "tenant_id,key" });
  else await admin.from("settings").delete().eq("tenant_id", tid).eq("key", "apk_url");
  revalidatePath("/download");
  redirect("/admin/tenants?ok=" + encodeURIComponent(S.apkSaved));
}

export default async function Tenants({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { tenantId } = await requireOwner();
  const { t } = await getT();
  const { S } = await getStaff();
  const admin = supabaseAdmin();
  const { data: rows } = await admin.from("tenants").select("id,name,slug,status,is_demo,created_at").is("deleted_at", null).order("created_at");
  const counts = new Map<string, number>();
  await Promise.all((rows ?? []).map(async (r) => {
    const { count } = await admin.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", r.id).is("deleted_at", null);
    counts.set(r.id, count ?? 0);
  }));
  const { data: def } = await admin.from("tenants").select("id").eq("slug", "default").maybeSingle();
  const { data: apk } = def ? await admin.from("settings").select("value").eq("tenant_id", def.id).eq("key", "apk_url").maybeSingle() : { data: null };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{t("tenants")}</h1>
        <span><PopupButton label={S.tnCreate} title={S.tnCreate}>
          <form action={createTenant}>
            <label>{S.tnName}<input name="name" required /></label>
            <label>{S.tnSlug}<input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,30}" /></label>
            <label>{S.tnFirst}<input name="first_name" required /></label>
            <label>{S.tnLast}<input name="last_name" required /></label>
            <label>{S.tnAdminEmail}<input name="email" type="email" required /></label>
            <label>{S.tnPassword}<PasswordInput name="password" autoComplete="new-password" minLength={8} required /></label>
            <button>{S.tnCreate}</button>
          </form>
        </PopupButton></span>
      </div>
      <p>{S.tnIntro}</p>
      {error && <p className="err">{error}</p>}
      {ok && <p style={{ wordBreak: "break-all" }}>{ok}</p>}
      <div className="card">
        <table><thead><tr><th>{S.tnName}</th><th>{S.tnSlug.split(" (")[0]}</th><th>{S.tnUsers}</th><th>{S.tnStatus}</th><th>{S.tnRegLink}</th><th>{t("created")}</th><th></th></tr></thead>
          <tbody>{(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td>{r.name}{r.is_demo ? ` · ${S.tnDemoTag}` : ""}</td><td>{r.slug}</td><td>{counts.get(r.id) ?? 0}</td>
              <td>{r.status === "active" ? S.tnActive : S.tnSuspended}</td>
              <td>{r.is_demo ? "—" : <small>{`https://${host}/register${r.slug === "default" ? "" : `?t=${r.slug}`}`}</small>}</td>
              <td>{fmtDT(r.created_at)}</td>
              <td>{r.id !== tenantId && <form action={setStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "active" ? "suspended" : "active"} /><button>{r.status === "active" ? S.tnSuspend : S.tnActivate}</button></form>}</td>
            </tr>))}</tbody></table>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>{S.apkTitle}</h2>
        <p>{S.apkHelp}</p>
        <form action={saveApk} className="row">
          <input name="url" type="url" defaultValue={typeof apk?.value === "string" ? apk.value : ""} placeholder="https://" style={{ flex: 1, minWidth: 240 }} />
          <button>{S.apkSave}</button>
        </form>
      </div>
    </div>
  );
}
