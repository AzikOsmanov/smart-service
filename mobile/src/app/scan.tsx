import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { usePrefs } from "@/lib/prefs";
import { putScan } from "@/lib/scan-store";
import { Btn, Card, Screen, Txt } from "@/components/ui";

type Cand = { code: string; linear: boolean };
const LINEAR = new Set(["code128", "code39", "code93", "ean13", "ean8", "upc_a", "upc_e", "itf14", "codabar", "interleaved2of5"]);
const SN_RE = /^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/;
// A MAC address printed as a barcode: 12 hex digits, optionally with : or - separators.
const isMac = (s: string) => /^[0-9A-F]{12}$/.test(s) || /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/.test(s);
const clean = (raw: string) => raw.trim().replace(/^(S\/?N|SERIAL( NO\.?| NUMBER)?)\s*[:#]?\s*/i, "").replace(/\s+/g, "").toUpperCase();

// A label often carries several codes (QR, MAC barcode, SN barcode). Collect what the camera sees for a moment,
// drop QR/2D codes and MAC addresses, and hand back only the serial number. If it is still unclear, the user taps the right one.
function pick(all: Map<string, Cand>): Cand[] {
  const list = [...all.values()].filter((x) => SN_RE.test(x.code));
  const noMac = list.filter((x) => !isMac(x.code));
  const base = noMac.length ? noMac : list;
  const lin = base.filter((x) => x.linear);
  return lin.length ? lin : base;
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

  const evaluate = () => {
    timer.current = null;
    const res = pick(seen.current);
    if (res.length === 1) finish(res[0].code);
    else if (res.length > 1) { setChoices(res); }
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
