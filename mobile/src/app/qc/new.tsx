import { useCallback, useState } from "react";
import { Image } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { takeScan } from "@/lib/scan-store";
import { snFileName, uploadTo, type Picked } from "@/lib/upload";
import { pickFilesChecked } from "@/components/Files";
import { Btn, Card, Choice, Err, Field, H2, Row, Screen, Txt } from "@/components/ui";
import { Pressable } from "react-native";

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

  async function add(camera: boolean, kinds: ("images" | "videos")[]) {
    setErr("");
    const r = await pickFilesChecked(camera, kinds, 60);   // 60 s of video keeps the file under the 50 MB limit
    if (r.denied) { setErr(t("cameraPermission")); return; }
    setFiles((cur) => [...cur, ...r.files]);
  }

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
    for (const [i, orig] of files.entries()) {
      const f = { ...orig, name: snFileName(serial, orig, i, files.length) };
      const up = await uploadTo("qc-media", `${profile.tenant_id}/${id}`, f);
      if (!up.key) { failed.push(f.name); continue; }
      const ins = await sb.from("qc_media").insert({ tenant_id: profile.tenant_id, qc_id: id, path: up.key, file_name: f.name.slice(0, 200), kind: f.mime.startsWith("video/") ? "video" : "image", mime: f.mime, size_bytes: f.size ?? null, uploaded_by: session.user.id });
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
        {files.map((f, i) => (
          <Row key={i}>
            {f.mime.startsWith("video/") ? <Txt small>🎬 {f.name}{f.size ? ` · ${(f.size / 1048576).toFixed(1)} MB` : ""}</Txt> : <Image source={{ uri: f.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />}
            <Pressable onPress={() => setFiles(files.filter((_, j) => j !== i))} hitSlop={10}><Txt color="#ef4444">✕</Txt></Pressable>
          </Row>
        ))}
        <Row>
          <Btn kind="ghost" title={`📷 ${t("takePhoto")}`} onPress={() => add(true, ["images"])} />
          <Btn kind="ghost" title={`🎬 ${t("addVideo")}`} onPress={() => add(true, ["videos"])} />
        </Row>
        <Btn kind="ghost" title={t("addPhotos")} onPress={() => add(false, ["images", "videos"])} />
      </Card>
      <Err>{err}</Err>
      <Btn title={busy ? t("saving") : t("saveQc")} onPress={save} busy={busy} />
    </Screen>
  );
}
