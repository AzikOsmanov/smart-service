import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { router, useLocalSearchParams } from "expo-router";
import { usePrefs } from "@/lib/prefs";
import { sb } from "@/lib/supabase";
import { putScan } from "@/lib/scan-store";
import { Btn, Card, Screen, Txt } from "@/components/ui";

type Cand = { code: string; linear: boolean };
const LINEAR = new Set(["code128", "code39", "code93", "ean13", "ean8", "upc_a", "upc_e", "itf14", "codabar", "interleaved2of5"]);
const SN_RE = /^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/;
// A MAC address printed as a barcode: 12 hex digits, optionally with : or - separators.
const isMac = (s: string) => /^[0-9A-F]{12}$/.test(s) || /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/.test(s);
const clean = (raw: string) => raw.trim().replace(/^(S\/?N|SERIAL( NO\.?| NUMBER)?)\s*[:#]?\s*/i, "").replace(/\s+/g, "").toUpperCase();

// A label often carries several codes (QR, MAC barcode, SN barcode, product codes). Collect what the camera sees for a moment,
// drop MAC addresses and codes that cannot be a serial number, then score what is left:
// a serial that already exists in the system (or looks like one: same length and start) wins, then barcodes over QR, then typical SN shapes.
// Only when two codes are still equally likely does the person get a short list to tap.
type Scored = Cand & { score: number };
async function rank(all: Map<string, Cand>): Promise<Scored[]> {
  const list = [...all.values()].filter((x) => SN_RE.test(x.code));
  const noMac = list.filter((x) => !isMac(x.code));
  const base = noMac.length ? noMac : list;
  let hints = new Map<string, { exact: boolean; shape: boolean }>();
  try {
    const { data } = await sb.rpc("match_serials", { p_codes: base.map((x) => x.code) });
    for (const r of (data ?? []) as { code: string; exact: boolean; shape: boolean }[]) hints.set(r.code, r);
  } catch { /* offline: use the shape rules only */ }
  return base.map((x) => {
    const h = hints.get(x.code);
    const digitsOnly = /^\d+$/.test(x.code);
    const mixed = /[A-Z]/.test(x.code) && /\d/.test(x.code);
    const alnum = /^[A-Z0-9]+$/.test(x.code);          // a serial number is letters + digits only; model names carry hyphens (UAC-B112-AF28-W)
    const score = (h?.exact ? 1000 : 0) + (h?.shape ? 500 : 0) + (x.linear ? 100 : 0)
      + (alnum && mixed ? 60 : 0) + (alnum && x.code.length >= 12 ? 30 : 0) + (x.code.length >= 10 && x.code.length <= 24 ? 20 : 0)
      - (/[-_/.]/.test(x.code) ? 80 : 0) - (digitsOnly && x.code.length <= 13 ? 60 : 0) - (x.code.length < 8 ? 40 : 0) + x.code.length * 0.1;
    return { ...x, score };
  }).sort((p, q) => q.score - p.score);
}

// Printed "SN: ABC123..." text (no barcode on the device, or the only QR is the cloud-bind code of a Wi-Fi camera).
// Take a photo, read the text on the phone (ML Kit), and keep what follows the SN / S/N / Serial label.
const LABEL = /(?:\bS\s*\/\s*N\b|\bSN\b|\bSERIAL\s*(?:NO\.?|NUMBER|NUM\.?)?)\s*[:#.\-]?\s*(.*)$/i;
const tokenOf = (rest: string) => {
  const m = rest.toUpperCase().replace(/[^A-Z0-9\-\s]/g, " ").trim().split(/\s+/)[0] ?? "";
  const t = m.replace(/-/g, "");
  return /\d/.test(t) && t.length >= 6 && t.length <= 32 && !isMac(t) ? t : "";
};
function parsePrinted(lines: string[]): Cand[] {
  const out = new Map<string, Cand>();
  lines.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean).forEach((ln, i, arr) => {
    const m = ln.match(LABEL);
    if (!m) return;
    const t = tokenOf(m[1]) || (m[1].trim() === "" ? tokenOf(arr[i + 1] ?? "") : "");   // label alone on its line: value is on the next line
    if (t) out.set(t, { code: t, linear: true });
  });
  return [...out.values()];
}

export default function Scan() {
  const { t, c } = usePrefs();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const [perm, request] = useCameraPermissions();
  const seen = useRef(new Map<string, Cand>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const cam = useRef<CameraView>(null);
  const [reading, setReading] = useState(false);
  const [choices, setChoices] = useState<Cand[] | null>(null);
  const [hint, setHint] = useState("");

  const finish = (code: string) => { if (done.current) return; done.current = true; putScan(String(target ?? "sn"), code); router.back(); };

  const evaluate = async () => {
    timer.current = null;
    const res = await rank(seen.current);
    if (done.current || res.length === 0) return;
    if (res.length === 1 || res[0].score - res[1].score >= 20) finish(res[0].code);
    else setChoices(res.filter((x) => res[0].score - x.score < 20).slice(0, 4));
  };

  const readText = async () => {
    if (done.current || reading || !cam.current) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    seen.current.clear(); setChoices(null); setReading(true); setHint(t("scanTextBusy"));
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      const res = await TextRecognition.recognize(pic.uri);
      const lines = (res.blocks ?? []).flatMap((b) => (b.lines ?? []).map((l) => l.text));
      const found = parsePrinted(lines.length ? lines : String(res.text ?? "").split("\n"));
      if (found.length === 0) { setHint(t("scanTextNone")); return; }
      if (found.length === 1) { finish(found[0].code); return; }
      const ranked = await rank(new Map(found.map((x) => [x.code, x])));
      setChoices(ranked.slice(0, 4));
    } catch { setHint(t("scanTextNone")); }
    finally { setReading(false); }
  };

  if (!perm) return <Screen><Txt muted>…</Txt></Screen>;
  if (!perm.granted) {
    return (
      <Screen>
        <Card><Txt>{t("cameraPermission")}</Txt><Btn title={t("grant")} onPress={request} /></Card>
        <Btn kind="ghost" title={t("cancel")} onPress={() => router.back()} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={cam} style={{ flex: 1 }} facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "code93", "ean13", "ean8", "upc_a", "upc_e", "datamatrix", "pdf417", "itf14", "codabar", "aztec"] }}
        onBarcodeScanned={(r) => {
          if (done.current || choices || reading) return;
          const code = clean(String(r.data ?? ""));
          if (!code) return;
          const type = String((r as any).type ?? "").toLowerCase();
          seen.current.set(code, { code, linear: LINEAR.has(type) });
          setHint(code);
          // Wait briefly so every code on the label is seen before deciding; a 2D code alone waits a little longer.
          const onlyTwoD = ![...seen.current.values()].some((x) => x.linear);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(evaluate, onlyTwoD ? 1500 : 700);
        }} />
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 32, gap: 10 }}>
        <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 12, gap: 8 }}>
          {choices ? (
            <>
              <Txt bold>{t("scanPick")}</Txt>
              {choices.map((x) => (
                <Pressable key={x.code} onPress={() => finish(x.code)}><Txt color={c.accent} bold>{x.code}</Txt></Pressable>
              ))}
            </>
          ) : <Txt>{hint || t("scanHint")}</Txt>}
        </View>
        {!choices && <Btn kind="ghost" title={reading ? t("scanTextBusy") : t("scanText")} onPress={readText} />}
        {choices ? <Btn kind="ghost" title={t("scan")} onPress={() => { seen.current.clear(); setChoices(null); setHint(""); }} /> : null}
        <Btn kind="primary" title={t("cancel")} onPress={() => router.back()} />
      </View>
    </View>
  );
}
