import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getT } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Heartbeat from "@/components/Heartbeat";
import IdleLogout from "@/components/IdleLogout";
import { getStaff } from "@/lib/i18n-staff";
import { cookies } from "next/headers";
import { logLoginEvent, getLoginPolicy, clientInfo, ipAllowed } from "@/lib/login-security";
import NotificationBell from "@/components/NotificationBell";
import type { Notif } from "@/lib/notif-text";

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
  const jar = await cookies();
  jar.delete("ss_act"); jar.delete("ss_idle");
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) redirect("/login");
  const { t, lang } = await getT();
  const { S } = await getStaff();
  const [{ data: me }, { data: isAdmin }, { data: brandRow }, { data: canQc }, { data: canClaims }, { data: canDevices }, { data: canTut }, { data: canMat }, { data: canDash }, { data: canProj }, { data: canCat }, { data: canGuide }, { data: canAnn }] = await Promise.all([
    sb.from("users").select("first_name,last_name,kind,registration").eq("id", sess.session.user.id).maybeSingle(),
    sb.rpc("is_tenant_admin"),
    supabaseAdmin().from("settings").select("value").eq("key", "brand_name").maybeSingle(),
    sb.rpc("has_permission", { p_code: "qc.view" }),
    sb.rpc("has_permission", { p_code: "devices.claims.view" }),
    sb.rpc("has_permission", { p_code: "devices.view" }),
    sb.rpc("has_permission", { p_code: "tutorials.view" }),
    sb.rpc("has_permission", { p_code: "materials.view" }),
    sb.rpc("has_permission", { p_code: "dashboard.view" }),
    sb.rpc("has_permission", { p_code: "projects.view" }),
    sb.rpc("has_permission", { p_code: "catalog.view" }),
    sb.rpc("has_permission", { p_code: "guide.view" }),
    sb.rpc("has_permission", { p_code: "announcements.edit" }),
  ]);
  const [{ data: nItems }, { count: nUnread }] = await Promise.all([
    sb.from("notifications").select("id,kind,ticket_id,data,created_at,read_at").order("created_at", { ascending: false }).limit(20),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  let idleMinutes = 0;
  // Network allow-list also applies to sessions that are already open (e.g. an employee who leaves the office network).
  if (me?.kind) {
    const { data: tn } = await sb.from("users").select("tenant_id").eq("id", sess.session.user.id).maybeSingle();
    if (tn?.tenant_id) {
      const policy = await getLoginPolicy(tn.tenant_id);
      idleMinutes = policy.idle_minutes_web;
      if (policy.ip_allowlist.length) {
        const { ip } = await clientInfo();
        const admin = isAdmin === true && !policy.ip_include_admins;
        if (!ipAllowed(policy, { ip, staff: me.kind === "staff", admin, client: "web" })) redirect("/auth/blocked");
      }
    }
  }
  const brand = typeof brandRow?.value === "string" && brandRow.value ? brandRow.value : "Acom Smart Service";
  const staff = me?.kind === "staff";
  const nav = [{ href: "/tickets", label: t("tickets") }];
  if (staff && canDash === true) nav.unshift({ href: "/dashboard", label: t("dashboard") });
  if (!staff) nav.push({ href: "/devices", label: t("devices") });
  if (staff && canDevices === true) nav.push({ href: "/devices", label: t("devices") });
  if (staff) nav.push({ href: "/customers", label: t("customers") });
  if (staff && canClaims === true) nav.push({ href: "/claims", label: t("claims") });
  if (staff && canQc === true) nav.push({ href: "/qc", label: t("qc") });
  if (!staff || canTut === true) nav.push({ href: "/tutorials", label: t("tutorials") });
  if ((staff && canMat === true) || (!staff && me?.registration === "approved")) nav.push({ href: "/materials", label: t("materials") });
  if (isAdmin === true) nav.push({ href: "/admin/users", label: t("staffUsers") }, { href: "/admin/roles", label: t("roles") }, { href: "/admin/trash", label: t("trash") }, { href: "/admin/settings", label: t("settings") });
  if ((staff && canProj === true) || (!staff && me?.registration === "approved")) nav.push({ href: "/projects", label: t("projects") });
  if (staff && canCat === true) nav.push({ href: "/catalog", label: t("catalog") });
  if ((staff && canGuide === true) || (!staff && me?.registration === "approved")) nav.push({ href: "/guide", label: t("guide") });
  if (staff && canAnn === true && isAdmin !== true) nav.push({ href: "/admin/announcements", label: t("announcements") });
  nav.push({ href: "/calculator", label: t("calculator") });
  nav.push({ href: "/account", label: t("account") });
  const userName = me ? `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() : sess.session.user.email ?? "";
  return (
    <>
      <TopBar bell={<NotificationBell userId={sess.session.user.id} lang={lang} initial={(nItems ?? []) as Notif[]} initialUnread={nUnread ?? 0} />} brand={brand} lang={lang} nav={nav} userName={userName} signOut={signOut} signOutLabel={t("signOut")}
        labels={{ system: t("system"), light: t("light"), dark: t("dark"), theme: t("theme"), language: t("language") }} />
      <Heartbeat />
      {idleMinutes > 0 && <IdleLogout minutes={idleMinutes} labels={{ title: S.idleWarnTitle, body: S.idleWarnBody, stay: S.idleStay }} />}
      <main className="page">{children}</main>
    </>
  );
}
