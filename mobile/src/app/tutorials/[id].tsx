import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { Btn, Card, Err, H1, Loading, Screen, Txt } from "@/components/ui";

type Tut = { id: string; title: string; description: string | null; source: string; storage_path: string | null; url: string | null };

// Opens the video in the phone's own player / browser (works for uploaded files and for YouTube, Vimeo and other links).
export default function Tutorial() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = usePrefs();
  const [tut, setTut] = useState<Tut | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useFocusEffect(useCallback(() => {
    sb.from("tutorials").select("id,title,description,source,storage_path,url").eq("id", id).is("deleted_at", null).maybeSingle().then(({ data }) => setTut((data as Tut) ?? null));
  }, [id]));

  async function open() {
    setErr("");
    if (!tut) return;
    let url = tut.url;
    if (tut.source === "upload" && tut.storage_path) {
      const { data, error } = await sb.storage.from("tutorials").createSignedUrl(tut.storage_path, 3600);
      if (error || !data) { setErr(error?.message ?? t("error")); return; }
      url = data.signedUrl;
    }
    if (url) Linking.openURL(url).catch((e) => setErr(String(e?.message ?? e)));
  }

  if (tut === undefined) return <Loading />;
  if (!tut) return <Screen><Txt>{t("tutNotFound")}</Txt></Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: t("tutorials") }} />
      <Card>
        <H1>{tut.title}</H1>
        {tut.description ? <Txt>{tut.description}</Txt> : null}
        <Btn title={`▶ ${t("tutWatch")}`} onPress={open} />
      </Card>
      <Err>{err}</Err>
    </Screen>
  );
}
