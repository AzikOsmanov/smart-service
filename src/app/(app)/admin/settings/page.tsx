import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";
import SettingsNav from "@/components/SettingsNav";

async function requireAdmin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { data: sess } = await sb.auth.getSession();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", sess.session!.user.id).single();
  return { tenantId: me!.tenant_id as string, uid: sess.session!.user.id };
}

async function saveBrand(fd: FormData) {
  "use server";
  const { tenantId, uid } = await requireAdmin();
  const name = String(fd.get("brand")).trim().slice(0, 60) || "Acom Smart Service";
  const { error } = await supabaseAdmin().from("settings").upsert({ tenant_id: tenantId, key: "brand_name", value: name, updated_by: uid, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,key" });
  if (error) redirect("/admin/settings?error=" + encodeURIComponent(error.message));
  revalidatePath("/", "layout");
  redirect("/admin/settings?ok=1");
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { tenantId } = await requireAdmin();
  const { t } = await getT();
  const { S } = await getStaff();
  const admin = supabaseAdmin();
  const { data } = await admin.from("settings").select("value").eq("tenant_id", tenantId).eq("key", "brand_name").maybeSingle();
  const brand = typeof data?.value === "string" ? data.value : "Acom Smart Service";
  const { data: tn } = await admin.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  const h = await headers();
  const regLink = `https://${h.get("x-forwarded-host") ?? h.get("host")}/register${tn?.slug && tn.slug !== "default" ? `?t=${tn.slug}` : ""}`;
  return (
    <div>
      <SettingsNav active="settings" />
      <form action={saveBrand} className="card" style={{ maxWidth: 520 }}>
        <label>{t("brandName")}<input name="brand" defaultValue={brand} maxLength={60} required /></label>
        {error && <p className="err">{error}</p>}
        {ok && <p>✓</p>}
        <button>{t("save")}</button>
      </form>
      <div className="card" style={{ maxWidth: 520, marginTop: 16 }}>
        <label>{S.tnRegLink}</label>
        <p style={{ wordBreak: "break-all", margin: "6px 0 0" }}><a href={regLink}>{regLink}</a></p>
      </div>
    </div>
  );
}
