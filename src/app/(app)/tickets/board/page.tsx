import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";
import Board, { type BoardCard } from "@/components/Board";

export default async function BoardPage() {
  const sb = await supabaseServer();
  const { t } = await getT();
  const { S } = await getStaff();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const [{ data: me }, { data: canView }, { data: canEdit }, { data: isAdmin }] = await Promise.all([
    sb.from("users").select("kind").eq("id", uid).maybeSingle(),
    sb.rpc("has_permission", { p_code: "tickets.board.view" }),
    sb.rpc("has_permission", { p_code: "tickets.board.edit" }),
    sb.rpc("is_tenant_admin"),
  ]);
  if (me?.kind !== "staff" || canView !== true) redirect("/tickets");

  const { data: tickets, error } = await sb.from("tickets")
    .select("id,ticket_no,subject,priority,kind,customer_id,device_id,assigned_to,customer_device_status,fee_amount,fee_currency,created_at")
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  const rows = tickets ?? [];
  const ids = rows.map((r) => r.id);
  const devIds = Array.from(new Set(rows.map((r) => r.device_id)));
  const userIds = Array.from(new Set([...rows.map((r) => r.customer_id), ...rows.map((r) => r.assigned_to).filter(Boolean) as string[]]));
  const [{ data: devs }, { data: us }, { data: ext }] = await Promise.all([
    devIds.length ? sb.from("devices").select("id,serial_number,device_models(name)").in("id", devIds) : Promise.resolve({ data: [] }),
    userIds.length ? sb.from("users").select("id,first_name,last_name,companies(name)").in("id", userIds) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("device_external_info").select("ticket_id,customer_name").in("ticket_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const dev = new Map((devs ?? []).map((d: any) => [d.id, d]));
  const person = new Map((us ?? []).map((u: any) => [u.id, u]));
  const extName = new Map((ext ?? []).filter((e: any) => e.customer_name).map((e: any) => [e.ticket_id, e.customer_name as string]));
  const nm = (u: any) => (u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : "");

  const cards: BoardCard[] = rows.map((x) => {
    const d: any = dev.get(x.device_id);
    const c: any = person.get(x.customer_id);
    return {
      id: x.id, no: x.ticket_no, subject: x.subject, kind: x.kind, priority: x.priority,
      customer: extName.get(x.id) ?? (nm(c) + (c?.companies?.name ? ` · ${c.companies.name}` : "") || "—"),
      sn: d?.serial_number ?? "—", model: d?.device_models?.name ?? "",
      assigned: !!x.assigned_to, assignee: nm(person.get(x.assigned_to as string)) || null, mine: x.assigned_to === uid,
      deviceStatus: x.customer_device_status, created: x.created_at,
      fee: x.fee_amount != null ? `${Number(x.fee_amount).toFixed(2)} ${x.fee_currency}` : null,
    };
  });
  const cols = [
    { key: "new", title: S.colNew },
    { key: "diagnose", title: t("st_diagnose") },
    { key: "ready", title: t("st_ready") },
    { key: "pickup_new_device", title: t("st_pickup_new_device") },
    { key: "repair_not_possible", title: t("st_repair_not_possible") },
  ];
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{t("tickets")}</h1>
        <span className="row"><a className="btn ghost" href="/tickets" style={{ textDecoration: "none" }}>{S.list}</a><a className="btn" href="/tickets/board" style={{ textDecoration: "none" }}>{S.board}</a></span>
      </div>
      {error && <p className="err">{error.message}</p>}
      <Board cards={cards} cols={cols} canEdit={canEdit === true} isAdmin={isAdmin === true} S={S} />
    </div>
  );
}
