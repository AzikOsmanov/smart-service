import { useCallback, useState } from "react";
import { Pressable, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { usePmAccess } from "@/lib/pm";
import { Btn, Card, Choice, Err, Field, Loading, Screen, Txt } from "@/components/ui";

type P = { id: string; name: string; client: string | null; address: string | null; created_at: string };

// Project Management: list of projects and a form to start a new one.
export default function Projects() {
  const { t, c } = usePrefs();
  const { profile, session } = useAuth();
  const acc = usePmAccess();
  const [rows, setRows] = useState<P[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState(""); const [client, setClient] = useState(""); const [address, setAddress] = useState("");
  const [brand, setBrand] = useState<"any" | "dahua" | "unv">("any");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("projects").select("id,name,client,address,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    setErr(error?.message ?? ""); const list = (data ?? []) as P[]; setRows(list);
    const ids = list.map((r) => r.id);
    if (ids.length) {
      const { data: pts } = await sb.from("project_points").select("project_id").in("project_id", ids).is("deleted_at", null);
      const m = new Map<string, number>(); (pts ?? []).forEach((p: any) => m.set(p.project_id, (m.get(p.project_id) ?? 0) + 1)); setCounts(m);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    if (!name.trim() || !profile || !session) return;
    setBusy(true); setErr("");
    const { data, error } = await sb.from("projects").insert({ tenant_id: profile.tenant_id, name: name.trim().slice(0, 160), client: client.trim().slice(0, 160) || null, address: address.trim().slice(0, 300) || null, brand_pref: brand, created_by: session.user.id }).select("id").single();
    setBusy(false);
    if (error || !data) { setErr(error?.message ?? "error"); return; }
    setName(""); setClient(""); setAddress("");
    router.push(`/projects/${data.id}`);
  }

  if (acc && !acc.view) return <Screen><Txt muted>{t("x_pmReadOnly")}</Txt></Screen>;
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Err>{err}</Err>
      {acc?.edit && (
        <Card>
          <Txt bold>{t("x_pmNew")}</Txt>
          <Field label={t("x_pmName")} value={name} onChangeText={setName} maxLength={160} />
          <Field label={t("x_pmClient")} value={client} onChangeText={setClient} maxLength={160} />
          <Field label={t("x_pmAddress")} value={address} onChangeText={setAddress} maxLength={300} />
          <Txt muted small>{t("x_pmBrand")}</Txt>
          <Choice value={brand} onChange={setBrand} options={[{ value: "any", label: t("x_pmBrandAny") }, { value: "dahua", label: "Dahua" }, { value: "unv", label: "UNV" }]} />
          <Btn title={t("x_pmNew")} onPress={create} busy={busy} disabled={!name.trim()} />
        </Card>
      )}
      <Btn kind="ghost" title={`📖 ${t("x_guideTitle")}`} onPress={() => router.push("/guide")} />
      {rows === null ? <Loading /> : rows.length === 0 ? <Txt muted>{t("x_pmNone")}</Txt> : rows.map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/projects/${r.id}`)}>
          <Card>
            <Txt bold>{r.name}</Txt>
            <Txt muted small>{[r.client, r.address].filter(Boolean).join(" · ") || "—"}</Txt>
            <Txt muted small>{`${t("x_pmPointsCol")}: ${counts.get(r.id) ?? 0} · ${new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Baku", dateStyle: "medium", timeStyle: "short" })}`}</Txt>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
