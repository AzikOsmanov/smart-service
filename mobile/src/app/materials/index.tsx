import { useCallback, useState } from "react";
import { Pressable, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { Card, Err, Field, Loading, Screen, Txt } from "@/components/ui";

type Mat = { id: string; title: string; description: string | null; creator_name: string; created_at: string };

// Engineers' educational materials (read-only on the phone; creating/editing is done on the website).
export default function Materials() {
  const { t, c } = usePrefs();
  const [rows, setRows] = useState<Mat[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const term = q.trim().replace(/[%,()*]/g, "").slice(0, 80);
    let query = sb.from("materials").select("id,title,description,creator_name,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    if (term) { const like = `%${term}%`; query = query.or(`title.ilike.${like},description.ilike.${like},creator_name.ilike.${like},body.ilike.${like}`); }
    const { data, error } = await query;
    setErr(error?.message ?? ""); setRows((data ?? []) as Mat[]);
  }, [q]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Field value={q} onChangeText={setQ} placeholder={t("search")} autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
      <Err>{err}</Err>
      {rows === null ? <Loading /> : rows.length === 0 ? <Txt muted>{t("matNone")}</Txt> : rows.map((x) => (
        <Pressable key={x.id} onPress={() => router.push(`/materials/${x.id}`)}>
          <Card>
            <Txt bold>📘 {x.title}</Txt>
            {x.description ? <Txt muted>{x.description}</Txt> : null}
            <Txt muted small>{x.creator_name} · {new Date(x.created_at).toLocaleDateString()}</Txt>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
