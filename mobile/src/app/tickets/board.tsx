import { useCallback, useState } from "react";
import { Pressable, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { sb, serverAfter } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { usePerms } from "@/lib/perm";
import { Badge, Btn, Card, Err, Field, Loading, Row, Screen, Txt } from "@/components/ui";

type Col = "new" | "diagnose" | "ready" | "pickup_new_device" | "repair_not_possible";
const COLS: Col[] = ["new", "diagnose", "ready", "pickup_new_device", "repair_not_possible"];
const SVC: Record<Exclude<Col, "new">, string> = { diagnose: "in_progress", ready: "done", pickup_new_device: "rma", repair_not_possible: "repair_not_possible" };
type C = { id: string; ticket_no: number; subject: string; assigned_to: string | null; customer_device_status: string | null; device_id: string; customer_id: string };
const colOf = (c: C): Col => (!c.assigned_to ? "new" : ((c.customer_device_status as Col) ?? "diagnose"));

export default function Board() {
  const { session, isAdmin } = useAuth();
  const { t, c } = usePrefs();
  const perms = usePerms(["tickets.board.view", "tickets.board.edit"]);
  const [cards, setCards] = useState<C[] | null>(null);
  const [sn, setSn] = useState<Map<string, string>>(new Map());
  const [who, setWho] = useState<Map<string, string>>(new Map());
  const [col, setCol] = useState<Col>("new");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from("tickets").select("id,ticket_no,subject,assigned_to,customer_device_status,device_id,customer_id").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
    const rows = (data ?? []) as C[];
    setCards(rows);
    const devIds = [...new Set(rows.map((r) => r.device_id))];
    const uIds = [...new Set(rows.map((r) => r.customer_id))];
    const [{ data: d }, { data: u }] = await Promise.all([
      devIds.length ? sb.from("devices").select("id,serial_number").in("id", devIds) : Promise.resolve({ data: [] as any[] }),
      uIds.length ? sb.from("users").select("id,first_name,last_name,companies(name)").in("id", uIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    setSn(new Map((d ?? []).map((x: any) => [x.id, x.serial_number])));
    setWho(new Map((u ?? []).map((x: any) => [x.id, `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() + (x.companies?.name ? ` · ${x.companies.name}` : "")])));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (perms && !perms["tickets.board.view"]) return <Screen><Txt>{t("errBoardView")}</Txt></Screen>;
  const canEdit = perms?.["tickets.board.edit"] === true;
  const title = (k: Col) => k === "new" ? t("colNew") : k === "diagnose" ? t("diagnose") : k === "ready" ? t("ready") : t(k);
  const needle = q.trim().toLowerCase();
  const matches = (x: C) => !needle || String(x.ticket_no).includes(needle) || (sn.get(x.device_id) ?? "").toLowerCase().includes(needle) || (who.get(x.customer_id) ?? "").toLowerCase().includes(needle) || x.subject.toLowerCase().includes(needle);
  const list = (cards ?? []).filter((x) => colOf(x) === col && matches(x));

  async function move(x: C, to: Col) {
    setErr("");
    const from = colOf(x);
    if (!canEdit) { setErr(t("errBoardView")); return; }
    if (to === "new") { setErr(t("errBackToNew")); return; }
    if (from !== "new" && from !== "diagnose" && !isAdmin) { setErr(t("errClosedAdmin")); return; }
    setBusy(x.id);
    if (!x.assigned_to) {
      const { data, error } = await sb.from("tickets").update({ assigned_to: session!.user.id, status: "assigned" }).eq("id", x.id).is("assigned_to", null).select("id");
      if (error) { setErr(error.message); setBusy(""); return; }
      if (!data || data.length === 0) { setErr(t("errTaken")); setBusy(""); await load(); return; }
      serverAfter(x.id, "apply");
    }
    const { error } = await sb.rpc("set_device_service_status", { p_ticket: x.id, p_status: SVC[to], p_comment: "" });
    if (error) setErr(error.message); else serverAfter(x.id, "status");
    setBusy(""); await load();
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Field value={q} onChangeText={setQ} placeholder={t("search")} autoCapitalize="none" />
      <Row>
        {COLS.map((k) => (
          <Pressable key={k} onPress={() => setCol(k)}>
            <Badge text={`${title(k)} ${(cards ?? []).filter((x) => colOf(x) === k).length}`} tone={col === k ? "ok" : undefined} />
          </Pressable>
        ))}
      </Row>
      <Err>{err}</Err>
      {cards === null ? <Loading /> : list.length === 0 ? <Txt muted>{t("noTickets")}</Txt> : list.map((x) => (
        <Card key={x.id}>
          <Pressable onPress={() => router.push(`/tickets/${x.id}`)}>
            <Txt bold>#{x.ticket_no} · {sn.get(x.device_id) ?? "—"}</Txt>
            <Txt>{x.subject}</Txt>
            <Txt muted small>{who.get(x.customer_id) ?? ""}</Txt>
          </Pressable>
          {canEdit && (x.assigned_to ? true : true) && (
            <>
              <Txt muted small>{t("moveTo")}:</Txt>
              <Row>
                {COLS.filter((k) => k !== "new" && k !== colOf(x)).map((k) => (
                  <Btn key={k} kind="ghost" title={title(k)} busy={busy === x.id} onPress={() => move(x, k)} />
                ))}
              </Row>
            </>
          )}
        </Card>
      ))}
    </Screen>
  );
}
