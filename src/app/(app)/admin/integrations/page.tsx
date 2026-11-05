import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { saveIntegrationAction, testIntegrationAction, retryOutboxAction, runQueueAction } from "@/lib/integration-actions";
import type { FieldMap } from "@/lib/onec";

export const dynamic = "force-dynamic";

export default async function Integrations({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; k?: string }> }) {
  const { ok, error, k } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  const { data: rows } = await sb.from("integrations").select("id,kind,base_url,field_map,is_enabled,last_success_at,last_error");
  const { data: queue } = await sb.from("integration_outbox").select("id,ticket_id,operation,status,attempts,last_error,created_at,tickets(ticket_no)").neq("status", "sent").order("seq", { ascending: false }).limit(50);
  const by = (kind: string) => (rows ?? []).find((r) => r.kind === kind);
  const userOf = async (id?: string) => {
    if (!id) return "";
    const { data: s } = await supabaseAdmin().rpc("integration_read_secret", { p_integration: id });
    try { return String(JSON.parse(String(s ?? "{}")).u ?? ""); } catch { return ""; }
  };
  const lk = by("device_lookup"), sy = by("service_sync");
  const [lkUser, syUser] = await Promise.all([userOf(lk?.id), userOf(sy?.id)]);
  const lm = ((lk?.field_map as FieldMap) ?? {}).lookup ?? {};
  const tm = ((sy?.field_map as FieldMap) ?? {}).ticket ?? {};
  const sm = ((sy?.field_map as FieldMap) ?? {}).status_map ?? {};
  const qs: Record<string, string> = { pending: S.qPending, sent: S.qSent, failed: S.qFailed, dead: S.qDead };

  const Common = ({ kind, row, user }: { kind: string; row: any; user: string }) => (
    <>
      <input type="hidden" name="kind" value={kind} />
      <label className="row" style={{ cursor: "pointer" }}><input type="checkbox" name="enabled" defaultChecked={row?.is_enabled === true} style={{ width: "auto" }} /> {S.switchedOn}</label>
      <label>{S.baseUrl}<input name="base_url" defaultValue={row?.base_url ?? ""} placeholder="https://" /></label>
      <p><small>{S.baseUrlHint}</small></p>
      <div className="row">
        <label>{S.loginWord}<input name="username" defaultValue={user} autoComplete="off" /></label>
        <label>{S.passwordWord}<input name="password" type="password" autoComplete="new-password" placeholder={user ? S.passwordKeep : ""} /></label>
      </div>
    </>
  );
  const Status = ({ row, kind }: { row: any; kind: string }) => (
    <>
      {row?.last_success_at && <p><small>{S.lastSuccess}: {new Date(row.last_success_at).toLocaleString()}</small></p>}
      {row?.last_error && <p className="err"><small>{S.lastError}: {row.last_error}</small></p>}
      {k === kind && error && <p className="err">{error}</p>}
      {k === kind && ok && <p>{ok}</p>}
    </>
  );

  return (
    <div>
      <p><a href="/admin/settings">← {S.settingsWord}</a></p>
      <h1>{S.integrationsTitle}</h1>
      <p>{S.integrationsIntro}</p>
      {!k && error && <p className="err">{error}</p>}
      {!k && ok && <p>{ok}</p>}

      <form action={saveIntegrationAction} className="card" style={{ maxWidth: 760 }}>
        <h2>{S.lookupConn}</h2>
        <Common kind="device_lookup" row={lk} user={lkUser} />
        <label>{S.entityWord}<input name="entity" defaultValue={lm.entity ?? ""} placeholder="Catalog_…" /></label>
        <div className="row">
          <label>{S.serialField}<input name="serial_field" defaultValue={lm.serial_field ?? ""} /></label>
          <label>{S.modelField}<input name="model_field" defaultValue={lm.model_field ?? ""} /></label>
          <label>{S.warrantyField}<input name="warranty_field" defaultValue={lm.warranty_field ?? ""} /></label>
          <label>{S.soldField}<input name="sold_field" defaultValue={lm.sold_field ?? ""} /></label>
          <label>{S.customerField}<input name="customer_field" defaultValue={lm.customer_field ?? ""} /></label>
        </div>
        <Status row={lk} kind="device_lookup" />
        <button>{S.saveConn}</button>
      </form>
      <form action={testIntegrationAction} className="card row" style={{ maxWidth: 760 }}>
        <input type="hidden" name="kind" value="device_lookup" />
        <label>{S.testSerialLabel}<input name="serial" /></label>
        <button>{S.testBtn}</button>
      </form>

      <form action={saveIntegrationAction} className="card" style={{ maxWidth: 760 }}>
        <h2>{S.syncConn}</h2>
        <Common kind="service_sync" row={sy} user={syUser} />
        <label>{S.entityWord}<input name="entity" defaultValue={tm.entity ?? ""} placeholder="Document_…" /></label>
        <div className="row">
          <label>{S.ticketNoField}<input name="ticket_no_field" defaultValue={tm.ticket_no_field ?? ""} /></label>
          <label>{S.serialField}<input name="serial_field" defaultValue={tm.serial_field ?? ""} /></label>
          <label>{S.subjectField}<input name="subject_field" defaultValue={tm.subject_field ?? ""} /></label>
          <label>{S.descriptionField}<input name="description_field" defaultValue={tm.description_field ?? ""} /></label>
          <label>{S.customerField}<input name="customer_field" defaultValue={tm.customer_field ?? ""} /></label>
          <label>{S.statusField}<input name="status_field" defaultValue={tm.status_field ?? ""} /></label>
          <label>{S.idField}<input name="id_field" defaultValue={tm.id_field ?? ""} /></label>
          <label>{S.numberField}<input name="number_field" defaultValue={tm.number_field ?? ""} /></label>
        </div>
        <label>{S.extraJson}<textarea name="extra" rows={3} defaultValue={tm.extra && Object.keys(tm.extra).length ? JSON.stringify(tm.extra, null, 2) : ""} /></label>
        <h3>{S.statusValues}</h3>
        <div className="row">
          <label>{S.stInProgress}<input name="st_in_progress" defaultValue={sm.in_progress ?? ""} /></label>
          <label>{S.qcDone}<input name="st_done" defaultValue={sm.done ?? ""} /></label>
          <label>{S.stReplaced}<input name="st_rma" defaultValue={sm.rma ?? ""} /></label>
          <label>{S.stNotPossible}<input name="st_repair_not_possible" defaultValue={sm.repair_not_possible ?? ""} /></label>
        </div>
        <Status row={sy} kind="service_sync" />
        <button>{S.saveConn}</button>
      </form>
      <form action={testIntegrationAction} className="card row" style={{ maxWidth: 760 }}>
        <input type="hidden" name="kind" value="service_sync" />
        <button>{S.testBtn}</button>
      </form>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{S.queueTitle}</h2>
          <form action={runQueueAction}><button>{S.runNow}</button></form>
        </div>
        <table><thead><tr><th>{S.noWord}</th><th>{S.opWord}</th><th>{S.statusCol}</th><th>{S.attemptsWord}</th><th>{S.errorWord}</th><th></th></tr></thead><tbody>
          {(queue ?? []).map((q: any) => (
            <tr key={q.id}>
              <td><a href={`/tickets/${q.ticket_id}`}>{q.tickets?.ticket_no}</a></td>
              <td>{q.operation === "create_ticket" ? S.opCreate : S.opUpdate}</td>
              <td><span className="badge">{qs[q.status] ?? q.status}</span></td>
              <td>{q.attempts}</td>
              <td><small>{q.last_error ?? ""}</small></td>
              <td><form action={retryOutboxAction}><input type="hidden" name="id" value={q.id} /><button className="btn ghost">{S.retry}</button></form></td>
            </tr>
          ))}
          {(queue ?? []).length === 0 && <tr><td colSpan={6}>{S.queueEmpty}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
