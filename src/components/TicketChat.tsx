"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { postMessage, type ChatMessage } from "@/lib/chat-actions";

export default function TicketChat({ ticketId, initial, isStaff, labels }: {
  ticketId: string; initial: ChatMessage[]; isStaff: boolean;
  labels: { title: string; placeholder: string; send: string; internal: string; customer: string; staff: string; you: string; empty: string };
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function add(m: ChatMessage) {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at))));
  }

  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`ticket-${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        (p) => add(p.new as ChatMessage))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [ticketId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const r = await postMessage(ticketId, text, internal);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    if (r.message) add(r.message);
    setText("");
  }

  const mine = (m: ChatMessage) => (isStaff ? m.sender_kind === "staff" : m.sender_kind === "customer");
  return (
    <div className="card">
      <h2>{labels.title}</h2>
      <div className="chat">
        {messages.length === 0 && <p><small>{labels.empty}</small></p>}
        {messages.map((m) => (
          <div key={m.id} className={"msg" + (mine(m) ? " mine" : "") + (m.is_internal ? " internal" : "")}>
            <small>{mine(m) ? labels.you : m.sender_kind === "staff" ? labels.staff : labels.customer}{m.is_internal ? ` · ${labels.internal}` : ""} · {new Date(m.created_at).toLocaleString()}</small>
            <div>{m.body}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={labels.placeholder} rows={3} maxLength={4000} />
        {isStaff && <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto", margin: 0 }} checked={internal} onChange={(e) => setInternal(e.target.checked)} />{labels.internal}</label>}
        {error && <p className="err">{error}</p>}
        <button disabled={busy || !text.trim()}>{labels.send}</button>
      </form>
    </div>
  );
}
