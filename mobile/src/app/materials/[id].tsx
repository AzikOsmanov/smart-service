import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { Btn, Card, Err, H1, Loading, Screen, Txt } from "@/components/ui";

type Mat = { id: string; title: string; description: string | null; body: string | null; video_url: string | null; creator_name: string; created_at: string };
type File = { id: string; path: string; file_name: string; kind: string };

export default function Material() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = usePrefs();
  const [m, setM] = useState<Mat | null | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await sb.from("materials").select("id,title,description,body,video_url,creator_name,created_at").eq("id", id).is("deleted_at", null).maybeSingle();
      setM((data as Mat) ?? null);
      if (data) {
        const { data: f } = await sb.from("material_files").select("id,path,file_name,kind").eq("material_id", id).order("created_at");
        setFiles((f ?? []) as File[]);
      }
    })();
  }, [id]));

  async function openFile(f: File) {
    setErr("");
    const { data, error } = await sb.storage.from("materials").createSignedUrl(f.path, 3600);
    if (error || !data) { setErr(error?.message ?? t("error")); return; }
    Linking.openURL(data.signedUrl).catch((e) => setErr(String(e?.message ?? e)));
  }

  if (m === undefined) return <Loading />;
  if (!m) return <Screen><Txt>{t("matNotFound")}</Txt></Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: t("materials") }} />
      <Card>
        <H1>{m.title}</H1>
        <Txt muted small>{m.creator_name} · {new Date(m.created_at).toLocaleDateString()}</Txt>
        {m.description ? <Txt bold>{m.description}</Txt> : null}
        {m.body ? <Txt>{m.body}</Txt> : null}
      </Card>
      {m.video_url ? <Card><Btn title={`▶ ${t("tutOpenLink")}`} onPress={() => Linking.openURL(m.video_url!).catch((e) => setErr(String(e?.message ?? e)))} /></Card> : null}
      {files.length > 0 && (
        <Card>
          <Txt bold>{t("matFiles")}</Txt>
          {files.map((f) => <Btn key={f.id} kind="ghost" title={`${f.kind === "pdf" ? "📄" : f.kind === "image" ? "🖼" : "📎"} ${f.file_name}`} onPress={() => openFile(f)} />)}
        </Card>
      )}
      <Err>{err}</Err>
    </Screen>
  );
}
