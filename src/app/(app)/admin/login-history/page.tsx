import { notFound } from "next/navigation";
import { fmtDT } from "@/lib/fmt-time";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";

const EVENTS = ["login_success", "logout", "login_failed", "account_locked", "account_unlocked", "new_device_login"] as const;

export default async function LoginHistory({ searchParams }: { searchParams: Promise<{ email?: string; event?: string }> }) {
  const { email, event } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const LABEL: Record<string, string> = { login_success: S.evSignedIn, logout: S.evSignedOut, login_failed: S.evFailed, account_locked: S.evLocked, account_unlocked: S.evUnlocked, new_device_login: S.evNewDevice };
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  let q = sb.from("login_events").select("id,event,email_attempted,ip_address,user_agent,failure_reason,created_at,client,device_label").order("created_at", { ascending: false }).limit(300);
  const term = (email ?? "").trim().replace(/[%,()]/g, "");
  if (term) q = q.ilike("email_attempted", `%${term}%`);
  if (event && (EVENTS as readonly string[]).includes(event)) q = q.eq("event", event);
  const { data: rows, error } = await q;
  const short = (ua: string | null) => {
    if (!ua) return "—";
    const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
    const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    return `${b}${o ? " / " + o : ""}`;
  };
  return (
    <div>
      <p><a href="/admin/settings">← {S.settingsWord}</a> · <a href="/admin/login-security">{S.loginSecurity}</a> · <a href="/admin/online">{S.onlineUsers}</a></p>
      <h1>{S.loginHistory}</h1>
      <form method="get" className="card row">
        <input name="email" placeholder={S.emailWord} defaultValue={email ?? ""} />
        <select name="event" defaultValue={event ?? ""}><option value="">{S.allEvents}</option>{EVENTS.map((e) => <option key={e} value={e}>{LABEL[e]}</option>)}</select>
        <button>{S.filter}</button>
      </form>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>{S.timeWord}</th><th>{S.eventWord}</th><th>{S.emailWord}</th><th>{S.ipAddress}</th><th>{S.platformWord}</th><th>{S.browserWord}</th><th>{S.reasonWord}</th></tr></thead><tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td>{fmtDT(r.created_at)}</td>
              <td><span className="badge">{LABEL[r.event] ?? r.event}</span></td>
              <td>{r.email_attempted}</td>
              <td>{r.ip_address ? String(r.ip_address) : "—"}</td>
              <td>{r.client === "mobile" ? S.platformMobile : S.platformWeb}</td>
              <td>{r.device_label ?? short(r.user_agent)}</td>
              <td>{r.failure_reason === "session resumed" ? S.sessionResumed : r.failure_reason ?? ""}</td>
            </tr>
          ))}
          {(rows ?? []).length === 0 && <tr><td colSpan={7}>{S.noEventsYet}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
