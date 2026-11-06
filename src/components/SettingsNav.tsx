import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";

// The same bar at the top of every settings page, so the buttons never move while the administrator works.
export default async function SettingsNav({ active }: { active: "settings" | "login-security" | "integrations" | "announcements" | "login-history" | "online" }) {
  const { t } = await getT();
  const { S } = await getStaff();
  const items: { key: typeof active; href: string; label: string }[] = [
    { key: "login-security", href: "/admin/login-security", label: S.loginSecurity },
    { key: "integrations", href: "/admin/integrations", label: S.integrationsTitle },
    { key: "announcements", href: "/admin/announcements", label: S.annTitle },
    { key: "login-history", href: "/admin/login-history", label: S.loginHistory },
    { key: "online", href: "/admin/online", label: S.onlineUsers },
  ];
  return (
    <>
      <h1><a href="/admin/settings" style={{ color: "inherit", textDecoration: "none" }}>{t("settings")}</a></h1>
      <div className="card row">
        {items.map((i) => (
          <a key={i.key} className={`btn ${active === i.key ? "" : "ghost"}`} href={i.href} aria-current={active === i.key ? "page" : undefined} style={{ textDecoration: "none" }}>{i.label}</a>
        ))}
      </div>
    </>
  );
}
