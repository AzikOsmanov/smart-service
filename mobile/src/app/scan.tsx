import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
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
    const score = (h?.exact ? 1000 : 0) + (h?.shape ? 500 : 0) + (x.linear ? 100 : 0) + (x.code.length >= 10 && x.code.length <= 24 ? 20 : 0) + (mixed ? 10 : 0) - (digitsOnly && x.code.length <= 13 ? 60 : 0) - (x.code.length < 8 ? 40 : 0) + x.code.length * 0.1;
    return { ...x, score };
  }).sort((p, q) => q.score - p.score);
}

export default function Scan() {
  const { t, c } = usePrefs();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const [perm, request] = useCameraPermissions();
  const seen = useRef(new Map<string, Cand>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
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
      <CameraView style={{ flex: 1 }} facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "code93", "ean13", "ean8", "upc_a", "upc_e", "datamatrix", "pdf417", "itf14", "codabar", "aztec"] }}
        onBarcodeScanned={(r) => {
          if (done.current || choices) return;
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
        {choices ? <Btn kind="ghost" title={t("scan")} onPress={() => { seen.current.clear(); setChoices(null); setHint(""); }} /> : null}
        <Btn kind="primary" title={t("cancel")} onPress={() => router.back()} />
      </View>
    </View>
  );
}
