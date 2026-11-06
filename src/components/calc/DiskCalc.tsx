"use client";
import { useMemo, useState } from "react";
import { BRANDS, RESOLUTIONS, UNV_RES, NVRS, SMART_NAME, diskCalc, type Brand, type Codec, type Raid } from "@/lib/calc";
import { downloadReportPdf } from "@/lib/calc-pdf";
import { Field, Report, Row, fileStamp, fill, grid, n1, num, type L } from "./shared";

export default function DiskCalc({ L }: { L: L }) {
  const [brand, setBrand] = useState<Brand>("dahua");
  const [cameras, setCameras] = useState("8");
  const [res, setRes] = useState("4");
  const [ucode, setUcode] = useState<"off" | "basic" | "adv">("adv");
  const [cx, setCx] = useState<"low" | "med" | "high">("med");
  const [codec, setCodec] = useState<Codec>("h265");
  const [fps, setFps] = useState("25");
  const [bitrate, setBitrate] = useState("");
  const [mode, setMode] = useState<"cont" | "motion">("cont");
  const [motion, setMotion] = useState("30");
  const [days, setDays] = useState("30");
  const [raid, setRaid] = useState<Raid>("none");
  const [diskTb, setDiskTb] = useState("4");
  const [have, setHave] = useState("");
  const [nvrId, setNvrId] = useState("any");
  const [cust, setCust] = useState({ channels: "16", bays: "2", maxTb: "10", mbps: "160" });
  const [busy, setBusy] = useState(false);

  const models = NVRS.filter((x) => x.brand === brand);
  const nvr = useMemo(() => {
    if (nvrId === "any") return null;
    if (nvrId === "custom") return { channels: num(cust.channels), bays: num(cust.bays), maxTb: num(cust.maxTb), mbps: num(cust.mbps), raid: true };
    const m = NVRS.find((x) => x.id === nvrId);
    return m ? { channels: m.channels, bays: m.bays, maxTb: m.maxTb, mbps: m.mbps, raid: m.raid } : null;
  }, [nvrId, cust]);
  const modelName = nvrId === "custom" ? L.calcNvrCustom : NVRS.find((x) => x.id === nvrId)?.model ?? L.calcNvrAny;
  const resList = brand === "unv" ? UNV_RES : RESOLUTIONS;
  const r = diskCalc({ brand, cameras: num(cameras), res, codec, ucode, cx, fps: num(fps, 25) || 25, bitrate: bitrate ? num(bitrate) : null, mode, motionPct: num(motion), days: num(days), raid, diskTb: num(diskTb), haveDisks: have ? num(have) : null, nvr });
  const codecName = codec === "h264" ? "H.264" : codec === "h265" ? "H.265" : SMART_NAME[brand];
  const resName = resList.find((x) => x.id === res)?.label ?? res;
  const badText = r.checks.map((c) => fill(L[({ channels: "calcBadChannels", bays: "calcBadBays", disk: "calcBadDisk", bw: "calcBadBw", raid: "calcBadRaid" } as const)[c.kind]], { a: c.a, b: c.b }));
  const raidName = raid === "none" ? L.calcRaidNone : `RAID ${raid}`;

  const inputs: [string, string][] = [
    [L.calcBrand, BRANDS.find((b) => b.id === brand)!.name], [L.calcCameras, String(num(cameras))], [L.calcRes, resName], [L.calcCodec, codecName], ...(brand === "unv" ? [[L.calcUcode, ucode === "adv" ? L.calcUcodeAdv : ucode === "basic" ? L.calcUcodeBasic : L.calcUcodeOff] as [string, string], ...(ucode !== "off" ? [[L.calcComplexity, cx === "low" ? L.calcCxLow : cx === "high" ? L.calcCxHigh : L.calcCxMed] as [string, string]] : [])] : []),
    ...(brand === "unv" ? [] : [[L.calcFps, String(num(fps, 25))] as [string, string]]), ...(bitrate ? [[L.calcBitrate, `${bitrate} Kbps`] as [string, string]] : []),
    [L.calcMode, mode === "cont" ? L.calcModeCont : `${L.calcModeMotion} (${num(motion)}%)`], [L.calcDays, String(num(days))],
    [L.calcRaid, raidName], [L.calcDiskSize, String(num(diskTb))], [L.calcNvr, modelName],
    ...(nvr ? [[`${L.calcNvrChannels} / ${L.calcNvrBays} / ${L.calcNvrMaxTb} / ${L.calcNvrBw}`, `${nvr.channels} / ${nvr.bays} / ${nvr.maxTb} / ${nvr.mbps}`] as [string, string]] : []),
    ...(have ? [[L.calcHave, String(num(have))] as [string, string]] : []),
  ];

  async function pdf() {
    const el = document.getElementById("disk-report");
    if (!el) return;
    setBusy(true);
    try { await downloadReportPdf(el, `disk-calculator-${fileStamp()}.pdf`); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ ...grid, marginTop: 10 }}>
        <Field label={L.calcBrand}><select value={brand} onChange={(e) => { const b = e.target.value as Brand; setBrand(b); setNvrId("any"); setRes(b === "unv" ? "4mp" : "4"); if (b === "unv" && codec === "smart") setCodec("h265"); }}>{BRANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label={L.calcCameras}><input type="number" min={1} max={256} value={cameras} onChange={(e) => setCameras(e.target.value)} /></Field>
        <Field label={L.calcRes}><select value={res} onChange={(e) => setRes(e.target.value)}>{resList.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
        <Field label={L.calcCodec}><select value={codec} onChange={(e) => setCodec(e.target.value as Codec)}><option value="h264">H.264</option><option value="h265">H.265</option>{brand === "dahua" && <option value="smart">{SMART_NAME[brand]}</option>}</select></Field>
        {brand === "unv" && <Field label={L.calcUcode}><select value={ucode} onChange={(e) => setUcode(e.target.value as "off" | "basic" | "adv")}><option value="adv">{L.calcUcodeAdv}</option><option value="basic">{L.calcUcodeBasic}</option><option value="off">{L.calcUcodeOff}</option></select></Field>}
        {brand === "unv" && ucode !== "off" && <Field label={L.calcComplexity}><select value={cx} onChange={(e) => setCx(e.target.value as "low" | "med" | "high")}><option value="low">{L.calcCxLow}</option><option value="med">{L.calcCxMed}</option><option value="high">{L.calcCxHigh}</option></select></Field>}
        {brand !== "unv" && <Field label={L.calcFps}><input type="number" min={1} max={60} value={fps} onChange={(e) => setFps(e.target.value)} /></Field>}
        <Field label={L.calcBitrate}><input type="number" min={0} step="1" value={bitrate} onChange={(e) => setBitrate(e.target.value)} /></Field>
        <Field label={L.calcMode}><select value={mode} onChange={(e) => setMode(e.target.value as "cont" | "motion")}><option value="cont">{L.calcModeCont}</option><option value="motion">{L.calcModeMotion}</option></select></Field>
        {mode === "motion" && <Field label={L.calcMotionPct}><input type="number" min={0} max={100} value={motion} onChange={(e) => setMotion(e.target.value)} /></Field>}
        <Field label={L.calcDays}><input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label={L.calcDiskSize}><select value={diskTb} onChange={(e) => setDiskTb(e.target.value)}>{[1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((x) => <option key={x} value={x}>{x} TB</option>)}</select></Field>
        <Field label={L.calcRaid}><select value={raid} onChange={(e) => setRaid(e.target.value as Raid)}><option value="none">{L.calcRaidNone}</option>{["1", "5", "6", "10"].map((x) => <option key={x} value={x}>RAID {x}</option>)}</select></Field>
        <Field label={L.calcHave}><input type="number" min={0} max={64} value={have} onChange={(e) => setHave(e.target.value)} /></Field>
        <Field label={L.calcNvr}>
          <select value={nvrId} onChange={(e) => setNvrId(e.target.value)}>
            <option value="any">{L.calcNvrAny}</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
            <option value="custom">{L.calcNvrCustom}</option>
          </select>
        </Field>
      </div>
      {nvrId === "custom" && (
        <div style={{ ...grid, marginTop: 10 }}>
          <Field label={L.calcNvrChannels}><input type="number" min={1} value={cust.channels} onChange={(e) => setCust({ ...cust, channels: e.target.value })} /></Field>
          <Field label={L.calcNvrBays}><input type="number" min={1} value={cust.bays} onChange={(e) => setCust({ ...cust, bays: e.target.value })} /></Field>
          <Field label={L.calcNvrMaxTb}><input type="number" min={1} value={cust.maxTb} onChange={(e) => setCust({ ...cust, maxTb: e.target.value })} /></Field>
          <Field label={L.calcNvrBw}><input type="number" min={1} value={cust.mbps} onChange={(e) => setCust({ ...cust, mbps: e.target.value })} /></Field>
        </div>
      )}
      {nvrId !== "any" && nvrId !== "custom" && <p><small>{L.calcNvrNote}</small></p>}

      <Report id="disk-report" title={L.calcDisk} brandLine={BRANDS.find((b) => b.id === brand)!.name} inputs={inputs} note={`${L.calcEstimate} ${L.calcUnitsNote} ${brand === "unv" ? L.calcUnvNote : L.calcDahuaNote}${r.estimated ? ` (${L.calcEstimated})` : ""}`} L={L}>
        <Row k={L.calcPerCam} v={n1(r.kbpsPerCam, 0)} />
        <Row k={L.calcBwTotal} v={`${n1(r.totalKbps, 0)} Kbps (${n1(r.totalMbps, 1)} Mbps)`} />
        <Row k={L.calcPerDayAll} v={`${n1(r.gibPerDayAll, 1)} GB`} />
        <Row k={L.calcNeedVendor} v={`${n1(r.needTb, 2)} TB`} />
        <Row k={L.calcNeedRec} v={`${n1(r.needTbReserve, 2)} TB`} strong />
        {r.disks ? <Row k={L.calcDisksNeed} v={`${r.disks} × ${num(diskTb)} TB (${raidName})`} strong /> : <Row k={L.calcDisksNeed} v={L.calcNoDisks} />}
        {r.disks ? <Row k={L.calcUsable} v={`${n1(r.usableTb, 1)} TB`} /> : null}
        {r.haveDays != null && <Row k={L.calcHaveDays2} v={n1(r.haveDays, 1)} />}
        {r.haveDaysReserve != null && <Row k={L.calcHaveDays3} v={n1(r.haveDaysReserve, 1)} strong />}
        {nvr && <p style={{ margin: "10px 0 0", color: badText.length ? "#b91c1c" : "#15803d", fontWeight: 600 }}>{badText.length ? badText.map((t, i) => <span key={i} style={{ display: "block" }}>⚠ {t}</span>) : `✓ ${L.calcOk}`}</p>}
      </Report>
      <div style={{ marginTop: 12 }}><button type="button" onClick={pdf} disabled={busy}>{busy ? L.calcPdfBusy : L.calcPdf}</button></div>
    </div>
  );
}
