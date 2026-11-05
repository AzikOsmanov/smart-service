import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { getPortal } from "@/lib/i18n-portal";
import { getStaff } from "@/lib/i18n-staff";

export default async function Tickets() {
  const sb = await supabaseServer();
  const { t } = await getT();
  const { L } = await getPortal();
  const { S } = await getStaff();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const [{ data: me }, { data: canBoard }, { data: tickets, error }] = await Promise.all([
    sb.from("users").select("kind,registration").eq("id", uid).maybeSingle(),
    sb.rpc("has_permission", { p_code: "tickets.board.view" }),
    sb.from("tickets").select("id,ticket_no,subject,status,priority,kind,customer_id,device_id,customer_device_status,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
  ]);
  if (me && me.kind === "customer" && me.registration !== "approved") {
    return <div className="card"><h1>{t("waitingTitle")}</h1><p>{me.registration}</p></div>;
  }
  const staff = me?.kind === "staff";
  const rows = tickets ?? [];
  const devIds = Array.from(new Set(rows.map((r) => r.device_id)));
  const custIds = Array.from(new Set(rows.map((r) => r.customer_id)));
  const tIds = rows.map((r) => r.id);
  const [{ data: devs }, { data: custs }, { data: ext }] = await Promise.all([
    devIds.length ? sb.from("devices").select("id,serial_number,device_models(name)").in("id", devIds) : Promise.resolve({ data: [] }),
    staff && custIds.length ? sb.from("users").select("id,first_name,last_name,companies(name)").in("id", custIds) : Promise.resolve({ data: [] }),
    staff && tIds.length ? sb.from("device_external_info").select("ticket_id,customer_name").in("ticket_id", tIds) : Promise.resolve({ data: [] }),
  ]);
  const dev = new Map((devs ?? []).map((d: any) => [d.id, d]));
  const cust = new Map((custs ?? []).map((c: any) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() + (c.companies?.name ? ` · ${c.companies.name}` : "")]));
  const extName = new Map((ext ?? []).filter((e: any) => e.customer_name).map((e: any) => [e.ticket_id, e.customer_name as string]));
  const devStatus = (s: string | null) => (s ? t(`st_${s}` as "st_ready") : t("st_received"));
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{t("tickets")}</h1>
        {staff && canBoard === true && <span className="row"><a className="btn" href="/tickets" style={{ textDecoration: "none" }}>{S.list}</a><a className="btn ghost" href="/tickets/board" style={{ textDecoration: "none" }}>{S.board}</a></span>}
        {me?.kind === "customer" && (
          <span className="row">
            <a className="btn" href="/tickets/password-reset" style={{ textDecoration: "none" }}>{L.prButton}</a>
            <a className="btn" href="/tickets/new" style={{ textDecoration: "none" }}>{t("newTicket")}</a>
          </span>
        )}
      </div>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr>
          <th>{t("no")}</th><th>{t("subject")}</th>{staff && <th>{t("customerCol")}</th>}
          <th>{t("deviceCol")}</th><th>{t("modelCol")}</th><th>{t("deviceStatusCol")}</th>
          {staff && <th>{t("ticketStatusCol")}</th>}{staff && <th>{t("priority")}</th>}<th>{t("created")}</th>
        </tr></thead>
          <tbody>{rows.map((x) => {
            const d: any = dev.get(x.device_id);
            return (
              <tr key={x.id}>
                <td><a href={`/tickets/${x.id}`}>{x.ticket_no}</a></td><td>{x.kind === "password_reset" && <span className="badge">{L.prBadge}</span>} {x.subject}</td>
                {staff && <td>{extName.get(x.id) ?? cust.get(x.customer_id) ?? "—"}</td>}
                <td>{d?.serial_number ?? "—"}</td><td>{d?.device_models?.name ?? "—"}</td>
                <td><span className="badge">{devStatus(x.customer_device_status)}</span></td>
                {staff && <td>{x.status}</td>}{staff && <td>{x.priority}</td>}
                <td>{new Date(x.created_at).toLocaleString()}</td>
              </tr>
            );
          })}</tbody></table>
        {!rows.length && <p>{t("noTickets")}</p>}
      </div>
    </div>
  );
}
