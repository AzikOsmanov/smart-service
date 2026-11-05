"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveTicketAction, type BoardTarget } from "@/lib/board-actions";

export type BoardCard = {
  id: string; no: number | string; subject: string; kind: string; priority: string; customer: string; sn: string; model: string;
  assigned: boolean; assignee: string | null; mine: boolean; deviceStatus: string | null; created: string; fee: string | null;
};
type Col = { key: string; title: string };

const colOf = (c: BoardCard) => (!c.assigned ? "new" : c.deviceStatus ?? "diagnose");

export default function Board({ cards: initial, cols, canEdit, isAdmin }: { cards: BoardCard[]; cols: Col[]; canEdit: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [msg, setMsg] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cards.filter((c) => (!mine || c.mine) && (!s || `${c.no} ${c.subject} ${c.sn} ${c.model} ${c.customer}`.toLowerCase().includes(s)));
  }, [cards, q, mine]);

  const movable = (c: BoardCard) => canEdit && (isAdmin || colOf(c) === "new" || colOf(c) === "diagnose");

  function move(id: string, target: string) {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const from = colOf(c);
    if (from === target) return;
    setMsg("");
    if (!canEdit) { setMsg("You can view the board but not move tickets."); return; }
    if (target === "new") { setMsg("A ticket cannot be moved back to New."); return; }
    if (from !== "new" && from !== "diagnose" && !isAdmin) { setMsg("This ticket is closed. Only the administrator can reopen it."); return; }
    const before = cards;
    setCards((p) => p.map((x) => (x.id === id ? { ...x, assigned: true, deviceStatus: target, mine: x.mine || !x.assigned } : x)));
    start(async () => {
      const r = await moveTicketAction(id, target as BoardTarget);
      if (r.error) { setCards(before); setMsg(r.error); }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: number, subject, SN, model, customer" style={{ maxWidth: 380 }} />
        <label className="row" style={{ cursor: "pointer" }}><input type="checkbox" style={{ width: "auto" }} checked={mine} onChange={(e) => setMine(e.target.checked)} /> My tickets</label>
        {!canEdit && <small>View only</small>}
      </div>
      {msg && <p className="err">{msg}</p>}
      <div className="board">
        {cols.map((col) => {
          const list = shown.filter((c) => colOf(c) === col.key);
          return (
            <div key={col.key} className={"kcol" + (over === col.key ? " over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }} onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, col.key); }}>
              <h3>{col.title} <span className="badge">{list.length}</span></h3>
              {list.map((c) => (
                <div key={c.id} className="kcard" draggable={movable(c)} onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                  style={{ cursor: movable(c) ? "grab" : "default" }}>
                  <a href={`/tickets/${c.id}`}><b>#{c.no}</b></a> {c.kind === "password_reset" && <span className="badge">Password reset</span>}
                  <div>{c.subject}</div>
                  <small>{c.customer}</small><br />
                  <small>SN {c.sn}{c.model ? ` · ${c.model}` : ""}</small>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <span className="badge">{c.priority}</span>
                    {c.fee && <span className="badge">{c.fee}</span>}
                    {c.assignee && <small>{c.mine ? "You" : c.assignee}</small>}
                  </div>
                  <small>{new Date(c.created).toLocaleDateString()}</small>
                  {movable(c) && (
                    <select aria-label="Move to" value="" onChange={(e) => { if (e.target.value) move(c.id, e.target.value); }} style={{ marginTop: 6 }}>
                      <option value="">Move to…</option>
                      {cols.filter((x) => x.key !== "new" && x.key !== colOf(c)).map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}
                    </select>
                  )}
                </div>
              ))}
              {list.length === 0 && <small>—</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
