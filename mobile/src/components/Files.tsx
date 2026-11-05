import { useCallback, useEffect, useState } from "react";
import { Image, Linking, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { uploadTicketFiles, type Picked } from "@/lib/upload";
import { Btn, Card, Err, H2, Row, Txt } from "@/components/ui";

type F = { id: string; file_name: string; storage_key: string; kind: string; created_at: string };

export async function pickFiles(camera: boolean, kinds: ("images" | "videos")[] = ["images", "videos"]): Promise<Picked[]> {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: kinds, quality: 0.8, videoMaxDuration: 120, allowsMultipleSelection: !camera, selectionLimit: 10 };
  const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled) return [];
  return r.assets.map((a, i) => ({
    uri: a.uri, size: a.fileSize ?? undefined,
    mime: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
    name: a.fileName ?? `${a.type === "video" ? "video" : "photo"}-${Date.now()}-${i}.${a.type === "video" ? "mp4" : "jpg"}`,
  }));
}

export default function Files({ ticketId, tenantId, userId, canAdd }: { ticketId: string; tenantId: string; userId: string; canAdd: boolean }) {
  const { t } = usePrefs();
  const [files, setFiles] = useState<F[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data } = await sb.from("ticket_attachments").select("id,file_name,storage_key,kind,created_at").eq("ticket_id", ticketId).order("created_at");
    const list = (data ?? []) as F[];
    setFiles(list);
    if (list.length) {
      const { data: s } = await sb.storage.from("ticket-files").createSignedUrls(list.map((f) => f.storage_key), 3600);
      setUrls(new Map((s ?? []).filter((x) => x.signedUrl).map((x) => [x.path as string, x.signedUrl as string])));
    }
  }, [ticketId]);
  useEffect(() => { load(); }, [load]);

  async function add(camera: boolean) {
    const picked = await pickFiles(camera);
    if (!picked.length) return;
    setBusy(true); setErr("");
    const failed = await uploadTicketFiles(tenantId, ticketId, userId, picked);
    if (failed.length) setErr(t("uploadFailed", { files: failed.join(", ") }));
    setBusy(false); load();
  }

  return (
    <Card>
      <H2>{t("files")}</H2>
      {files.length === 0 && <Txt muted small>{t("noFiles")}</Txt>}
      <Row>
        {files.map((f) => {
          const u = urls.get(f.storage_key);
          if (!u) return null;
          return f.kind === "image"
            ? <Pressable key={f.id} onPress={() => Linking.openURL(u)}><Image source={{ uri: u }} style={{ width: 96, height: 96, borderRadius: 8 }} /></Pressable>
            : <Pressable key={f.id} onPress={() => Linking.openURL(u)}><Txt>{f.kind === "video" ? "🎬" : "📄"} {f.file_name}</Txt></Pressable>;
        })}
      </Row>
      <Err>{err}</Err>
      {canAdd && <Row><Btn title={`📷 ${t("takePhoto")}`} onPress={() => add(true)} busy={busy} /><Btn kind="ghost" title={t("addPhotos")} onPress={() => add(false)} disabled={busy} /></Row>}
    </Card>
  );
}
