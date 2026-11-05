import { useCallback, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { takeScan } from "@/lib/scan-store";
import { setBadge } from "@/lib/push";
import { warrantyText } from "@/lib/warranty";
import { Badge, Btn, Card, Choice, Err, Loading, Row, Screen, Txt } from "@/components/ui";

type T = { id: string; ticket_no: number; subject: string; status: string; priority: string; kind: string; customer_id: string; device_id: string; customer_device_status: string | null; assigned_to: string | null; created_at: string };
type Info = { model_name: string | null; warranty_until: string | null; warranty_note: string | null };
type Filter = "all" | "mine" | "new";

export default function Tickets() {
  const { ready, session, profile, staff } = useAuth();
  const { c, t } = usePrefs();
  const [rows, setRows] = useState<T[] | null>(null);
  const [serials, setSerials] = useState<Map<string, string>>(new Map());
  const [info, setInfo] = useState<Map<string, Info>>(new Map());
  const [models, setModels] = useState<Map<string, string>>(new Map());
  const [custNames, setCustNames] = useState<Map<string, string>>(new Map());
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setErr("");
    const [{ data, error }, { count }] = await Promise.all([
      sb.from("tickets").select("id,ticket_no,subject,status,priority,kind,customer_id,device_id,customer_device_status,assigned_to,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
      sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (error) { setErr(error.message); setRows([]); return; }
    const list = (data ?? []) as T[];
    setRows(list); setUnread(count ?? 0); setBadge(count ?? 0);
    const devIds = [...new Set(list.map((x) => x.device_id))];
    const custIds = [...new Set(list.map((x) => x.customer_id))];
    const [{ data: devs }, extRes, custRes] = await Promise.all([
      devIds.length ? sb.from("devices").select("id,serial_number,device_models(name)").in("id", devIds) : Promise.resolve({ data: [] as any[] }),
      staff
        ? (devIds.length ? sb.from("device_external_info").select("device_id,model_name,warranty_until,warranty_note,customer_name").in("device_id", devIds) : Promise.resolve({ data: [] as any[] }))
        : (list.length ? sb.rpc("customer_device_info", { p_ticket_ids: list.map((x) => x.id) }) : Promise.resolve({ data: [] as any[] })),
      staff && custIds.length ? sb.from("users").select("id,first_name,last_name,companies(name)").in("id", custIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    setSerials(new Map((devs ?? []).map((d: any) => [d.id, d.serial_number])));
    setModels(new Map((devs ?? []).filter((d: any) => d.device_models?.name).map((d: any) => [d.id, d.device_models.name as string])));
    const m = new Map<string, Info>();
    for (const e of (extRes.data ?? []) as any[]) m.set(staff ? e.device_id : e.ticket_id, e);
    setInfo(m);
    const names = new Map<string, string>();
    for (const u of (custRes.data ?? []) as any[]) names.set(u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() + (u.companies?.name ? ` · ${u.companies.name}` : ""));
    for (const e of (staff ? extRes.data ?? [] : []) as any[]) if (e.customer_name) names.set("dev:" + e.device_id, e.customer_name);
    setCustNames(names);
  }, [session, staff]);

  useFocusEffect(useCallback(() => {
    load();
    const code = takeScan("find");
    if (code) findBySerial(code);
  }, [load]));

  async function findBySerial(code: string) {
    const sn = code.replace(/\s+/g, "").toUpperCase();
    const { data: dev } = await sb.from("devices").select("id").eq("serial_number", sn).is("deleted_at", null);
    const ids = (dev ?? []).map((d) => d.id);
    const { data: tk } = ids.length ? await sb.from("tickets").select("id").in("device_id", ids).is("deleted_at", null).order("created_at", { ascending: false }).limit(1) : { data: [] };
    if (tk && tk[0]) router.push(`/tickets/${tk[0].id}`); else setErr(t("noTicketForSn", { sn }));
  }

  if (!ready) return <Loading />;
  if (!session) { router.replace("/login"); return <Loading />; }
  if (profile && profile.kind === "customer" && profile.registration !== "approved") {
    return <Screen><Card><Txt>{t("waitingApproval")}</Txt></Card></Screen>;
  }
  const statusLabel = (s: string | null) => t((s ?? "received") as "received");
  const shown = (rows ?? []).filter((x) => filter === "all" || (filter === "mine" ? x.assigned_to === session.user.id : !x.assigned_to));

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Stack.Screen options={{
        headerRight: () => (
          <Row gap={14}>
            <Pressable onPress={() => router.push("/notifications")} hitSlop={10}>
              <Text style={{ fontSize: 20 }}>🔔</Text>
              {unread > 0 && <View style={{ position: "absolute", top: -4, right: -8, backgroundColor: "#ef4444", borderRadius: 9, minWidth: 18, paddingHorizontal: 4, alignItems: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{unread > 99 ? "99+" : unread}</Text></View>}
            </Pressable>
            <Pressable onPress={() => router.push("/settings")} hitSlop={10}><Text style={{ fontSize: 20, color: c.fg }}>⚙︎</Text></Pressable>
          </Row>
        ),
      }} />
      {staff ? (
        <>
          <Btn title={`📷 ${t("findBySn")}`} onPress={() => router.push({ pathname: "/scan", params: { target: "find" } })} />
          <Choice<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: t("all") }, { value: "mine", label: t("mine") }, { value: "new", label: t("unassigned") }]} />
        </>
      ) : <Btn title={`＋ ${t("newTicket")}`} onPress={() => router.push("/tickets/new")} />}
      <Err>{err}</Err>
      {rows === null ? <Loading /> : shown.length === 0 ? <Txt muted>{t("noTickets")}</Txt> : shown.map((x) => {
        const i = staff ? info.get(x.device_id) : info.get(x.id);
        const cust = staff ? custNames.get("dev:" + x.device_id) ?? custNames.get(x.customer_id) : null;
        return (
          <Pressable key={x.id} onPress={() => router.push(`/tickets/${x.id}`)}>
            <Card>
              <Row><Txt bold>#{x.ticket_no}</Txt><Badge text={statusLabel(x.customer_device_status)} tone={x.customer_device_status === "ready" ? "ok" : undefined} />{staff && !x.assigned_to && <Badge text={t("unassigned")} tone="warn" />}</Row>
              <Txt>{x.subject}</Txt>
              {cust ? <Txt muted small>{t("customer")}: {cust}</Txt> : null}
              <Txt muted small>{t("serial")}: {serials.get(x.device_id) ?? "—"} · {t("model")}: {i?.model_name || models.get(x.device_id) || "—"}</Txt>
              <Txt muted small>{t("warranty")}: {warrantyText(t, i?.warranty_until, i?.warranty_note)}</Txt>
              <Txt muted small>{new Date(x.created_at).toLocaleString()}</Txt>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
