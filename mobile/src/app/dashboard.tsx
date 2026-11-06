import { useCallback, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { Card, Choice, Err, Loading, Row, Screen, Txt } from "@/components/ui";

type Stats = {
  scope_all: boolean; open_now: number; overdue: number; created: number; closed: number;
  avg_close_hours: number | null; avg_first_response_hours: number | null; avg_satisfaction: number | null; devices_in_service: number;
  by_status: Record<string, number>; by_device_status: Record<string, number>; warranty: { warranty: number; paid: number };
  fees: { currency: string; total: number; count: number }[]; engineers: { name: string; open: number; closed: number; overdue: number }[];
};
type Period = "today" | "7" | "30";
const DAY = 86400000, BAKU = 4 * 3600000;   // UTC+4, no daylight saving
const ymd = (ms: number) => new Date(ms + BAKU).toISOString().slice(0, 10);
const startOf = (d: string) => new Date(`${d}T00:00:00+04:00`).getTime();

export default function Dashboard() {
  const { t, c } = usePrefs();
  const [period, setPeriod] = useState<Period>("7");
  const [d, setD] = useState<Stats | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const today = ymd(Date.now());
    const from = period === "today" ? today : ymd(Date.now() - (period === "7" ? 6 : 29) * DAY);
    const { data, error } = await sb.rpc("dashboard_stats", { p_from: new Date(startOf(from)).toISOString(), p_to: new Date(startOf(today) + DAY).toISOString() });
    setErr(error?.message ?? ""); setD((data as Stats) ?? null);
  }, [period]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hrs = (v: number | null) => (v == null ? "—" : `${v} ${t("dashHours")}`);
  const stLabel: Record<string, string> = { new: t("dashStNew"), assigned: t("dashStAssigned"), in_progress: t("dashStInProgress"), waiting_customer: t("dashStWaiting") };
  const Tile = ({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) => (
    <View style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12 }}>
      <Txt muted small>{label}</Txt>
      <Text style={{ fontSize: 24, fontWeight: "700", color: warn ? c.danger : c.fg }}>{String(value)}</Text>
    </View>
  );
  const Bars = ({ rows }: { rows: [string, number][] }) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return rows.length === 0 ? <Txt muted>{t("dashNone")}</Txt> : <>{rows.map(([k, v]) => (
      <View key={k} style={{ gap: 2 }}>
        <Row><Txt>{k}</Txt><Txt bold>{String(v)}</Txt></Row>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border }}><View style={{ height: 8, borderRadius: 4, width: `${(v / max) * 100}%`, backgroundColor: c.accent }} /></View>
      </View>))}</>;
  };
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Choice<Period> value={period} onChange={setPeriod} options={[{ value: "today", label: t("dashToday") }, { value: "7", label: t("dash7") }, { value: "30", label: t("dash30") }]} />
      <Err>{err}</Err>
      {d === undefined ? <Loading /> : d === null ? <Txt muted>{t("dashNone")}</Txt> : (
        <>
          {!d.scope_all && <Txt muted small>{t("dashMyOnly")}</Txt>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Tile label={t("dashOpenNow")} value={d.open_now} />
            <Tile label={t("dashOverdue")} value={d.overdue} warn={d.overdue > 0} />
            <Tile label={t("dashCreated")} value={d.created} />
            <Tile label={t("dashClosed")} value={d.closed} />
            <Tile label={t("dashDevices")} value={d.devices_in_service} />
            <Tile label={t("dashSatisfaction")} value={d.avg_satisfaction ?? "—"} />
            <Tile label={t("dashAvgClose")} value={hrs(d.avg_close_hours)} />
            <Tile label={t("dashAvgFirst")} value={hrs(d.avg_first_response_hours)} />
          </View>
          <Card><Txt bold>{t("dashByStatus")}</Txt><Bars rows={Object.entries(d.by_status).map(([k, v]) => [stLabel[k] ?? k, v])} /></Card>
          <Card><Txt bold>{t("dashByDevStatus")}</Txt><Bars rows={Object.entries(d.by_device_status).map(([k, v]) => [(t as (k: string) => string)(`st_${k}`) || k, v])} /></Card>
          <Card>
            <Txt bold>{t("dashWarranty")}</Txt>
            <Bars rows={[[t("dashWarrantyWord"), d.warranty.warranty], [t("dashPaidWord"), d.warranty.paid]]} />
            <Txt bold>{t("dashFees")}</Txt>
            {d.fees.length ? d.fees.map((f) => <Txt key={f.currency}>{Number(f.total).toLocaleString(undefined, { maximumFractionDigits: 2 })} {f.currency} ({f.count})</Txt>) : <Txt muted>{t("dashNone")}</Txt>}
          </Card>
          {d.scope_all && d.engineers.length > 0 && (
            <Card>
              <Txt bold>{t("dashEngineers")}</Txt>
              {d.engineers.map((e, i) => (
                <Row key={i}><Txt>{e.name}</Txt><Txt muted small>{t("dashOpen")} {e.open} · ✓ {e.closed}{e.overdue ? ` · ⚠ ${e.overdue}` : ""}</Txt></Row>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
