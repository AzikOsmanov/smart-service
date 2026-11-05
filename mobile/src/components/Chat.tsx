import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { sb } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { Btn, Card, Err, Field, H2, Row, Txt } from "@/components/ui";

type Msg = { id: string; sender_kind: "staff" | "customer"; body: string; is_internal: boolean; created_at: string };

export default function Chat({ ticketId, tenantId, userId, staff, readOnly }: { ticketId: string; tenantId: string; userId: string; staff: boolean; readOnly: boolean }) {
  const { t, c } = usePrefs();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = (m: Msg) => setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m].sort((a, b) => a.created_at.localeCompare(b.created_at))));

  useEffect(() => {
    sb.from("ticket_messages").select("id,sender_kind,body,is_internal,created_at").eq("ticket_id", ticketId).is("deleted_at", null).order("created_at")
      .then(({ data }) => setMsgs((data ?? []) as Msg[]));
    const ch = sb.channel(`m-ticket-${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` }, (p) => add(p.new as Msg))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [ticketId]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr("");
    const { data, error } = await sb.from("ticket_messages")
      .insert({ tenant_id: tenantId, ticket_id: ticketId, sender_id: userId, sender_kind: staff ? "staff" : "customer", body: body.slice(0, 4000), is_internal: staff && internal })
      .select("id,sender_kind,body,is_internal,created_at").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    add(data as Msg); setText("");
  }

  const mine = (m: Msg) => (staff ? m.sender_kind === "staff" : m.sender_kind === "customer");
  return (
    <Card>
      <H2>{t("chat")}</H2>
      {msgs.length === 0 && <Txt muted small>{t("noMessages")}</Txt>}
      {msgs.map((m) => (
        <View key={m.id} style={{ alignSelf: mine(m) ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: m.is_internal ? c.internal : mine(m) ? c.accent : c.chipBg, borderRadius: 12, padding: 10 }}>
          <Txt small color={mine(m) && !m.is_internal ? c.accentFg : c.muted}>
            {(mine(m) ? t("you") : m.sender_kind === "staff" ? t("staffSender") : t("customerSender")) + (m.is_internal ? ` · ${t("internal")}` : "")} · {new Date(m.created_at).toLocaleString()}
          </Txt>
          <Txt color={mine(m) && !m.is_internal ? c.accentFg : c.fg}>{m.body}</Txt>
        </View>
      ))}
      {readOnly ? <Txt muted small>{t("frozen")}</Txt> : (
        <>
          <Field value={text} onChangeText={setText} placeholder={t("chatPlaceholder")} multiline maxLength={4000} />
          {staff && <Row><Switch value={internal} onValueChange={setInternal} /><Txt>{t("internal")}</Txt></Row>}
          <Err>{err}</Err>
          <Btn title={t("send")} onPress={send} busy={busy} disabled={!text.trim()} />
        </>
      )}
    </Card>
  );
}
