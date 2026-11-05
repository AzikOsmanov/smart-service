import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

const EVENTS = ["login_success", "logout", "login_failed", "account_locked", "account_unlocked"] as const;
const LABEL: Record<string, string> = { login_success: "Signed in", logout: "Signed out", login_failed: "Failed", account_locked: "Account locked", account_unlocked: "Unlocked" };

export default async function LoginHistory({ searchParams }: { searchParams: Promise<{ email?: string; event?: string }> }) {
  const { email, event } = await searchParams;
  const sb = await supabaseServer();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  let q = sb.from("login_events").select("id,event,email_attempted,ip_address,user_agent,failure_reason,created_at").order("created_at", { ascending: false }).limit(300);
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
      <p><a href="/admin/settings">← Settings</a> · <a href="/admin/login-security">Login security</a> · <a href="/admin/online">Online users</a></p>
      <h1>Login history</h1>
      <form method="get" className="card row">
        <input name="email" placeholder="Email" defaultValue={email ?? ""} />
        <select name="event" defaultValue={event ?? ""}><option value="">All events</option>{EVENTS.map((e) => <option key={e} value={e}>{LABEL[e]}</option>)}</select>
        <button>Filter</button>
      </form>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>Time</th><th>Event</th><th>Email</th><th>IP address</th><th>Browser</th><th>Reason</th></tr></thead><tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td><span className="badge">{LABEL[r.event] ?? r.event}</span></td>
              <td>{r.email_attempted}</td>
              <td>{r.ip_address ? String(r.ip_address) : "—"}</td>
              <td>{short(r.user_agent)}</td>
              <td>{r.failure_reason ?? ""}</td>
            </tr>
          ))}
          {(rows ?? []).length === 0 && <tr><td colSpan={6}>No events yet. They appear after the next sign-in.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
