import { useCallback, useState } from "react";
import { Image } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { takeScan } from "@/lib/scan-store";
import { uploadTo, type Picked } from "@/lib/upload";
import { pickFiles } from "@/components/Files";
import { Btn, Card, Choice, Err, Field, H2, Row, Screen, Txt } from "@/components/ui";

type S = "done" | "broken" | "hardware_issue";
const MAX = 50 * 1024 * 1024;

export default function NewQc() {
  const { session, profile } = useAuth();
  const { t } = usePrefs();
  const { sn: sn0, ticket } = useLocalSearchParams<{ sn?: string; ticket?: string }>();
  const [sn, setSn] = useState((sn0 ?? "").toUpperCase());
  const [status, setStatus] = useState<S>("done");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useFocusEffect(useCallback(() => {
    const code = takeScan("qc-new");
    if (code) setSn(code.replace(/\s+/g, "").toUpperCase());
  }, []));

  async function save() {
    setErr("");
    const serial = sn.replace(/\s+/g, "").toUpperCase();
    if (serial.length < 4) { setErr(t("errInvalidSn")); return; }
    const big = files.find((f) => f.size && f.size > MAX);
    if (big) { setErr(t("errFileLarge", { name: big.name })); return; }
    if (!session || !profile) return;
    setBusy(true);
    const { data: id, error } = await sb.rpc("qc_record", { p_serial: serial, p_status: status, p_comment: comment.trim() || null, p_ticket: ticket ?? null });
    if (error || !id) { setErr(error?.message ?? t("error")); setBusy(false); return; }
    const failed: string[] = [];
    for (const f of files) {
      const up = await uploadTo("qc-media", `${profile.tenant_id}/${id}`, f);
      if (!up.key) { failed.push(f.name); continue; }
      const ins = await sb.from("qc_media").insert({ tenant_id: profile.tenant_id, qc_id: id, path: up.key, kind: f.mime.startsWith("video/") ? "video" : "image", mime: f.mime, size_bytes: f.size ?? null, uploaded_by: session.user.id });
      if (ins.error) failed.push(f.name);
    }
    setBusy(false);
    if (failed.length) { setErr(t("uploadFailed", { files: failed.join(", ") })); }
    router.replace(`/qc/${id}`);
  }

  return (
    <Screen>
      <Card>
        <H2>{t("serial")}</H2>
        <Field value={sn} onChangeText={(v) => setSn(v.toUpperCase())} placeholder={t("snPlaceholder")} autoCapitalize="characters" autoCorrect={false} />
        <Btn kind="ghost" title={`📷 ${t("scan")}`} onPress={() => router.push({ pathname: "/scan", params: { target: "qc-new" } })} />
      </Card>
      <Card>
        <H2>{t("qcStatus")}</H2>
        <Choice<S> value={status} onChange={setStatus} options={[{ value: "done", label: t("qcDone") }, { value: "broken", label: t("qcBroken") }, { value: "hardware_issue", label: t("qcHardware") }]} />
        <Field label={t("comment")} value={comment} onChangeText={setComment} multiline maxLength={2000} />
      </Card>
      <Card>
        <H2>{t("photosVideos")}</H2>
        <Row>{files.map((f, i) => f.mime.startsWith("video/") ? <Txt key={i} small>🎬 {f.name}</Txt> : <Image key={i} source={{ uri: f.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />)}</Row>
        <Row>
          <Btn kind="ghost" title={`📷 ${t("takePhoto")}`} onPress={async () => setFiles([...files, ...(await pickFiles(true, ["images"]))])} />
          <Btn kind="ghost" title={`🎬 ${t("addVideo")}`} onPress={async () => setFiles([...files, ...(await pickFiles(true, ["videos"]))])} />
        </Row>
        <Btn kind="ghost" title={t("addPhotos")} onPress={async () => setFiles([...files, ...(await pickFiles(false))])} />
      </Card>
      <Err>{err}</Err>
      <Btn title={busy ? t("saving") : t("saveQc")} onPress={save} busy={busy} />
    </Screen>
  );
}
