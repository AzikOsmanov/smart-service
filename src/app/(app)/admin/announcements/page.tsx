import SettingsNav from "@/components/SettingsNav";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";
import { fmtDT } from "@/lib/fmt-time";

export const dynamic = "force-dynamic";

async function send(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("send_announcement", {
    p_title: String(fd.get("title") ?? ""), p_body: String(fd.get("body") ?? ""),
    p_link: String(fd.get("link") ?? ""), p_audience: String(fd.get("audience") ?? "all"),
  });
  if (error) redirect(`/admin/announcements?error=${encodeURIComponent(error.message)}`);
  redirect(`/admin/announcements?sent=${data ?? 0}`);
}

async function remove(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("delete_announcement", { p_created_at: String(fd.get("at") ?? ""), p_title: String(fd.get("title") ?? "") });
  if (error) redirect(`/admin/announcements?error=${encodeURIComponent(error.message)}`);
  redirect("/admin/announcements?deleted=1");
}

export default async function Announcements({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  const { data: sent_list } = await sb.rpc("list_announcements");
  const canDelete = isAdmin === true || (await sb.rpc("has_permission", { p_code: "announcements.delete" })).data === true;
  // the administrator, or a staff role that has the Announcements edit permission (e.g. SMM)
  if (isAdmin !== true && (await sb.rpc("has_permission", { p_code: "announcements.edit" })).data !== true) notFound();
  return (
    <div>
      {isAdmin === true && <SettingsNav active="announcements" />}
      <h1>{S.annTitle}</h1>
      <p>{S.annIntro}</p>
      <form action={send} className="card" style={{ maxWidth: 680 }}>
        <label>{S.annHeading}<input name="title" required maxLength={120} /></label>
        <label>{S.annText}<textarea name="body" rows={4} maxLength={500} /></label>
        <label>{S.annLink}<input name="link" placeholder="https://" /></label>
        <label>{S.annAudience}<select name="audience" defaultValue="all">
          <option value="all">{S.annAll}</option><option value="customers">{S.annCustomers}</option><option value="staff">{S.annStaff}</option>
        </select></label>
        {error && <p className="err">{error}</p>}
        {sent && <p>{fmt(S.annSent, { n: sent })}</p>}
        <button>{S.annSend}</button>
      </form>
      <div className="card">
        <h2>{S.annHistory}</h2>
        {((sent_list ?? []) as { created_at: string; title: string; body: string | null; recipients: number }[]).length === 0 ? <p>{S.annHistoryNone}</p> : (
          <table><thead><tr><th>{S.date}</th><th>{S.annHeading}</th><th>{S.annRecipients}</th><th></th></tr></thead><tbody>
            {((sent_list ?? []) as { created_at: string; title: string; body: string | null; recipients: number }[]).map((a) => (
              <tr key={a.created_at + a.title}>
                <td>{fmtDT(a.created_at)}</td><td><b>{a.title}</b>{a.body && <><br /><small>{a.body}</small></>}</td><td>{a.recipients}</td>
                <td>{canDelete && <form action={remove}><input type="hidden" name="at" value={a.created_at} /><input type="hidden" name="title" value={a.title} /><button className="btn ghost">{S.delete}</button></form>}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
