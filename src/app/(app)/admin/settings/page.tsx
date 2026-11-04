import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getT } from "@/lib/i18n";

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
  await requireAdmin();
  const { t } = await getT();
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", "brand_name").maybeSingle();
  const brand = typeof data?.value === "string" ? data.value : "Acom Smart Service";
  return (
    <div>
      <h1>{t("settings")}</h1>
      <form action={saveBrand} className="card" style={{ maxWidth: 520 }}>
        <label>{t("brandName")}<input name="brand" defaultValue={brand} maxLength={60} required /></label>
        {error && <p className="err">{error}</p>}
        {ok && <p>✓</p>}
        <button>{t("save")}</button>
      </form>
    </div>
  );
}
