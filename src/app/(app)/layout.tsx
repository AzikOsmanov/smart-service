import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getT } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Heartbeat from "@/components/Heartbeat";
import { logLoginEvent } from "@/lib/login-security";

async function signOut() {
  "use server";
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (data.user) {
    const admin = supabaseAdmin();
    const { data: u } = await admin.from("users").select("tenant_id,email").eq("id", data.user.id).maybeSingle();
    if (u) {
      await admin.from("users").update({ last_seen_at: null }).eq("id", data.user.id);
      await logLoginEvent({ tenantId: u.tenant_id, userId: data.user.id, email: u.email, event: "logout" });
    }
  }
  await sb.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) redirect("/login");
  const { t, lang } = await getT();
  const [{ data: me }, { data: isAdmin }, { data: brandRow }, { data: canQc }, { data: canClaims }, { data: canDevices }] = await Promise.all([
    sb.from("users").select("first_name,last_name,kind,registration").eq("id", sess.session.user.id).maybeSingle(),
    sb.rpc("is_tenant_admin"),
    supabaseAdmin().from("settings").select("value").eq("key", "brand_name").maybeSingle(),
    sb.rpc("has_permission", { p_code: "qc.view" }),
    sb.rpc("has_permission", { p_code: "devices.claims.view" }),
    sb.rpc("has_permission", { p_code: "devices.view" }),
  ]);
  const brand = typeof brandRow?.value === "string" && brandRow.value ? brandRow.value : "Acom Smart Service";
  const staff = me?.kind === "staff";
  const nav = [{ href: "/tickets", label: t("tickets") }];
  if (!staff) nav.push({ href: "/devices", label: t("devices") });
  if (staff && canDevices === true) nav.push({ href: "/devices", label: t("devices") });
  if (staff) nav.push({ href: "/customers", label: t("customers") });
  if (staff && canClaims === true) nav.push({ href: "/claims", label: t("claims") });
  if (staff && canQc === true) nav.push({ href: "/qc", label: t("qc") });
  if (isAdmin === true) nav.push({ href: "/admin/users", label: t("staffUsers") }, { href: "/admin/roles", label: t("roles") }, { href: "/admin/trash", label: t("trash") }, { href: "/admin/settings", label: t("settings") });
  nav.push({ href: "/account", label: t("account") });
  const userName = me ? `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() : sess.session.user.email ?? "";
  return (
    <>
      <TopBar brand={brand} lang={lang} nav={nav} userName={userName} signOut={signOut} signOutLabel={t("signOut")}
        labels={{ system: t("system"), light: t("light"), dark: t("dark"), theme: t("theme"), language: t("language") }} />
      <Heartbeat />
      <main className="page">{children}</main>
    </>
  );
}
