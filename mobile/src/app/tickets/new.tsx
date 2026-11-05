import { useCallback, useEffect, useState } from "react";
import { Image, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { takeScan } from "@/lib/scan-store";
import { uploadTicketFiles, uploadTo, type Picked } from "@/lib/upload";
import { pickFiles } from "@/components/Files";
import { Btn, Card, Err, Field, H2, Row, Screen, Txt } from "@/components/ui";

type Dev = { id: string; serial_number: string; model: string | null };
const NEW = "__new__";

export default function NewTicket() {
  const { session, profile } = useAuth();
  const { t, c } = usePrefs();
  const [devices, setDevices] = useState<Dev[]>([]);
  const [choice, setChoice] = useState<string>(NEW);
  const [sn, setSn] = useState("");
  const [needLabel, setNeedLabel] = useState(false);
  const [label, setLabel] = useState<Picked | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!session) return;
    sb.from("devices").select("id,serial_number,device_models(name)").eq("owner_id", session.user.id).is("deleted_at", null).order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []).map((d: any) => ({ id: d.id, serial_number: d.serial_number, model: d.device_models?.name ?? null }));
        setDevices(list);
        if (list[0]) setChoice(list[0].id);
      });
  }, [session]);

  useFocusEffect(useCallback(() => {
    const code = takeScan("new-sn");
    if (code) { setSn(code.replace(/\s+/g, "").toUpperCase()); setChoice(NEW); }
  }, []));

  if (!session || !profile) return <Screen><Txt muted>…</Txt></Screen>;
  const uid = session.user.id;

  async function resolveDevice(): Promise<string | null> {
    if (choice !== NEW) return choice;
    const serial = sn.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/.test(serial)) { setErr(t("errInvalidSn")); return null; }
    const ins = await sb.from("devices").insert({ tenant_id: profile!.tenant_id, serial_number: serial, owner_id: uid, added_by: uid, company_id: profile!.company_id }).select("id").single();
    if (!ins.error && ins.data) return ins.data.id;
    if (ins.error?.code !== "23505") { setErr(ins.error?.message ?? t("error")); return null; }
    // Already registered by someone else: ownership request with a photo of the label.
    if (!label) { setNeedLabel(true); setErr(t("errAlreadyReg")); return null; }
    const up = await uploadTo("device-labels", `${profile!.tenant_id}/${uid}`, label);
    if (!up.key) { setErr(up.error ?? t("error")); return null; }
    const { data: result, error } = await sb.rpc("submit_device_claim", { p_serial: serial, p_label_photo_key: up.key });
    if (error) { setErr(error.message === "already_yours" ? t("errAlreadyYours") : error.message); return null; }
    if (result === "approved") {
      const { data: d } = await sb.from("devices").select("id").eq("serial_number", serial).eq("owner_id", uid).is("deleted_at", null).maybeSingle();
      if (d) return d.id;
    }
    setInfo(t("claimSent", { sn: serial }));
    return null;
  }

  async function submit() {
    setErr(""); setInfo("");
    if (subject.trim().length < 3 || !description.trim()) { setErr(t("errFill")); return; }
    setBusy(true);
    const deviceId = await resolveDevice();
    if (!deviceId) { setBusy(false); return; }
    const { data, error } = await sb.from("tickets").insert({
      tenant_id: profile!.tenant_id, customer_id: uid, company_id: profile!.company_id, device_id: deviceId,
      subject: subject.trim().slice(0, 160), description: description.trim().slice(0, 4000), status: "new",
    }).select("id").single();
    if (error || !data) { setErr(error?.message ?? t("error")); setBusy(false); return; }
    const failed = files.length ? await uploadTicketFiles(profile!.tenant_id, data.id, uid, files) : [];
    setBusy(false);
    if (failed.length) setErr(t("uploadFailed", { files: failed.join(", ") }));
    router.replace(`/tickets/${data.id}`);
  }

  return (
    <Screen>
      <Card>
        <H2>{t("device")}</H2>
        {devices.map((d) => (
          <Pressable key={d.id} onPress={() => setChoice(d.id)}>
            <Txt color={choice === d.id ? c.accent : c.fg} bold={choice === d.id}>{choice === d.id ? "◉" : "○"} {d.serial_number}{d.model ? ` — ${d.model}` : ""}</Txt>
          </Pressable>
        ))}
        <Pressable onPress={() => setChoice(NEW)}>
          <Txt color={choice === NEW ? c.accent : c.fg} bold={choice === NEW}>{choice === NEW ? "◉" : "○"} {devices.length ? t("anotherDevice") : t("addFirstDevice")}</Txt>
        </Pressable>
        {choice === NEW && (
          <>
            <Field value={sn} onChangeText={(v) => setSn(v.toUpperCase())} placeholder={t("snPlaceholder")} autoCapitalize="characters" autoCorrect={false} />
            <Btn kind="ghost" title={`📷 ${t("scan")}`} onPress={() => router.push({ pathname: "/scan", params: { target: "new-sn" } })} />
            {needLabel && (
              <>
                <Txt>{t("labelPhoto")}</Txt>
                {label ? <Image source={{ uri: label.uri }} style={{ width: 160, height: 120, borderRadius: 8 }} /> : null}
                <Btn title={`📷 ${t("takePhoto")}`} onPress={async () => { const p = await pickFiles(true); if (p[0]) setLabel(p[0]); }} />
              </>
            )}
          </>
        )}
      </Card>
      <Card>
        <H2>{t("problem")}</H2>
        <Field label={t("subject")} value={subject} onChangeText={setSubject} maxLength={160} />
        <Field label={t("description")} value={description} onChangeText={setDescription} multiline maxLength={4000} />
        <Row>
          {files.map((f, i) => <Image key={i} source={{ uri: f.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />)}
        </Row>
        <Row>
          <Btn kind="ghost" title={`📷 ${t("takePhoto")}`} onPress={async () => setFiles([...files, ...(await pickFiles(true))])} />
          <Btn kind="ghost" title={t("addPhotos")} onPress={async () => setFiles([...files, ...(await pickFiles(false))])} />
        </Row>
      </Card>
      <Err>{err}</Err>
      {info ? <Txt color={c.ok}>{info}</Txt> : null}
      <Btn title={busy ? t("sending") : t("sendToTeam")} onPress={submit} busy={busy} />
    </Screen>
  );
}
