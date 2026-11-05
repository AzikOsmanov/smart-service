import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { saveIntegrationAction, testIntegrationAction, retryOutboxAction, runQueueAction } from "@/lib/integration-actions";
import { saveIeoAction, testIeoAction } from "@/lib/ieo-actions";
import { headers } from "next/headers";
import type { FieldMap } from "@/lib/onec";
import type { IeoMap } from "@/lib/ieo";

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
  const il = by("ieo_device_lookup"), is = by("ieo_service_sync");
  const hs = await headers();
  const origin = `${hs.get("x-forwarded-proto") ?? "https"}://${hs.get("host") ?? ""}`;
  const ieoSecret = async (id?: string) => {
    if (!id) return { has: false };
    const { data: sec } = await supabaseAdmin().rpc("integration_read_secret", { p_integration: id });
    try { const j = JSON.parse(String(sec ?? "{}")); return { has: !!(j.t || j.p), user: String(j.u ?? ""), hasHook: !!j.w }; } catch { return { has: false }; }
  };
  const [ilSec, isSec] = await Promise.all([ieoSecret(il?.id), ieoSecret(is?.id)]);
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


      {[{ kind: "ieo_device_lookup", row: il, sec: ilSec, title: S.ieoLookupConn }, { kind: "ieo_service_sync", row: is, sec: isSec, title: S.ieoSyncConn }].map(({ kind, row, sec, title }) => {
        const im = ((row?.field_map as IeoMap) ?? {}) as IeoMap;
        const lk2 = im.lookup ?? {}, tk = im.ticket ?? {}, st = im.status_map ?? {};
        const mode = im.mode ?? "rest";
        const sync = kind === "ieo_service_sync";
        return (
          <div key={kind}>
            <form action={saveIeoAction} className="card" style={{ maxWidth: 760 }}>
              <h2>{title}</h2>
              <input type="hidden" name="kind" value={kind} />
              <label className="row" style={{ cursor: "pointer" }}><input type="checkbox" name="enabled" defaultChecked={row?.is_enabled === true} style={{ width: "auto" }} /> {S.switchedOn}</label>
              <div className="row">
                <label>{S.modeWord}<select name="mode" defaultValue={mode}><option value="rest">{S.modeRest}</option><option value="odata">{S.modeOdata}</option><option value="webhook">{S.modeWebhook}</option></select></label>
                <label>{S.authWord}<select name="auth_type" defaultValue={(row as any)?.auth_type ?? "api_key"}><option value="api_key">{S.authApiKey}</option><option value="bearer">{S.authBearer}</option><option value="basic">{S.authBasic}</option></select></label>
              </div>
              <label>{S.baseUrl}<input name="base_url" defaultValue={row?.base_url ?? ""} placeholder="https://" /></label>
              <p><small>{S.baseUrlHint}</small></p>
              <div className="row">
                <label>{S.apiKeyWord}<input name="token" type="password" autoComplete="new-password" placeholder={sec.has ? S.keyKeep : ""} /></label>
                <label>{S.authHeaderWord}<input name="auth_header" defaultValue={im.auth_header ?? ""} placeholder="X-API-Key" /></label>
              </div>
              <div className="row">
                <label>{S.loginWord}<input name="username" defaultValue={(sec as any).user ?? ""} autoComplete="off" /></label>
                <label>{S.passwordWord}<input name="password" type="password" autoComplete="new-password" /></label>
                <label>{S.webhookSecretWord}<input name="webhook_secret" type="password" autoComplete="new-password" placeholder={(sec as any).hasHook ? S.keyKeep : ""} /></label>
              </div>
              {!sync ? (
                <>
                  <div className="row">
                    <label>{S.pathWord}<input name="path" defaultValue={lk2.path ?? ""} placeholder="/devices/{serial}" /></label>
                    <label>{S.resultPathWord}<input name="result_path" defaultValue={lk2.result_path ?? ""} /></label>
                    <label>{S.entityWord} (OData)<input name="entity" defaultValue={lk2.entity ?? ""} /></label>
                    <label>{S.serialField}<input name="serial_field" defaultValue={lk2.serial_field ?? ""} /></label>
                  </div>
                  <div className="row">
                    <label>{S.modelField}<input name="model_field" defaultValue={lk2.model_field ?? ""} /></label>
                    <label>{S.warrantyField}<input name="warranty_field" defaultValue={lk2.warranty_field ?? ""} /></label>
                    <label>{S.soldField}<input name="sold_field" defaultValue={lk2.sold_field ?? ""} /></label>
                    <label>{S.customerField}<input name="customer_field" defaultValue={lk2.customer_field ?? ""} /></label>
                  </div>
                </>
              ) : (
                <>
                  <div className="row">
                    <label>{S.createPathWord}<input name="create_path" defaultValue={tk.create_path ?? ""} placeholder="/tickets" /></label>
                    <label>{S.createMethodWord}<input name="create_method" defaultValue={tk.create_method ?? ""} placeholder="POST" /></label>
                    <label>{S.updatePathWord}<input name="update_path" defaultValue={tk.update_path ?? ""} placeholder="/tickets/{id}" /></label>
                    <label>{S.updateMethodWord}<input name="update_method" defaultValue={tk.update_method ?? ""} placeholder="PATCH" /></label>
                    <label>{S.entityWord} (OData)<input name="entity" defaultValue={tk.entity ?? ""} /></label>
                  </div>
                  <div className="row">
                    <label>{S.ticketNoField}<input name="ticket_no_field" defaultValue={tk.ticket_no_field ?? ""} /></label>
                    <label>{S.serialField}<input name="serial_field" defaultValue={tk.serial_field ?? ""} /></label>
                    <label>{S.subjectField}<input name="subject_field" defaultValue={tk.subject_field ?? ""} /></label>
                    <label>{S.descriptionField}<input name="description_field" defaultValue={tk.description_field ?? ""} /></label>
                    <label>{S.customerField}<input name="customer_field" defaultValue={tk.customer_field ?? ""} /></label>
                    <label>{S.statusField}<input name="status_field" defaultValue={tk.status_field ?? ""} /></label>
                    <label>{S.idField}<input name="id_field" defaultValue={tk.id_field ?? ""} /></label>
                    <label>{S.numberField}<input name="number_field" defaultValue={tk.number_field ?? ""} /></label>
                  </div>
                  <label>{S.extraJson}<textarea name="extra" rows={3} defaultValue={tk.extra && Object.keys(tk.extra).length ? JSON.stringify(tk.extra, null, 2) : ""} /></label>
                  <h3>{S.statusValues}</h3>
                  <div className="row">
                    <label>{S.stInProgress}<input name="st_in_progress" defaultValue={st.in_progress ?? ""} /></label>
                    <label>{S.qcDone}<input name="st_done" defaultValue={st.done ?? ""} /></label>
                    <label>{S.stReplaced}<input name="st_rma" defaultValue={st.rma ?? ""} /></label>
                    <label>{S.stNotPossible}<input name="st_repair_not_possible" defaultValue={st.repair_not_possible ?? ""} /></label>
                  </div>
                  <p><small>{S.webhookOutHint}</small></p>
                </>
              )}
              {row?.id && <p><small>{S.webhookInHint} <code>{origin}/api/webhooks/ieo/{row.id}</code></small></p>}
              {row?.last_success_at && <p><small>{S.lastSuccess}: {new Date(row.last_success_at).toLocaleString()}</small></p>}
              {row?.last_error && <p className="err"><small>{S.lastError}: {row.last_error}</small></p>}
              {k === kind && error && <p className="err">{error}</p>}
              {k === kind && ok && <p>{ok}</p>}
              <button>{S.saveConn}</button>
            </form>
            <form action={testIeoAction} className="card row" style={{ maxWidth: 760 }}>
              <input type="hidden" name="kind" value={kind} />
              {!sync && <label>{S.testSerialLabel}<input name="serial" /></label>}
              <button>{S.testBtn}</button>
            </form>
          </div>
        );
      })}

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
