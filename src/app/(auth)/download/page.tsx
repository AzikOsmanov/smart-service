import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

// Public page: the Android app. The link is set by the platform owner (Companies menu).
export default async function Download() {
  const { S } = await getStaff();
  const admin = supabaseAdmin();
  const { data: def } = await admin.from("tenants").select("id").eq("slug", "default").maybeSingle();
  const { data } = def ? await admin.from("settings").select("value").eq("tenant_id", def.id).eq("key", "apk_url").maybeSingle() : { data: null };
  const url = typeof data?.value === "string" && /^https:\/\//i.test(data.value) ? data.value : null;
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Logo size={84} /></div>
      <h1>{S.dlTitle}</h1>
      {url ? <p><a className="btn" href={url} rel="noopener" style={{ textDecoration: "none", display: "inline-block" }}>{S.dlBtn}</a></p> : <p>{S.dlNone}</p>}
      <p><small>{S.dlHelp}</small></p>
      <p><a href="/login">←</a></p>
    </div>
  );
}
