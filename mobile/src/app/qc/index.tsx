import { useCallback, useState } from "react";
import { Pressable, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { usePerms } from "@/lib/perm";
import { takeScan } from "@/lib/scan-store";
import { Badge, Btn, Card, Choice, Err, Field, Loading, Row, Screen, Txt } from "@/components/ui";

type Q = { id: string; sn: string; status: string; comment: string | null; created_at: string };
type F = "all" | "done" | "broken" | "hardware_issue";

export default function QcList() {
  const { t, c } = usePrefs();
  const perms = usePerms(["qc.view", "qc.edit"]);
  const [rows, setRows] = useState<Q[] | null>(null);
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (sn: string, st: F) => {
    setErr("");
    let query = sb.from("qc_checks").select("id,sn:serial_number,status,comment,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    if (sn.trim()) query = query.ilike("serial_number", `%${sn.trim()}%`);
    if (st !== "all") query = query.eq("status", st);
    const { data, error } = await query;
    if (error) setErr(error.message);
    setRows((data ?? []) as Q[]);
  }, []);

  useFocusEffect(useCallback(() => {
    const code = takeScan("qc-find");
    if (code) { const v = code.replace(/\s+/g, "").toUpperCase(); setQ(v); load(v, f); } else load(q, f);
  }, [load, f]));

  const label = (s: string) => s === "done" ? t("qcDone") : s === "broken" ? t("qcBroken") : t("qcHardware");
  if (perms && !perms["qc.view"]) return <Screen><Txt>{t("errBoardView")}</Txt></Screen>;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(q, f); setRefreshing(false); }} />}>
      {perms?.["qc.edit"] && <Btn title={`＋ ${t("newQc")}`} onPress={() => router.push("/qc/new")} />}
      <Field value={q} onChangeText={(v) => setQ(v.toUpperCase())} placeholder={t("snPlaceholder")} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={() => load(q, f)} returnKeyType="search" />
      <Row>
        <Btn kind="ghost" title={t("search").split(":")[0]} onPress={() => load(q, f)} />
        <Btn kind="ghost" title={`📷 ${t("scan")}`} onPress={() => router.push({ pathname: "/scan", params: { target: "qc-find" } })} />
      </Row>
      <Choice<F> value={f} onChange={(v) => { setF(v); load(q, v); }} options={[
        { value: "all", label: t("allStatuses") }, { value: "done", label: t("qcDone") }, { value: "broken", label: t("qcBroken") }, { value: "hardware_issue", label: t("qcHardware") },
      ]} />
      <Err>{err}</Err>
      {rows === null ? <Loading /> : rows.length === 0 ? <Txt muted>{t("noQc")}</Txt> : rows.map((x) => (
        <Pressable key={x.id} onPress={() => router.push(`/qc/${x.id}`)}>
          <Card>
            <Row><Txt bold>{x.sn}</Txt><Badge text={label(x.status)} tone={x.status === "done" ? "ok" : "warn"} /></Row>
            {x.comment ? <Txt>{x.comment}</Txt> : null}
            <Txt muted small>{new Date(x.created_at).toLocaleString()}</Txt>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
