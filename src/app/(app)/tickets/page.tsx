import { supabaseServer } from "@/lib/supabase-server";
import { fmtDT } from "@/lib/fmt-time";
import { getT } from "@/lib/i18n";
import { getPortal } from "@/lib/i18n-portal";
import { getStaff } from "@/lib/i18n-staff";
import { warrantyText } from "@/lib/warranty";
import { fmt } from "@/lib/fmt";

const DEV_STATUSES = ["received", "diagnose", "ready", "pickup_new_device", "repair_not_possible"] as const;

export default async function Tickets({ searchParams }: { searchParams: Promise<{ q?: string; st?: string; who?: string }> }) {
  const { q, st, who } = await searchParams;
  const sb = await supabaseServer();
  const { t } = await getT();
  const { L } = await getPortal();
  const { S } = await getStaff();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const term = (q ?? "").trim().replace(/[%,()*]/g, "").slice(0, 80);
  // Text search: find matching devices / customers first, then match tickets by number, subject, device or customer.
  let orParts: string[] = [];
  if (term) {
    const like = `%${term}%`;
    const [{ data: dm }, { data: em }, { data: um }, { data: cm }] = await Promise.all([
      sb.from("devices").select("id").ilike("serial_number", like).limit(200),
      sb.from("device_external_info").select("device_id").or(`model_name.ilike.${like},customer_name.ilike.${like}`).limit(200),
      sb.from("users").select("id").or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(200),
      sb.from("companies").select("id").ilike("name", like).limit(100),
    ]);
    const { data: cu } = (cm ?? []).length ? await sb.from("users").select("id").in("company_id", (cm ?? []).map((c) => c.id)).limit(300) : { data: [] };
    const devIdsHit = Array.from(new Set([...(dm ?? []).map((d) => d.id), ...(em ?? []).map((e: any) => e.device_id).filter(Boolean)]));
    const custIdsHit = Array.from(new Set([...(um ?? []).map((u) => u.id), ...(cu ?? []).map((u) => u.id)]));
    orParts = [`subject.ilike.${like}`];
    if (/^\d{1,9}$/.test(term)) orParts.push(`ticket_no.eq.${term}`);
    if (devIdsHit.length) orParts.push(`device_id.in.(${devIdsHit.join(",")})`);
    if (custIdsHit.length) orParts.push(`customer_id.in.(${custIdsHit.join(",")})`);
  }
  let tq = sb.from("tickets").select("id,ticket_no,subject,status,priority,kind,customer_id,device_id,customer_device_status,assigned_to,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (orParts.length) tq = tq.or(orParts.join(","));
  if (st === "received") tq = tq.is("customer_device_status", null);
  else if (st && (DEV_STATUSES as readonly string[]).includes(st)) tq = tq.eq("customer_device_status", st);
  const [{ data: me }, { data: canBoard }, { data: tickets, error }] = await Promise.all([
    sb.from("users").select("kind,registration").eq("id", uid).maybeSingle(),
    sb.rpc("has_permission", { p_code: "tickets.board.view" }),
    who === "mine" ? tq.eq("assigned_to", uid) : who === "new" ? tq.is("assigned_to", null) : tq,
  ]);
  if (me && me.kind === "customer" && me.registration !== "approved") {
    return <div className="card"><h1>{t("waitingTitle")}</h1><p>{me.registration}</p></div>;
  }
  const staff = me?.kind === "staff";
  const rows = tickets ?? [];
  const devIds = Array.from(new Set(rows.map((r) => r.device_id)));
  const custIds = Array.from(new Set(rows.map((r) => r.customer_id)));
  const tIds = rows.map((r) => r.id);
  const [{ data: devs }, { data: custs }, { data: ext }, { data: extDev }, { data: custInfo }] = await Promise.all([
    devIds.length ? sb.from("devices").select("id,serial_number,device_models(name)").in("id", devIds) : Promise.resolve({ data: [] }),
    staff && custIds.length ? sb.from("users").select("id,first_name,last_name,companies(name)").in("id", custIds) : Promise.resolve({ data: [] }),
    staff && tIds.length ? sb.from("device_external_info").select("ticket_id,customer_name").in("ticket_id", tIds) : Promise.resolve({ data: [] }),
    staff && devIds.length ? sb.from("device_external_info").select("device_id,model_name,warranty_until,warranty_note").in("device_id", devIds) : Promise.resolve({ data: [] }),
    !staff && tIds.length ? sb.rpc("customer_device_info", { p_ticket_ids: tIds }) : Promise.resolve({ data: [] }),
  ]);
  type DI = { model_name: string | null; warranty_until: string | null; warranty_note: string | null };
  const infoByDevice = new Map<string, DI>((extDev ?? []).map((e: any) => [e.device_id, e as DI]));
  const infoByTicket = new Map<string, DI>((custInfo ?? []).map((e: any) => [e.ticket_id, e as DI]));
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
        <form className="row" method="get" style={{ marginBottom: 12 }}>
          <input name="q" defaultValue={q ?? ""} placeholder={S.searchBoard} style={{ minWidth: 260 }} />
          <select name="st" defaultValue={st ?? ""}>
            <option value="">{S.allStatuses}</option>
            {DEV_STATUSES.map((x) => <option key={x} value={x}>{t(`st_${x}` as "st_ready")}</option>)}
          </select>
          {staff && (
            <select name="who" defaultValue={who ?? ""}>
              <option value="">{S.anyAssignee}</option>
              <option value="mine">{S.myTickets}</option>
              <option value="new">{S.colNew}</option>
            </select>
          )}
          <button>{S.filter}</button>
          {(q || st || who) && <a className="btn ghost" href="/tickets" style={{ textDecoration: "none" }}>{S.clearFilters}</a>}
          <small>{fmt(S.resultsCount, { n: String(rows.length) })}</small>
        </form>
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr>
          <th>{t("no")}</th><th>{t("subject")}</th>{staff && <th>{t("customerCol")}</th>}
          <th>{t("deviceCol")}</th><th>{t("modelCol")}</th><th>{L.warrantyWord}</th><th>{t("deviceStatusCol")}</th>
          {staff && <th>{t("ticketStatusCol")}</th>}{staff && <th>{t("priority")}</th>}<th>{t("created")}</th>
        </tr></thead>
          <tbody>{rows.map((x) => {
            const d: any = dev.get(x.device_id);
            const info = staff ? infoByDevice.get(x.device_id) : infoByTicket.get(x.id);
            return (
              <tr key={x.id}>
                <td><a href={`/tickets/${x.id}`}>{x.ticket_no}</a></td><td>{x.kind === "password_reset" && <span className="badge">{L.prBadge}</span>} {x.subject}</td>
                {staff && <td>{extName.get(x.id) ?? cust.get(x.customer_id) ?? "—"}</td>}
                <td>{d?.serial_number ?? "—"}</td><td>{info?.model_name || d?.device_models?.name || "—"}</td><td>{warrantyText(L, info?.warranty_until, info?.warranty_note)}</td>
                <td><span className="badge">{devStatus(x.customer_device_status)}</span></td>
                {staff && <td>{x.status}</td>}{staff && <td>{x.priority}</td>}
                <td>{fmtDT(x.created_at)}</td>
              </tr>
            );
          })}</tbody></table>
        {!rows.length && <p>{t("noTickets")}</p>}
      </div>
    </div>
  );
}
