import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { getT } from "@/lib/i18n";

type Stats = {
  scope_all: boolean; open_now: number; overdue: number; created: number; closed: number;
  avg_close_hours: number | null; avg_first_response_hours: number | null; avg_satisfaction: number | null; devices_in_service: number;
  by_status: Record<string, number>; by_device_status: Record<string, number>; warranty: { warranty: number; paid: number };
  fees: { currency: string; total: number; count: number }[]; engineers: { name: string; open: number; closed: number; overdue: number }[];
  daily: { day: string; created: number; closed: number }[];
};

const DAY = 86400000, BAKU = 4 * 3600000;   // Azerbaijan has no daylight saving: UTC+4
const ymd = (ms: number) => new Date(ms + BAKU).toISOString().slice(0, 10);
const startOf = (d: string) => new Date(`${d}T00:00:00+04:00`).getTime();
const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(startOf(d));

function Tile({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return <div className="card" style={{ margin: 0, minWidth: 150, flex: "1 1 150px" }}><small>{label}</small><div style={{ fontSize: 28, fontWeight: 700, color: warn ? "#ef4444" : undefined }}>{value}</div></div>;
}
function Bars({ rows, none }: { rows: { label: string; value: number }[]; none: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p><small>{none}</small></p>;
  return <div>{rows.map((r) => (
    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
      <span style={{ width: 160 }}>{r.label}</span>
      <span style={{ flex: 1, background: "var(--line, #8883)", borderRadius: 6, height: 14 }}><span style={{ display: "block", width: `${(r.value / max) * 100}%`, height: 14, borderRadius: 6, background: "var(--accent, #3b82f6)" }} /></span>
      <b style={{ width: 36, textAlign: "right" }}>{r.value}</b>
    </div>))}</div>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
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
  const tab = (k: string, label: string) => <a key={k} className={`btn ${p === k ? "" : "ghost"}`} href={`/dashboard?p=${k}`} style={{ textDecoration: "none" }}>{label}</a>;
  const h = (v: number | null) => (v == null ? "—" : `${v} ${S.dashHours}`);
  const stLabel: Record<string, string> = { new: S.dashStNew, assigned: S.dashStAssigned, in_progress: S.dashStInProgress, waiting_customer: S.dashStWaiting };
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
            <Tile label={S.dashOpenNow} value={d.open_now} />
            <Tile label={S.dashOverdue} value={d.overdue} warn={d.overdue > 0} />
            <Tile label={S.dashCreated} value={d.created} />
            <Tile label={S.dashClosed} value={d.closed} />
            <Tile label={S.dashDevices} value={d.devices_in_service} />
          </div>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Tile label={S.dashAvgClose} value={h(d.avg_close_hours)} />
            <Tile label={S.dashAvgFirst} value={h(d.avg_first_response_hours)} />
            <Tile label={S.dashSatisfaction} value={d.avg_satisfaction ?? "—"} />
          </div>
          <div className="row" style={{ gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
            <div className="card" style={{ flex: "1 1 320px", margin: 0 }}><h2>{S.dashByStatus}</h2>
              <Bars none={S.dashNone} rows={Object.entries(d.by_status).map(([k, v]) => ({ label: stLabel[k] ?? k, value: v }))} /></div>
            <div className="card" style={{ flex: "1 1 320px", margin: 0 }}><h2>{S.dashByDevStatus}</h2>
              <Bars none={S.dashNone} rows={Object.entries(d.by_device_status).map(([k, v]) => ({ label: devLabel(k), value: v }))} /></div>
            <div className="card" style={{ flex: "1 1 320px", margin: 0 }}><h2>{S.dashWarranty}</h2>
              <Bars none={S.dashNone} rows={[{ label: S.dashWarrantyWord, value: d.warranty.warranty }, { label: S.dashPaidWord, value: d.warranty.paid }]} />
              <h2 style={{ marginTop: 16 }}>{S.dashFees}</h2>
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
