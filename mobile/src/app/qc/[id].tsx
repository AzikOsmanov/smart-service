import { useCallback, useState } from "react";
import { Alert, Image, Linking, Pressable } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { usePerms } from "@/lib/perm";
import { Badge, Btn, Card, Choice, Err, Field, H1, H2, Loading, Row, Screen, Txt } from "@/components/ui";

type S = "done" | "broken" | "hardware_issue";
type Q = { id: string; sn: string; status: S; comment: string | null; created_at: string; ticket_id: string | null };
type M = { id: string; kind: string; url: string; mime: string | null };

export default function QcDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = usePrefs();
  const perms = usePerms(["qc.edit", "qc.delete"]);
  const [q, setQ] = useState<Q | null | undefined>(undefined);
  const [media, setMedia] = useState<M[]>([]);
  const [hist, setHist] = useState<Q[]>([]);
  const [status, setStatus] = useState<S>("done");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from("qc_checks").select("id,sn,status,comment,created_at,ticket_id").eq("id", id).is("deleted_at", null).maybeSingle();
    const row = (data as Q) ?? null;
    setQ(row);
    if (!row) return;
    setStatus(row.status); setComment(row.comment ?? "");
    const [{ data: mm }, { data: hh }] = await Promise.all([
      sb.from("qc_media").select("id,path,kind,mime").eq("qc_id", id).order("created_at"),
      sb.from("qc_checks").select("id,sn,status,comment,created_at,ticket_id").eq("sn", row.sn).is("deleted_at", null).order("created_at", { ascending: false }).limit(30),
    ]);
    const signed = await Promise.all((mm ?? []).map(async (m: any) => ({ id: m.id, kind: m.kind, mime: m.mime, url: (await sb.storage.from("qc-media").createSignedUrl(m.path, 3600)).data?.signedUrl ?? "" })));
    setMedia(signed.filter((m) => m.url));
    setHist(((hh ?? []) as Q[]).filter((h) => h.id !== id));
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (q === undefined) return <Loading />;
  if (!q) return <Screen><Txt>{t("notFound")}</Txt></Screen>;
  const label = (s: string) => s === "done" ? t("qcDone") : s === "broken" ? t("qcBroken") : t("qcHardware");

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    const { error } = await sb.from("qc_checks").update({ status, comment: comment.trim() || null }).eq("id", id);
    setBusy(false);
    if (error) setErr(error.message); else { setMsg(t("saved")); load(); }
  }
  function remove() {
    Alert.alert(t("deleteQc"), t("deleteQcQ"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("del"), style: "destructive", onPress: async () => {
        const { error } = await sb.from("qc_checks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) setErr(error.message); else router.back();
      } },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: q.sn }} />
      <Card>
        <H1>{q.sn}</H1>
        <Row><Badge text={label(q.status)} tone={q.status === "done" ? "ok" : "warn"} /></Row>
        <Txt muted small>{new Date(q.created_at).toLocaleString()}</Txt>
        {q.ticket_id ? <Btn kind="ghost" title={t("ticketWord")} onPress={() => router.push(`/tickets/${q.ticket_id}`)} /> : null}
      </Card>
      {perms?.["qc.edit"] ? (
        <Card>
          <H2>{t("qcStatus")}</H2>
          <Choice<S> value={status} onChange={setStatus} options={[{ value: "done", label: t("qcDone") }, { value: "broken", label: t("qcBroken") }, { value: "hardware_issue", label: t("qcHardware") }]} />
          <Field label={t("comment")} value={comment} onChangeText={setComment} multiline />
          <Btn title={t("save")} onPress={save} busy={busy} />
        </Card>
      ) : q.comment ? <Card><Txt>{q.comment}</Txt></Card> : null}
      <Err>{err}</Err>
      {msg ? <Txt>{msg}</Txt> : null}
      {media.length > 0 && (
        <Card>
          <H2>{t("photosVideos")}</H2>
          {media.map((m) => m.kind === "video"
            ? <Btn key={m.id} kind="ghost" title="🎬 ▶" onPress={() => Linking.openURL(m.url)} />
            : <Pressable key={m.id} onPress={() => Linking.openURL(m.url)}><Image source={{ uri: m.url }} style={{ width: "100%", height: 220, borderRadius: 8 }} resizeMode="contain" /></Pressable>)}
        </Card>
      )}
      <Btn kind="ghost" title={t("newQcForDevice")} onPress={() => router.push({ pathname: "/qc/new", params: { sn: q.sn } })} />
      {hist.length > 0 && (
        <Card>
          <H2>{t("qcHistory")}</H2>
          {hist.map((h) => (
            <Pressable key={h.id} onPress={() => router.push(`/qc/${h.id}`)}>
              <Txt small>{new Date(h.created_at).toLocaleString()} · {label(h.status)}{h.comment ? ` — ${h.comment}` : ""}</Txt>
            </Pressable>
          ))}
        </Card>
      )}
      {perms?.["qc.delete"] && <Btn kind="danger" title={t("deleteQc")} onPress={remove} />}
    </Screen>
  );
}
