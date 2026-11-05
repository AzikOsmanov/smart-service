import { useCallback, useState } from "react";
import { Pressable, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import type { Key } from "@/lib/i18n";
import { Btn, Card, Screen, Txt } from "@/components/ui";

type N = { id: string; kind: string; ticket_id: string | null; data: Record<string, any>; created_at: string; read_at: string | null };

export default function Notifications() {
  const { t, c } = usePrefs();
  const [list, setList] = useState<N[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const { data } = await sb.from("notifications").select("id,kind,ticket_id,data,created_at,read_at").order("created_at", { ascending: false }).limit(50);
    setList((data ?? []) as N[]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const text = (n: N) => {
    const d = n.data ?? {};
    const status = d.status ? t(({ diagnose: "diagnose", ready: "ready", repair_not_possible: "repair_not_possible", pickup_new_device: "pickup_new_device" } as Record<string, Key>)[d.status] ?? "status") : "";
    const key = ("n_" + n.kind) as Key;
    return t(key, { no: d.ticket_no, subject: d.subject, name: d.name, email: d.email, amount: d.amount, currency: d.currency, status }) || n.kind;
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      {list.some((n) => !n.read_at) && <Btn kind="ghost" title={t("markAll")} onPress={async () => { await sb.rpc("notifications_mark_read", { p_ids: null }); load(); }} />}
      {list.length === 0 && <Txt muted>{t("noNotifications")}</Txt>}
      {list.map((n) => (
        <Pressable key={n.id} onPress={async () => {
          if (!n.read_at) await sb.rpc("notifications_mark_read", { p_ids: [n.id] });
          if (n.ticket_id) router.push(`/tickets/${n.ticket_id}`); else load();
        }}>
          <Card style={{ borderColor: n.read_at ? c.border : c.accent, borderWidth: n.read_at ? 0.5 : 1.5 }}>
            <Txt bold={!n.read_at}>{text(n)}</Txt>
            <Txt muted small>{new Date(n.created_at).toLocaleString()}</Txt>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
