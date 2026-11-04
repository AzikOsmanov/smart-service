import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getT } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function signOut() { "use server"; const sb = await supabaseServer(); await sb.auth.signOut(); redirect("/login"); }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) redirect("/login");
  const { t, lang } = await getT();
  const [{ data: me }, { data: isAdmin }, { data: brandRow }, { data: canQc }] = await Promise.all([
    sb.from("users").select("first_name,last_name,kind,registration").eq("id", sess.session.user.id).maybeSingle(),
    sb.rpc("is_tenant_admin"),
    supabaseAdmin().from("settings").select("value").eq("key", "brand_name").maybeSingle(),
    sb.rpc("has_permission", { p_code: "qc.view" }),
  ]);
  const brand = typeof brandRow?.value === "string" && brandRow.value ? brandRow.value : "Acom Smart Service";
  const staff = me?.kind === "staff";
  const nav = [{ href: "/tickets", label: t("tickets") }];
  if (!staff) nav.push({ href: "/devices", label: t("devices") });
  if (staff) nav.push({ href: "/customers", label: t("customers") });
  if (staff && canQc === true) nav.push({ href: "/qc", label: t("qc") });
  if (isAdmin === true) nav.push({ href: "/admin/users", label: t("staffUsers") }, { href: "/admin/roles", label: t("roles") }, { href: "/admin/trash", label: t("trash") }, { href: "/admin/settings", label: t("settings") });
  nav.push({ href: "/account", label: t("account") });
  const userName = me ? `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() : sess.session.user.email ?? "";
  return (
    <>
      <TopBar brand={brand} lang={lang} nav={nav} userName={userName} signOut={signOut} signOutLabel={t("signOut")}
        labels={{ system: t("system"), light: t("light"), dark: t("dark"), theme: t("theme"), language: t("language") }} />
      <main className="page">{children}</main>
    </>
  );
}
