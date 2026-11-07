import { useCallback, useState } from "react";
import { Pressable, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { Card, Choice, Err, Loading, Screen, Txt } from "@/components/ui";

type Tut = { id: string; title: string; description: string | null; created_at: string };

export default function Tutorials() {
  const { t, c } = usePrefs();
  const [rows, setRows] = useState<Tut[] | null>(null);
  const [kind, setKind] = useState<"tutorial" | "product">("tutorial");
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.from("tutorials").select("id,title,description,created_at").eq("kind", kind).is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    setErr(error?.message ?? ""); setRows((data ?? []) as Tut[]);
  }, [kind]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Choice<"tutorial" | "product"> value={kind} onChange={(k) => { setRows(null); setKind(k); }} options={[{ value: "tutorial", label: t("vidTutorial") }, { value: "product", label: t("vidProduct") }]} />
      <Err>{err}</Err>
      {rows === null ? <Loading /> : rows.length === 0 ? <Txt muted>{t("tutNone")}</Txt> : rows.map((x) => (
        <Pressable key={x.id} onPress={() => router.push(`/tutorials/${x.id}`)}>
          <Card>
            <Txt bold>▶ {x.title}</Txt>
            {x.description ? <Txt muted>{x.description}</Txt> : null}
            <Txt muted small>{new Date(x.created_at).toLocaleDateString()}</Txt>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
