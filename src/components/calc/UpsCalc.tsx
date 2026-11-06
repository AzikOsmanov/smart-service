"use client";
import { useState } from "react";
import { upsCalc } from "@/lib/calc";
import { downloadReportPdf } from "@/lib/calc-pdf";
import { Field, Report, Row, dur, fileStamp, fill, grid, n1, num, type L } from "./shared";

export default function UpsCalc({ L }: { L: L }) {
  const [load, setLoad] = useState("60");
  const [volts, setVolts] = useState("24");
  const [ah, setAh] = useState("9");
  const [strings, setStrings] = useState("1");
  const [eff, setEff] = useState("85");
  const [dod, setDod] = useState("80");
  const [cond, setCond] = useState("100");
  const [upsW, setUpsW] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const r = upsCalc({ loadW: num(load), volts: num(volts), ah: num(ah), strings: num(strings, 1), effPct: num(eff, 85), dodPct: num(dod, 80), condPct: num(cond, 100), upsW: upsW ? num(upsW) : null, targetMin: target ? num(target) : null });
  const condName = cond === "100" ? L.calcCondNew : cond === "85" ? L.calcCondMid : L.calcCondOld;
  const inputs: [string, string][] = [
    [L.calcLoad, `${num(load)} W`], [L.calcVolts, `${num(volts)} V`], [L.calcAh, `${num(ah)} Ah`], [L.calcStrings, String(num(strings, 1))],
    [L.calcEff, `${num(eff, 85)}%`], [L.calcDod, `${num(dod, 80)}%`], [L.calcCond, condName],
    ...(upsW ? [[L.calcUpsW, `${num(upsW)} W`] as [string, string]] : []), ...(target ? [[L.calcTarget, `${num(target)}`] as [string, string]] : []),
  ];
  async function pdf() {
    const el = document.getElementById("ups-report");
    if (!el) return;
    setBusy(true);
    try { await downloadReportPdf(el, `battery-runtime-${fileStamp()}.pdf`); } finally { setBusy(false); }
  }
  return (
    <div>
      <div style={{ ...grid, marginTop: 10 }}>
        <Field label={L.calcLoad}><input type="number" min={1} value={load} onChange={(e) => setLoad(e.target.value)} /></Field>
        <Field label={L.calcVolts}><select value={volts} onChange={(e) => setVolts(e.target.value)}>{[12, 24, 36, 48, 72, 96, 192, 240].map((x) => <option key={x} value={x}>{x} V</option>)}</select></Field>
        <Field label={L.calcAh}><input type="number" min={1} step="0.5" value={ah} onChange={(e) => setAh(e.target.value)} /></Field>
        <Field label={L.calcStrings}><input type="number" min={1} max={20} value={strings} onChange={(e) => setStrings(e.target.value)} /></Field>
        <Field label={L.calcEff}><input type="number" min={50} max={100} value={eff} onChange={(e) => setEff(e.target.value)} /></Field>
        <Field label={L.calcDod}><input type="number" min={30} max={100} value={dod} onChange={(e) => setDod(e.target.value)} /></Field>
        <Field label={L.calcCond}><select value={cond} onChange={(e) => setCond(e.target.value)}><option value="100">{L.calcCondNew}</option><option value="85">{L.calcCondMid}</option><option value="70">{L.calcCondOld}</option></select></Field>
        <Field label={L.calcUpsW}><input type="number" min={0} value={upsW} onChange={(e) => setUpsW(e.target.value)} /></Field>
        <Field label={L.calcTarget}><input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </div>
      <Report id="ups-report" title={L.calcUps} brandLine="UPS" inputs={inputs} note={L.calcEstimate} L={L}>
        <Row k={L.calcStored} v={`${n1(r.storedWh, 0)} Wh`} />
        <Row k={L.calcUsableE} v={`${n1(r.usableWh, 0)} Wh`} />
        <Row k={L.calcRuntime} v={dur(r.runtimeMin, L)} strong />
        {r.byLoad.map((b) => <Row key={b.pct} k={fill(L.calcRuntimeAt, { p: b.pct, w: n1(b.watts, 0) })} v={dur(b.min, L)} />)}
        <Row k={L.calcRecUps} v={`${n1(r.recommendedW, 0)} W`} />
        {r.needAh != null && <Row k={L.calcNeedAh} v={`${n1(r.needAh, 1)} Ah`} strong />}
        {r.overload && <p style={{ margin: "10px 0 0", color: "#b91c1c", fontWeight: 600 }}>⚠ {L.calcOverload}</p>}
      </Report>
      <div style={{ marginTop: 12 }}><button type="button" onClick={pdf} disabled={busy}>{busy ? L.calcPdfBusy : L.calcPdf}</button></div>
    </div>
  );
}
