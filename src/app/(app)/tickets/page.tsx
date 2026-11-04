import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";

export default async function Tickets() {
  const sb = await supabaseServer();
  const { t } = await getT();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const [{ data: me }, { data: tickets, error }] = await Promise.all([
    sb.from("users").select("kind,registration").eq("id", uid).maybeSingle(),
    sb.from("tickets").select("id,ticket_no,subject,status,priority,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
  ]);
  if (me && me.kind === "customer" && me.registration !== "approved") {
    return <div className="card"><h1>{t("waitingTitle")}</h1><p>{me.registration}</p></div>;
  }
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{t("tickets")}</h1>
        {me?.kind === "customer" && <a className="btn" href="/tickets/new" style={{ textDecoration: "none" }}>{t("newTicket")}</a>}
      </div>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>{t("no")}</th><th>{t("subject")}</th><th>{t("status")}</th><th>{t("priority")}</th><th>{t("created")}</th></tr></thead>
          <tbody>{(tickets ?? []).map((x) => (
            <tr key={x.id}><td><a href={`/tickets/${x.id}`}>{x.ticket_no}</a></td><td>{x.subject}</td><td>{x.status}</td><td>{x.priority}</td><td>{new Date(x.created_at).toLocaleString()}</td></tr>
          ))}</tbody></table>
        {!tickets?.length && <p>{t("noTickets")}</p>}
      </div>
    </div>
  );
}
