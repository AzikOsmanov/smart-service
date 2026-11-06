import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { usePrefs } from "@/lib/prefs";
import { TEXTS } from "@/lib/i18n";
import { BRANDS, NVRS, RESOLUTIONS, SMART_NAME, UNV_RES, diskCalc, upsCalc, type Brand, type Codec, type Raid } from "@/lib/calc";
import { sharePdf, type Rep } from "@/lib/calcpdf";
import { Btn, Card, Choice, Field, H2, Screen, Txt } from "@/components/ui";

const num = (v: string, d = 0) => { const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : d; };
const n1 = (n: number, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
type L = Record<string, string>;
const dur = (min: number, L: L) => {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 120) return `${Math.round(min)} ${L.calcMin}`;
  const h = Math.floor(min / 60), m = Math.round(min - h * 60);
  return `${h} ${L.calcHours}${m ? ` ${m} ${L.calcMin}` : ""}`;
};
const stamp = () => new Date().toLocaleString("en-GB", { timeZone: "Asia/Baku", dateStyle: "medium", timeStyle: "short" });

// A dropdown: a button that opens a list.
function Pick({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const { c } = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: c.bg, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 }}>
        <Text style={{ color: c.fg, fontSize: 15 }}>{options.find((o) => o.value === value)?.label ?? value}  ▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 12, maxHeight: "75%", padding: 8 }}>
            <ScrollView>
              {options.map((o) => (
                <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} style={{ padding: 12, borderRadius: 8, backgroundColor: o.value === value ? c.chipBg : "transparent" }}>
                  <Text style={{ color: c.fg, fontWeight: o.value === value ? "700" : "400" }}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ResultModal({ rep, onClose, L }: { rep: Rep | null; onClose: () => void; L: L }) {
  const { c } = usePrefs();
  const [busy, setBusy] = useState(false);
  if (!rep) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "90%", padding: 16, gap: 10 }}>
          <ScrollView contentContainerStyle={{ gap: 6 }}>
            <H2>{rep.title}</H2>
            <Txt muted small>{`${rep.brand} · ${rep.labels.date}: ${rep.date}`}</Txt>
            <Txt bold>{rep.labels.results}</Txt>
            {rep.rows.map(([k, v, s], i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text style={{ color: c.fg, flex: 1, fontWeight: s ? "700" : "400" }}>{k}</Text>
                <Text style={{ color: c.fg, fontWeight: s ? "700" : "400", textAlign: "right" }}>{v}</Text>
              </View>
            ))}
            {rep.msgs.map((m, i) => <Text key={i} style={{ color: m.bad ? c.danger : c.ok, fontWeight: "600" }}>{m.text}</Text>)}
            <Txt muted small>{rep.note}</Txt>
          </ScrollView>
          <Btn title={busy ? L.calcPdfBusy : L.calcPdf} busy={busy} onPress={async () => { setBusy(true); try { await sharePdf(rep); } finally { setBusy(false); } }} />
          <Btn kind="ghost" title={L.calcClose} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export default function Calculator() {
  const { lang } = usePrefs();
  const L = useMemo<L>(() => Object.fromEntries(Object.entries(TEXTS[lang]).filter(([k]) => k.startsWith("calc"))), [lang]);
  const [tab, setTab] = useState<"disk" | "ups">("disk");
  const [rep, setRep] = useState<Rep | null>(null);
  return (
    <Screen>
      <Choice value={tab} onChange={setTab} options={[{ value: "disk", label: L.calcDisk }, { value: "ups", label: L.calcUps }]} />
      {tab === "disk" ? <Disk L={L} show={setRep} /> : <Ups L={L} show={setRep} />}
      <ResultModal rep={rep} onClose={() => setRep(null)} L={L} />
    </Screen>
  );
}

function Disk({ L, show }: { L: L; show: (r: Rep) => void }) {
  const [brand, setBrand] = useState<Brand>("dahua");
  const [cameras, setCameras] = useState("8");
  const [res, setRes] = useState("d4");
  const [ucode, setUcode] = useState<"off" | "adv">("adv");
  const [cx, setCx] = useState<"low" | "med" | "high">("high");
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

  const models = NVRS.filter((x) => x.brand === brand);
  const resList = brand === "unv" ? UNV_RES : RESOLUTIONS;
  const cxName = (v: string) => (v === "low" ? L.calcCxLow : v === "high" ? L.calcCxHigh : L.calcCxMed);

  function calc() {
    let nvr: { channels: number; bays: number; maxTb: number; mbps: number; raid: boolean } | null = null;
    if (nvrId === "custom") nvr = { channels: num(cust.channels), bays: num(cust.bays), maxTb: num(cust.maxTb), mbps: num(cust.mbps), raid: true };
    else { const m = NVRS.find((x) => x.id === nvrId); if (m) nvr = { channels: m.channels, bays: m.bays, maxTb: m.maxTb, mbps: m.mbps, raid: m.raid }; }
    const r = diskCalc({ brand, cameras: num(cameras), res, codec, ucode, cx, fps: num(fps, 25) || 25, bitrate: bitrate ? num(bitrate) : null, mode, motionPct: num(motion), days: num(days), raid, diskTb: num(diskTb), haveDisks: have ? num(have) : null, nvr });
    const raidName = raid === "none" ? L.calcRaidNone : `RAID ${raid}`;
    const codecName = codec === "h264" ? "H.264" : codec === "h265" ? "H.265" : SMART_NAME[brand];
    const modelName = nvrId === "custom" ? L.calcNvrCustom : NVRS.find((x) => x.id === nvrId)?.model ?? L.calcNvrAny;
    const showCx = (brand === "unv" && ucode !== "off") || (brand === "dahua" && codec === "smart");
    const inputs: [string, string][] = [
      [L.calcBrand, BRANDS.find((b) => b.id === brand)!.name], [L.calcCameras, String(num(cameras))], [L.calcRes, resList.find((x) => x.id === res)?.label ?? res], [L.calcCodec, codecName],
      ...(brand === "unv" ? [[L.calcUcode, ucode === "adv" ? L.calcUcodeAdv : L.calcUcodeOff] as [string, string]] : []),
      ...(showCx ? [[L.calcComplexity, cxName(cx)] as [string, string]] : []),
      ...(brand === "unv" ? [] : [[L.calcFps, String(num(fps, 25))] as [string, string]]), ...(bitrate ? [[L.calcBitrate, `${bitrate} Kbps`] as [string, string]] : []),
      [L.calcMode, mode === "cont" ? L.calcModeCont : `${L.calcModeMotion} (${num(motion)}%)`], [L.calcDays, String(num(days))],
      [L.calcRaid, raidName], [L.calcDiskSize, String(num(diskTb))], [L.calcNvr, modelName],
      ...(nvr ? [[`${L.calcNvrChannels} / ${L.calcNvrBays} / ${L.calcNvrMaxTb} / ${L.calcNvrBw}`, `${nvr.channels} / ${nvr.bays} / ${nvr.maxTb} / ${nvr.mbps}`] as [string, string]] : []),
      ...(have ? [[L.calcHave, String(num(have))] as [string, string]] : []),
    ];
    const rows: [string, string, boolean?][] = [
      [L.calcPerCam, n1(r.kbpsPerCam, 0)], [L.calcBwTotal, `${n1(r.totalKbps, 0)} Kbps (${n1(r.totalMbps, 1)} Mbps)`], [L.calcPerDayAll, `${n1(r.gibPerDayAll, 1)} GB`],
      [L.calcNeedVendor, `${n1(r.needTb, 2)} TB`], [L.calcNeedRec, `${n1(r.needTbReserve, 2)} TB`, true],
      [L.calcDisksNeed, r.disks ? `${r.disks} × ${num(diskTb)} TB (${raidName})` : L.calcNoDisks, !!r.disks],
      ...(r.disks ? [[L.calcUsable, `${n1(r.usableTb, 1)} TB`] as [string, string]] : []),
      ...(r.haveDays != null ? [[L.calcHaveDays2, n1(r.haveDays, 1)] as [string, string]] : []),
      ...(r.haveDaysReserve != null ? [[L.calcHaveDays3, n1(r.haveDaysReserve, 1), true] as [string, string, boolean]] : []),
    ];
    const bad = r.checks.map((c) => fill(L[({ channels: "calcBadChannels", bays: "calcBadBays", disk: "calcBadDisk", bw: "calcBadBw", raid: "calcBadRaid" } as const)[c.kind]], { a: c.a, b: c.b }));
    const msgs = nvr ? (bad.length ? bad.map((t) => ({ text: `⚠ ${t}`, bad: true })) : [{ text: `✓ ${L.calcOk}`, bad: false }]) : [];
    show({ title: L.calcDisk, brand: BRANDS.find((b) => b.id === brand)!.name, date: stamp(), inputs, rows, msgs, labels: { inputs: L.calcInputs, results: L.calcResults, date: L.calcDate },
      note: `${L.calcEstimate} ${L.calcUnitsNote} ${brand === "unv" ? L.calcUnvNote : L.calcDahuaNote}${r.estimated ? ` (${L.calcEstimated})` : ""}` });
  }

  const codecs = [{ value: "h264", label: "H.264" }, { value: "h265", label: "H.265" }, ...(brand === "dahua" ? [{ value: "smart", label: SMART_NAME[brand] }] : [])];
  return (
    <Card>
      <Pick label={L.calcBrand} value={brand} options={BRANDS.map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => { const b = v as Brand; setBrand(b); setNvrId("any"); setRes(b === "unv" ? "4mp" : "d4"); if (b === "unv" && codec === "smart") setCodec("h265"); setCx(b === "unv" ? "med" : "high"); }} />
      <Field label={L.calcCameras} keyboardType="numeric" value={cameras} onChangeText={setCameras} />
      <Pick label={L.calcRes} value={res} options={resList.map((x) => ({ value: x.id, label: x.label }))} onChange={setRes} />
      <Pick label={L.calcCodec} value={codec} options={codecs} onChange={(v) => setCodec(v as Codec)} />
      {brand === "unv" && <Pick label={L.calcUcode} value={ucode} options={[{ value: "adv", label: L.calcUcodeAdv }, { value: "off", label: L.calcUcodeOff }]} onChange={(v) => setUcode(v as "off" | "adv")} />}
      {((brand === "unv" && ucode !== "off") || (brand === "dahua" && codec === "smart")) && <Pick label={L.calcComplexity} value={cx} options={[{ value: "low", label: L.calcCxLow }, { value: "med", label: L.calcCxMed }, { value: "high", label: L.calcCxHigh }]} onChange={(v) => setCx(v as "low" | "med" | "high")} />}
      {brand !== "unv" && <Field label={L.calcFps} keyboardType="numeric" value={fps} onChangeText={setFps} />}
      <Field label={L.calcBitrate} keyboardType="numeric" value={bitrate} onChangeText={setBitrate} />
      <Pick label={L.calcMode} value={mode} options={[{ value: "cont", label: L.calcModeCont }, { value: "motion", label: L.calcModeMotion }]} onChange={(v) => setMode(v as "cont" | "motion")} />
      {mode === "motion" && <Field label={L.calcMotionPct} keyboardType="numeric" value={motion} onChangeText={setMotion} />}
      <Field label={L.calcDays} keyboardType="numeric" value={days} onChangeText={setDays} />
      <Pick label={L.calcDiskSize} value={diskTb} options={[1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((x) => ({ value: String(x), label: `${x} TB` }))} onChange={setDiskTb} />
      <Pick label={L.calcRaid} value={raid} options={[{ value: "none", label: L.calcRaidNone }, ...["1", "5", "6", "10"].map((x) => ({ value: x, label: `RAID ${x}` }))]} onChange={(v) => setRaid(v as Raid)} />
      <Field label={L.calcHave} keyboardType="numeric" value={have} onChangeText={setHave} />
      <Pick label={L.calcNvr} value={nvrId} options={[{ value: "any", label: L.calcNvrAny }, ...models.map((m) => ({ value: m.id, label: m.model })), { value: "custom", label: L.calcNvrCustom }]} onChange={setNvrId} />
      {nvrId === "custom" && <>
        <Field label={L.calcNvrChannels} keyboardType="numeric" value={cust.channels} onChangeText={(v) => setCust({ ...cust, channels: v })} />
        <Field label={L.calcNvrBays} keyboardType="numeric" value={cust.bays} onChangeText={(v) => setCust({ ...cust, bays: v })} />
        <Field label={L.calcNvrMaxTb} keyboardType="numeric" value={cust.maxTb} onChangeText={(v) => setCust({ ...cust, maxTb: v })} />
        <Field label={L.calcNvrBw} keyboardType="numeric" value={cust.mbps} onChangeText={(v) => setCust({ ...cust, mbps: v })} />
      </>}
      {nvrId !== "any" && nvrId !== "custom" && <Txt muted small>{L.calcNvrNote}</Txt>}
      <Btn title={L.calcOpen} onPress={calc} />
    </Card>
  );
}

function Ups({ L, show }: { L: L; show: (r: Rep) => void }) {
  const [load, setLoad] = useState("60");
  const [volts, setVolts] = useState("24");
  const [ah, setAh] = useState("9");
  const [strings, setStrings] = useState("1");
  const [eff, setEff] = useState("85");
  const [dod, setDod] = useState("80");
  const [cond, setCond] = useState("100");
  const [upsW, setUpsW] = useState("");
  const [target, setTarget] = useState("");
  function calc() {
    const r = upsCalc({ loadW: num(load), volts: num(volts), ah: num(ah), strings: num(strings, 1), effPct: num(eff, 85), dodPct: num(dod, 80), condPct: num(cond, 100), upsW: upsW ? num(upsW) : null, targetMin: target ? num(target) : null });
    const condName = cond === "100" ? L.calcCondNew : cond === "85" ? L.calcCondMid : L.calcCondOld;
    const inputs: [string, string][] = [
      [L.calcLoad, `${num(load)} W`], [L.calcVolts, `${num(volts)} V`], [L.calcAh, `${num(ah)} Ah`], [L.calcStrings, String(num(strings, 1))],
      [L.calcEff, `${num(eff, 85)}%`], [L.calcDod, `${num(dod, 80)}%`], [L.calcCond, condName],
      ...(upsW ? [[L.calcUpsW, `${num(upsW)} W`] as [string, string]] : []), ...(target ? [[L.calcTarget, `${num(target)}`] as [string, string]] : []),
    ];
    const rows: [string, string, boolean?][] = [
      [L.calcStored, `${n1(r.storedWh, 0)} Wh`], [L.calcUsableE, `${n1(r.usableWh, 0)} Wh`], [L.calcRuntime, dur(r.runtimeMin, L), true],
      ...r.byLoad.map((b) => [fill(L.calcRuntimeAt, { p: b.pct, w: n1(b.watts, 0) }), dur(b.min, L)] as [string, string]),
      [L.calcRecUps, `${n1(r.recommendedW, 0)} W`],
      ...(r.needAh != null ? [[L.calcNeedAh, `${n1(r.needAh, 1)} Ah`, true] as [string, string, boolean]] : []),
    ];
    show({ title: L.calcUps, brand: "UPS", date: stamp(), inputs, rows, msgs: r.overload ? [{ text: `⚠ ${L.calcOverload}`, bad: true }] : [], labels: { inputs: L.calcInputs, results: L.calcResults, date: L.calcDate }, note: L.calcEstimate });
  }
  return (
    <Card>
      <Field label={L.calcLoad} keyboardType="numeric" value={load} onChangeText={setLoad} />
      <Pick label={L.calcVolts} value={volts} options={[12, 24, 36, 48, 72, 96, 192, 240].map((x) => ({ value: String(x), label: `${x} V` }))} onChange={setVolts} />
      <Field label={L.calcAh} keyboardType="numeric" value={ah} onChangeText={setAh} />
      <Field label={L.calcStrings} keyboardType="numeric" value={strings} onChangeText={setStrings} />
      <Field label={L.calcEff} keyboardType="numeric" value={eff} onChangeText={setEff} />
      <Field label={L.calcDod} keyboardType="numeric" value={dod} onChangeText={setDod} />
      <Pick label={L.calcCond} value={cond} options={[{ value: "100", label: L.calcCondNew }, { value: "85", label: L.calcCondMid }, { value: "70", label: L.calcCondOld }]} onChange={setCond} />
      <Field label={L.calcUpsW} keyboardType="numeric" value={upsW} onChangeText={setUpsW} />
      <Field label={L.calcTarget} keyboardType="numeric" value={target} onChangeText={setTarget} />
      <Btn title={L.calcOpen} onPress={calc} />
    </Card>
  );
}
