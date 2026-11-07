import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getT } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Heartbeat from "@/components/Heartbeat";
import IdleLogout from "@/components/IdleLogout";
import { getStaff } from "@/lib/i18n-staff";
import { cookies } from "next/headers";
import { logLoginEvent, parseLoginPolicy, clientInfo, ipAllowed } from "@/lib/login-security";
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
  const [{ data: shell }, { data: nItems }, { count: nUnread }] = await Promise.all([
    sb.rpc("app_shell"),
    sb.from("notifications").select("id,kind,ticket_id,data,created_at,read_at").order("created_at", { ascending: false }).limit(20),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const sh = (shell ?? {}) as { mfa_enrolled?: boolean; first_name?: string; last_name?: string; kind?: string; registration?: string; tenant_id?: string; is_admin?: boolean; perms?: Record<string, boolean>; brand?: unknown; login_security?: unknown };
  const me = shell ? { first_name: sh.first_name, last_name: sh.last_name, kind: sh.kind, registration: sh.registration } : null;
  const isAdmin = sh.is_admin === true;
  const pm = sh.perms ?? {};
  const canQc = pm["qc.view"], canClaims = pm["devices.claims.view"], canDevices = pm["devices.view"], canTut = pm["tutorials.view"], canMat = pm["materials.view"], canDash = pm["dashboard.view"], canProj = pm["projects.view"], canCat = pm["catalog.view"], canGuide = pm["guide.view"], canAnn = pm["announcements.edit"];
  const brandRow = { value: sh.brand };
  let idleMinutes = 0;
  // Network allow-list also applies to sessions that are already open (e.g. an employee who leaves the office network).
  if (me?.kind && sh.tenant_id) {
    const policy = parseLoginPolicy(sh.login_security);
    idleMinutes = policy.idle_minutes_web;
    if (isAdmin && policy.require_2fa_staff && !sh.mfa_enrolled) redirect("/mfa/setup?required=1");
    if (policy.ip_allowlist.length) {
      const { ip } = await clientInfo();
      const admin = isAdmin && !policy.ip_include_admins;
      if (!ipAllowed(policy, { ip, staff: me.kind === "staff", admin, client: "web" })) redirect("/auth/blocked");
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
  if (isAdmin) nav.push({ href: "/admin/users", label: t("staffUsers") }, { href: "/admin/roles", label: t("roles") }, { href: "/admin/trash", label: t("trash") }, { href: "/admin/settings", label: t("settings") });
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
