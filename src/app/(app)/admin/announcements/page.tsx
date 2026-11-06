import SettingsNav from "@/components/SettingsNav";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

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

export default async function Announcements({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  return (
    <div>
      <SettingsNav active="announcements" />
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
    </div>
  );
}
