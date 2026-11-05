import { useCallback, useState } from "react";
import { RefreshControl } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { sb, serverAfter } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { warrantyText } from "@/lib/warranty";
import Chat from "@/components/Chat";
import Files from "@/components/Files";
import { Badge, Btn, Card, Choice, Err, Field, H1, H2, Loading, Row, Screen, Txt } from "@/components/ui";

type Ticket = { id: string; tenant_id: string; ticket_no: number; subject: string; description: string | null; status: string; priority: string; kind: string; customer_id: string; device_id: string; customer_device_status: string | null; assigned_to: string | null; created_at: string; fee_amount: number | null; fee_currency: string | null };
type Info = { model_name: string | null; warranty_until: string | null; warranty_note: string | null; sold_date?: string | null; customer_name?: string | null };
type SvcStatus = "in_progress" | "done" | "rma" | "repair_not_possible";
type Cur = "AZN" | "EUR" | "USD";

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, staff, isAdmin } = useAuth();
  const { t, c } = usePrefs();
  const [tk, setTk] = useState<Ticket | null | undefined>(undefined);
  const [serial, setSerial] = useState<string>("");
  const [info, setInfo] = useState<Info | null>(null);
  const [devModel, setDevModel] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [svc, setSvc] = useState<SvcStatus>("in_progress");
  const [comment, setComment] = useState("");
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState<Cur>("AZN");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from("tickets").select("id,tenant_id,ticket_no,subject,description,status,priority,kind,customer_id,device_id,customer_device_status,assigned_to,created_at,fee_amount,fee_currency").eq("id", id).maybeSingle();
    const ticket = (data as Ticket) ?? null;
    setTk(ticket);
    if (!ticket) return;
    setAmount(ticket.fee_amount != null ? String(ticket.fee_amount) : "");
    if (ticket.fee_currency === "EUR" || ticket.fee_currency === "USD" || ticket.fee_currency === "AZN") setCur(ticket.fee_currency);
    const [{ data: dev }, { data: fr }] = await Promise.all([
      sb.from("devices").select("serial_number,device_models(name)").eq("id", ticket.device_id).maybeSingle(),
      sb.rpc("ticket_is_frozen", { p_ticket: ticket.id }),
    ]);
    setSerial((dev as any)?.serial_number ?? "");
    setDevModel((dev as any)?.device_models?.name ?? null);
    setFrozen(fr === true);
    if (staff) {
      const [{ data: ext }, { data: st }, { data: cu }] = await Promise.all([
        sb.from("device_external_info").select("model_name,warranty_until,warranty_note,sold_date,customer_name").eq("device_id", ticket.device_id).maybeSingle(),
        sb.from("ticket_service_state").select("status").eq("ticket_id", ticket.id).maybeSingle(),
        sb.from("users").select("first_name,last_name,email,phone,companies(name)").eq("id", ticket.customer_id).maybeSingle(),
      ]);
      setInfo((ext as Info) ?? null);
      if (st?.status) setSvc(st.status as SvcStatus);
      const u: any = cu;
      setCustomer((ext as any)?.customer_name || (u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() + (u.companies?.name ? ` · ${u.companies.name}` : "") + (u.phone ? ` · ${u.phone}` : "") : "—"));
    } else {
      const { data: ci } = await sb.rpc("customer_device_info", { p_ticket_ids: [ticket.id] });
      setInfo(((ci ?? [])[0] as Info) ?? null);
    }
  }, [id, staff]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function run(name: string, fn: () => Promise<string | null>) {
    setBusy(name); setErr(""); setMsg("");
    try { const e = await fn(); if (e) setErr(e); } catch (x: any) { setErr(String(x?.message ?? x)); }
    setBusy(""); await load();
  }

  if (tk === undefined) return <Loading />;
  if (!tk || !session) return <Screen><Txt>{t("notFound")}</Txt></Screen>;
  const uid = session.user.id;
  const locked = frozen && !isAdmin;
  const model = info?.model_name || devModel || "—";
  const cds = tk.customer_device_status;
  const refresh = <RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />;

  const header = (
    <Card>
      <H1>#{tk.ticket_no} — {tk.subject}</H1>
      {tk.description ? <Txt>{tk.description}</Txt> : null}
      <Txt muted small>{t("serial")}: {serial || "—"} · {t("model")}: {model}</Txt>
      <Txt muted small>{t("warranty")}: {warrantyText(t, info?.warranty_until, info?.warranty_note)}</Txt>
      <Txt muted small>{t("created")}: {new Date(tk.created_at).toLocaleString()}</Txt>
      {frozen && <Txt color={c.danger}>{isAdmin ? t("frozen") : t("locked")}</Txt>}
    </Card>
  );

  if (!staff) {
    const steps = [
      { label: t("received"), done: true },
      { label: t("diagnose"), done: !!cds },
      { label: cds && cds !== "diagnose" ? t(cds as "ready") : t("result"), done: !!cds && cds !== "diagnose" },
    ];
    return (
      <Screen refreshControl={refresh}>
        <Stack.Screen options={{ title: `#${tk.ticket_no}` }} />
        {header}
        <Card>
          <H2>{t("status")}</H2>
          <Row>{steps.map((s, i) => <Badge key={i} text={`${i + 1}. ${s.label}`} tone={s.done ? "ok" : undefined} />)}</Row>
        </Card>
        {tk.fee_amount != null || tk.kind === "password_reset" ? (
          <Card><H2>{t("fee")}</H2><Txt bold>{tk.fee_amount != null ? `${Number(tk.fee_amount).toFixed(2)} ${tk.fee_currency}` : t("feeNone")}</Txt></Card>
        ) : null}
        <Files ticketId={tk.id} tenantId={tk.tenant_id} userId={uid} canAdd={!locked} />
        <Chat ticketId={tk.id} tenantId={tk.tenant_id} userId={uid} staff={false} readOnly={locked} />
      </Screen>
    );
  }

  return (
    <Screen refreshControl={refresh}>
      <Stack.Screen options={{ title: `#${tk.ticket_no}` }} />
      {header}
      <Card>
        <Txt>{t("customer")}: <Txt bold>{customer}</Txt></Txt>
        {info?.sold_date ? <Txt muted small>{t("soldDate")}: {info.sold_date}</Txt> : null}
        <Txt muted small>{t("ticketStatus")}: {tk.status} · {t("priority")}: {tk.priority}</Txt>
        <Txt muted small>{t("assignedTo")}: {tk.assigned_to ? (tk.assigned_to === uid ? t("you") : "✓") : t("nobody")}</Txt>
        {!locked && <Btn kind="ghost" title={t("lookup")} busy={busy === "lookup"} onPress={() => run("lookup", async () => {
          const r = await serverAfter(tk.id, "lookup");
          const code = r?.lookup;
          if (code === "ok") setMsg(t("lookupOk")); else if (code === "not_found") return t("lookupNotFound"); else if (code === "off") return t("lookupOff"); else return t("lookupFail", { err: r?.detail ?? "—" });
          return null;
        })} />}
      </Card>
      <Err>{err}</Err>
      {msg ? <Txt color={c.ok}>{msg}</Txt> : null}
      {locked ? null : !tk.assigned_to ? (
        <Btn title={t("apply")} busy={busy === "apply"} onPress={() => run("apply", async () => {
          const { error } = await sb.from("tickets").update({ assigned_to: uid, status: "assigned" }).eq("id", tk.id).is("assigned_to", null);
          if (error) return error.message;
          serverAfter(tk.id, "apply");
          return null;
        })} />
      ) : (
        <>
          <Card>
            <H2>{t("serviceStatus")}</H2>
            <Choice<SvcStatus> value={svc} onChange={setSvc} options={[
              { value: "in_progress", label: t("optInProgress") }, { value: "done", label: t("ready") },
              { value: "rma", label: t("pickup_new_device") }, { value: "repair_not_possible", label: t("repair_not_possible") },
            ]} />
            <Field label={t("comment")} value={comment} onChangeText={setComment} />
            <Btn title={t("setStatus")} busy={busy === "status"} onPress={() => run("status", async () => {
              const { error } = await sb.rpc("set_device_service_status", { p_ticket: tk.id, p_status: svc, p_comment: comment });
              if (error) return error.message;
              setComment(""); setMsg(t("saved")); serverAfter(tk.id, "status");
              return null;
            })} />
          </Card>
          <Card>
            <H2>{t("fee")}</H2>
            <Field label={t("amount")} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Choice<Cur> value={cur} onChange={setCur} options={[{ value: "AZN", label: "AZN" }, { value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }]} />
            <Btn title={t("save")} busy={busy === "fee"} onPress={() => run("fee", async () => {
              const raw = amount.trim().replace(",", ".");
              const value = raw === "" ? null : Number(raw);
              if (value !== null && (!Number.isFinite(value) || value < 0)) return t("amount");
              const { error } = await sb.rpc("set_ticket_fee", { p_ticket: tk.id, p_amount: value, p_currency: value === null ? null : cur });
              if (error) return error.message;
              setMsg(t("saved"));
              return null;
            })} />
          </Card>
        </>
      )}
      <Files ticketId={tk.id} tenantId={tk.tenant_id} userId={uid} canAdd={!locked} />
      <Chat ticketId={tk.id} tenantId={tk.tenant_id} userId={uid} staff readOnly={locked} />
    </Screen>
  );
}
