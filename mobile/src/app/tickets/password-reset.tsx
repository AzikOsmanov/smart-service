import { useCallback, useState } from "react";
import { Image, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { takeScan } from "@/lib/scan-store";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { uploadTicketFiles, uploadTo, type Picked } from "@/lib/upload";
import { pickFiles } from "@/components/Files";
import { Btn, Card, Err, Field, H2, Row, Screen, Txt } from "@/components/ui";

type Method = "send_code" | "bring_device";
const LABEL_MAX = 4 * 1024 * 1024;

export default function PasswordReset() {
  const { session, profile } = useAuth();
  const { t, c } = usePrefs();
  const [sn, setSn] = useState("");
  const [method, setMethod] = useState<Method>("send_code");
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [needReg, setNeedReg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useFocusEffect(useCallback(() => {
    const code = takeScan("pr-sn");
    if (code) { setSn(code.replace(/\s+/g, "").toUpperCase()); setNeedReg(false); }
  }, []));
  if (!session || !profile) return <Screen><Txt muted>…</Txt></Screen>;

  async function submit(register: boolean) {
    setErr("");
    const serial = sn.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/.test(serial)) { setErr(t("errInvalidSn")); return; }
    if (!photo) { setErr(t("prPhotoRequired")); return; }
    if (photo.size && photo.size > LABEL_MAX) { setErr(t("errFileLarge", { name: photo.name })); return; }
    setBusy(true);
    const { data: reg } = await sb.rpc("is_serial_registered", { p_serial: serial });
    if (reg !== true) {
      if (!register) { setNeedReg(true); setErr(t("prNotRegistered")); setBusy(false); return; }
      const ins = await sb.from("devices").insert({ tenant_id: profile!.tenant_id, serial_number: serial, owner_id: session!.user.id, added_by: session!.user.id, company_id: profile!.company_id });
      if (ins.error) { setErr(ins.error.message); setBusy(false); return; }
    }
    const up = await uploadTo("device-labels", `${profile!.tenant_id}/${session!.user.id}`, photo);
    if (!up.key) { setErr(up.error ?? t("error")); setBusy(false); return; }
    const { data: tid, error } = await sb.rpc("request_password_reset", { p_serial: serial, p_label_photo_key: up.key, p_method: method, p_note: note.trim() || null });
    if (error || !tid) { setErr(error?.message ?? t("error")); setBusy(false); return; }
    const failed = files.length ? await uploadTicketFiles(profile!.tenant_id, tid as string, session!.user.id, files) : [];
    setBusy(false);
    if (failed.length) setErr(t("uploadFailed", { files: failed.join(", ") }));
    router.replace(`/tickets/${tid}`);
  }

  const radio = (v: Method, text: string) => (
    <Pressable onPress={() => setMethod(v)}><Txt color={method === v ? c.accent : c.fg} bold={method === v}>{method === v ? "◉" : "○"} {text}</Txt></Pressable>
  );

  return (
    <Screen>
      <Card>
        <H2>{t("prTitle")}</H2>
        <Txt muted>{t("prIntro")}</Txt>
        <Field value={sn} onChangeText={(v) => { setSn(v.toUpperCase()); setNeedReg(false); }} placeholder={t("snPlaceholder")} autoCapitalize="characters" autoCorrect={false} />
        <Btn kind="ghost" title={`📷 ${t("scan")}`} onPress={() => router.push({ pathname: "/scan", params: { target: "pr-sn" } })} />
      </Card>
      <Card>
        <Txt bold>{t("prMethod")}</Txt>
        {radio("send_code", t("prMethodCode"))}
        {radio("bring_device", t("prMethodBring"))}
      </Card>
      <Card>
        <Txt bold>{t("prLabelPhoto")}</Txt>
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: 160, height: 120, borderRadius: 8 }} /> : null}
        <Row>
          <Btn kind="ghost" title={`📷 ${t("takePhoto")}`} onPress={async () => { const p = await pickFiles(true, ["images"]); if (p[0]) setPhoto(p[0]); }} />
          <Btn kind="ghost" title={t("addPhotos")} onPress={async () => { const p = await pickFiles(false, ["images"]); if (p[0]) setPhoto(p[0]); }} />
        </Row>
        <Field label={t("prNote")} value={note} onChangeText={setNote} multiline maxLength={2000} />
        <Row>{files.map((f, i) => <Image key={i} source={{ uri: f.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />)}</Row>
        <Btn kind="ghost" title={t("files")} onPress={async () => setFiles([...files, ...(await pickFiles(false))])} />
      </Card>
      <Err>{err}</Err>
      {needReg && <Btn kind="ghost" title={t("prRegisterNow")} onPress={() => submit(true)} busy={busy} />}
      <Btn title={busy ? t("sending") : t("prSubmit")} onPress={() => submit(false)} busy={busy} />
    </Screen>
  );
}
