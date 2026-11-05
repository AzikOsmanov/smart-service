import { useRef, useState } from "react";
import { View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { usePrefs } from "@/lib/prefs";
import { putScan } from "@/lib/scan-store";
import { Btn, Card, Screen, Txt } from "@/components/ui";

// Scans a barcode / QR code on the device label and hands the text back to the screen that opened the scanner.
export default function Scan() {
  const { t, c } = usePrefs();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const [perm, request] = useCameraPermissions();
  const done = useRef(false);
  const [seen, setSeen] = useState("");

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
          const code = String(r.data ?? "").trim();
          if (!code || done.current) return;
          done.current = true; setSeen(code);
          putScan(String(target ?? "sn"), code);
          router.back();
        }} />
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 32, gap: 10 }}>
        <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 12 }}><Txt>{seen || t("scanHint")}</Txt></View>
        <Btn kind="primary" title={t("cancel")} onPress={() => router.back()} />
      </View>
    </View>
  );
}
