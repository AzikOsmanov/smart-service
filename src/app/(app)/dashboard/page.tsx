import { redirect } from "next/navigation";
import { fmtDT } from "@/lib/fmt-time";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { getT } from "@/lib/i18n";

type Stats = {
  scope_all: boolean; open_now: number; overdue: number; created: number; closed: number;
  avg_close_hours: number | null; avg_first_response_hours: number | null; avg_satisfaction: number | null; devices_in_service: number;
  by_status: Record<string, number>; by_device_status: Record<string, number>; warranty: { warranty: number; paid: number };
  fees: { currency: string; total: number; count: number }[]; engineers: { name: string; open: number; closed: number; overdue: number }[];
  daily: { day: string; created: number; closed: number }[];
  qc?: { total: number; done: number; broken: number; hardware_issue: number };
  svc: { diagnose: number; in_progress: number; done: number; repair_not_possible: number; replaced: number };
};
type Row = { id: string; no: number; subject: string; status: string; device_status: string | null; assignee: string | null; customer: string | null; sn: string | null; created_at: string; value: string | null };

const DAY = 86400000, BAKU = 4 * 3600000;   // Azerbaijan has no daylight saving: UTC+4
const ymd = (ms: number) => new Date(ms + BAKU).toISOString().slice(0, 10);
const startOf = (d: string) => new Date(`${d}T00:00:00+04:00`).getTime();
const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(startOf(d));

function Tile({ label, value, warn, href, active }: { label: string; value: string | number; warn?: boolean; href: string; active?: boolean }) {
  return (
    <a href={href} className="card" style={{ margin: 0, minWidth: 150, flex: "1 1 150px", textDecoration: "none", color: "inherit", cursor: "pointer", outline: active ? "2px solid var(--accent, #3b82f6)" : undefined }}>
      <small>{label}</small><div style={{ fontSize: 28, fontWeight: 700, color: warn ? "#ef4444" : undefined }}>{value}</div>
    </a>);
}
const METRICS = ["open_now", "overdue", "created", "closed", "devices", "diagnose", "in_progress", "done", "repair_not_possible", "replaced", "avg_close", "avg_first", "rating", "warranty", "paid", "fees", "qc_all", "qc_done", "qc_broken", "qc_hardware_issue"];
type QcRow = { id: string; serial: string | null; status: string; comment: string | null; by: string | null; created_at: string };
function Bars({ rows, none }: { rows: { label: string; value: number; href?: string }[]; none: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p><small>{none}</small></p>;
  return <div>{rows.map((r) => (
    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
      <span style={{ width: 160 }}>{r.href ? <a href={r.href}>{r.label}</a> : r.label}</span>
      <span style={{ flex: 1, background: "var(--line, #8883)", borderRadius: 6, height: 14 }}><span style={{ display: "block", width: `${(r.value / max) * 100}%`, height: 14, borderRadius: 6, background: "var(--accent, #3b82f6)" }} /></span>
      <b style={{ width: 36, textAlign: "right" }}>{r.value}</b>
    </div>))}</div>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; m?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { t } = await getT();
  const { data: ok } = await sb.rpc("has_permission", { p_code: "dashboard.view" });
  if (ok !== true) redirect("/tickets");
  const today = ymd(Date.now());
  let p = sp.p === "today" || sp.p === "30" || sp.p === "custom" ? sp.p : "7";
  let fromD = ymd(Date.now() - 6 * DAY), toD = today;
  if (p === "today") fromD = today;
  else if (p === "30") fromD = ymd(Date.now() - 29 * DAY);
  else if (p === "custom") {
    if (valid(sp.from) && valid(sp.to) && startOf(sp.from!) <= startOf(sp.to!) && startOf(sp.to!) - startOf(sp.from!) <= 366 * DAY) { fromD = sp.from!; toD = sp.to!; }
    else p = "7";
  }
  const { data, error } = await sb.rpc("dashboard_stats", { p_from: new Date(startOf(fromD)).toISOString(), p_to: new Date(startOf(toD) + DAY).toISOString() });
  const d = data as Stats | null;
  const m = sp.m && METRICS.includes(sp.m) ? sp.m : "";
  const fromIso = new Date(startOf(fromD)).toISOString(), toIso = new Date(startOf(toD) + DAY).toISOString();
  const isQc = m.startsWith("qc_");
  const { data: qcData } = isQc ? await sb.rpc("dashboard_qc", { p_status: m.slice(3), p_from: new Date(startOf(fromD)).toISOString(), p_to: new Date(startOf(toD) + DAY).toISOString() }) : { data: null };
  const qcList = (qcData ?? []) as QcRow[];
  const qcLabel = (k: string) => (k === "done" ? S.qcDone : k === "broken" ? S.qcBroken : k === "hardware_issue" ? S.qcHardware : k);
  const { data: listData } = m && !isQc ? await sb.rpc("dashboard_tickets", { p_metric: m, p_from: fromIso, p_to: toIso }) : { data: null };
  const list = (listData ?? []) as Row[];
  const base = p === "custom" ? `/dashboard?p=custom&from=${fromD}&to=${toD}` : `/dashboard?p=${p}`;
  const L = (k: string) => `${base}&m=${k}#list`;
  const tab = (k: string, label: string) => <a key={k} className={`btn ${p === k ? "" : "ghost"}`} href={`/dashboard?p=${k}`} style={{ textDecoration: "none" }}>{label}</a>;
  const h = (v: number | null) => (v == null ? "—" : `${v} ${S.dashHours}`);
  const stLabel: Record<string, string> = { new: S.dashStNew, assigned: S.dashStAssigned, in_progress: S.dashStInProgress, waiting_customer: S.dashStWaiting };
  const metricName = (k: string) => ({ open_now: S.dashOpenNow, overdue: S.dashOverdue, created: S.dashCreated, closed: S.dashClosed, devices: S.dashDevices, diagnose: S.dashDiagnose, in_progress: S.dashInProgress, done: S.dashDone, repair_not_possible: S.dashRnp, replaced: S.dashReplaced, avg_close: S.dashAvgClose, avg_first: S.dashAvgFirst, rating: S.dashSatisfaction, warranty: S.dashWarrantyWord, paid: S.dashPaidWord, fees: S.dashFees } as Record<string, string>)[k] ?? k;
  const devLabel = (k: string) => { const v = (t as (k: string) => string)(`st_${k}`); return v || k; };
  return (
    <div>
      <h1>{S.dashTitle}</h1>
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {tab("today", S.dashToday)}{tab("7", S.dash7)}{tab("30", S.dash30)}
        <form method="get" className="row" style={{ gap: 6 }}>
          <input type="hidden" name="p" value="custom" />
          <label style={{ margin: 0 }}>{S.dashFrom} <input type="date" name="from" defaultValue={fromD} max={today} required /></label>
          <label style={{ margin: 0 }}>{S.dashTo} <input type="date" name="to" defaultValue={toD} max={today} required /></label>
          <button className={p === "custom" ? "" : "ghost"}>{S.dashApply}</button>
        </form>
      </div>
      {error || !d ? <p className="err">{error?.message ?? S.dashNone}</p> : (
        <>
          {!d.scope_all && <p><small>{S.dashMyOnly}</small></p>}
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Tile href={L("open_now")} active={m === "open_now"} label={S.dashOpenNow} value={d.open_now} />
            <Tile href={L("overdue")} active={m === "overdue"} label={S.dashOverdue} value={d.overdue} warn={d.overdue > 0} />
            <Tile href={L("created")} active={m === "created"} label={S.dashCreated} value={d.created} />
            <Tile href={L("closed")} active={m === "closed"} label={S.dashClosed} value={d.closed} />
            <Tile href={L("devices")} active={m === "devices"} label={S.dashDevices} value={d.devices_in_service} />
          </div>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Tile href={L("avg_close")} active={m === "avg_close"} label={S.dashAvgClose} value={h(d.avg_close_hours)} />
            <Tile href={L("avg_first")} active={m === "avg_first"} label={S.dashAvgFirst} value={h(d.avg_first_response_hours)} />
            <Tile href={L("rating")} active={m === "rating"} label={S.dashSatisfaction} value={d.avg_satisfaction ?? "—"} />
          </div>
          <h2 style={{ marginTop: 20 }}>{S.dashStatuses}</h2>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Tile href={L("diagnose")} active={m === "diagnose"} label={S.dashDiagnose} value={d.svc.diagnose} />
            <Tile href={L("in_progress")} active={m === "in_progress"} label={S.dashInProgress} value={d.svc.in_progress} />
            <Tile href={L("done")} active={m === "done"} label={S.dashDone} value={d.svc.done} />
            <Tile href={L("repair_not_possible")} active={m === "repair_not_possible"} label={S.dashRnp} value={d.svc.repair_not_possible} />
            <Tile href={L("replaced")} active={m === "replaced"} label={S.dashReplaced} value={d.svc.replaced} />
          </div>
          {d.qc && (<>
            <h2 style={{ marginTop: 20 }}>{S.dashQc}</h2>
            <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <Tile href={L("qc_all")} active={m === "qc_all"} label={S.dashQcAll} value={d.qc.total} />
              <Tile href={L("qc_done")} active={m === "qc_done"} label={S.qcDone} value={d.qc.done} />
              <Tile href={L("qc_broken")} active={m === "qc_broken"} label={S.qcBroken} value={d.qc.broken} warn={d.qc.broken > 0} />
              <Tile href={L("qc_hardware_issue")} active={m === "qc_hardware_issue"} label={S.qcHardware} value={d.qc.hardware_issue} warn={d.qc.hardware_issue > 0} />
            </div>
          </>)}
          {isQc && (
            <div className="card" id="list">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>{S.dashQcListFor} {m === "qc_all" ? S.dashQcAll : qcLabel(m.slice(3))}</h2>
                <a className="btn ghost" href={base} style={{ textDecoration: "none" }}>{S.dashClose}</a>
              </div>
              {qcList.length === 0 ? <p><small>{S.dashNone}</small></p> : (
                <div style={{ overflowX: "auto" }}>
                  <table><thead><tr><th>{S.dashColSn}</th><th>{S.dashColResult}</th><th>{S.dashColBy}</th><th>{S.dashColCreated}</th></tr></thead>
                    <tbody>{qcList.map((r) => (
                      <tr key={r.id}>
                        <td><a href={`/qc/${r.id}`}>{r.serial ?? "—"}</a></td><td><span className="badge">{qcLabel(r.status)}</span></td><td>{r.by ?? "—"}</td><td>{fmtDT(r.created_at)}</td>
                      </tr>))}</tbody></table>
                </div>)}
              {qcList.length >= 200 && <small>{S.dashListMax}</small>}
            </div>
          )}
          {m && !isQc && (
            <div className="card" id="list">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>{S.dashListFor} {metricName(m)}</h2>
                <a className="btn ghost" href={base} style={{ textDecoration: "none" }}>{S.dashClose}</a>
              </div>
              {list.length === 0 ? <p><small>{S.dashNone}</small></p> : (
                <div style={{ overflowX: "auto" }}>
                  <table><thead><tr><th>{S.dashColNo}</th><th>{S.dashColSubject}</th><th>{S.dashColCustomer}</th><th>{S.dashColSn}</th><th>{S.dashColStatus}</th>{d.scope_all && <th>{S.dashColEngineer}</th>}{list.some((r) => r.value) && <th>{S.dashColValue}</th>}<th>{S.dashColCreated}</th></tr></thead>
                    <tbody>{list.map((r) => (
                      <tr key={r.id}>
                        <td><a href={`/tickets/${r.id}`}>#{r.no}</a></td><td><a href={`/tickets/${r.id}`}>{r.subject}</a></td><td>{r.customer ?? "—"}</td><td>{r.sn ?? "—"}</td>
                        <td><span className="badge">{r.device_status ? devLabel(r.device_status) : (stLabel[r.status] ?? r.status)}</span></td>
                        {d.scope_all && <td>{r.assignee ?? "—"}</td>}{list.some((x) => x.value) && <td><b>{r.value ?? ""}</b></td>}
                        <td>{fmtDT(r.created_at)}</td>
                      </tr>))}</tbody></table>
                </div>)}
              {list.length >= 200 && <small>{S.dashListMax}</small>}
            </div>
          )}
          <div className="row" style={{ gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
            <div className="card" style={{ flex: "1 1 320px", margin: 0 }}><h2>{S.dashByStatus}</h2>
              <Bars none={S.dashNone} rows={Object.entries(d.by_status).map(([k, v]) => ({ label: stLabel[k] ?? k, value: v }))} /></div>
            <div className="card" style={{ flex: "1 1 320px", margin: 0 }}><h2>{S.dashByDevStatus}</h2>
              <Bars none={S.dashNone} rows={Object.entries(d.by_device_status).map(([k, v]) => ({ label: devLabel(k), value: v }))} /></div>
            <div className="card" style={{ flex: "1 1 320px", margin: 0 }}><h2>{S.dashWarranty}</h2>
              <Bars none={S.dashNone} rows={[{ label: S.dashWarrantyWord, value: d.warranty.warranty, href: L("warranty") }, { label: S.dashPaidWord, value: d.warranty.paid, href: L("paid") }]} />
              <h2 style={{ marginTop: 16 }}><a href={L("fees")} style={{ color: "inherit" }}>{S.dashFees}</a></h2>
              {d.fees.length ? d.fees.map((f) => <div key={f.currency}><b>{Number(f.total).toLocaleString(undefined, { maximumFractionDigits: 2 })} {f.currency}</b> <small>({f.count})</small></div>) : <small>{S.dashNone}</small>}
            </div>
          </div>
          {d.scope_all && (
            <div className="card"><h2>{S.dashEngineers}</h2>
              {d.engineers.length ? (
                <table><thead><tr><th>{S.dashEngName}</th><th>{S.dashOpen}</th><th>{S.dashClosed}</th><th>{S.dashOverdue}</th></tr></thead>
                  <tbody>{d.engineers.map((e, i) => <tr key={i}><td>{e.name}</td><td>{e.open}</td><td>{e.closed}</td><td style={{ color: e.overdue ? "#ef4444" : undefined }}>{e.overdue}</td></tr>)}</tbody></table>
              ) : <small>{S.dashNone}</small>}
            </div>
          )}
          <div className="card"><h2>{S.dashDaily}</h2>
            {(() => {
              const max = Math.max(1, ...d.daily.flatMap((x) => [x.created, x.closed]));
              return (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140, overflowX: "auto" }}>
                  {d.daily.map((x) => (
                    <div key={x.day} title={`${x.day}: +${x.created} / ✓${x.closed}`} style={{ display: "flex", alignItems: "flex-end", gap: 1, height: "100%", minWidth: 14 }}>
                      <span style={{ width: 6, height: `${(x.created / max) * 100}%`, background: "var(--accent, #3b82f6)", borderRadius: 2 }} />
                      <span style={{ width: 6, height: `${(x.closed / max) * 100}%`, background: "#22c55e", borderRadius: 2 }} />
                    </div>))}
                </div>);
            })()}
            <small>■ {S.dashCreated} &nbsp; <span style={{ color: "#22c55e" }}>■</span> {S.dashClosed}</small>
          </div>
        </>
      )}
    </div>
  );
}
