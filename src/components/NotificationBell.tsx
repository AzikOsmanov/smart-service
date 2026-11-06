"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDT } from "@/lib/fmt-time";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { notifHref, notifLabels, notifText, type Notif } from "@/lib/notif-text";

export default function NotificationBell({ userId, lang, initial, initialUnread }: { userId: string; lang: string; initial: Notif[]; initialUnread: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const lb = notifLabels(lang);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data }, { count }] = await Promise.all([
      sb.from("notifications").select("id,kind,ticket_id,data,created_at,read_at").order("created_at", { ascending: false }).limit(20),
      sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (data) setItems(data as Notif[]);
    if (typeof count === "number") setUnread(count);
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => { load(); router.refresh(); })
      .subscribe();
    const timer = setInterval(load, 60000);
    return () => { sb.removeChannel(ch); clearInterval(timer); };
  }, [userId, load, router]);

  useEffect(() => {
    function away(e: MouseEvent) { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  async function openItem(n: Notif) {
    setOpen(false);
    if (!n.read_at) {
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      await supabaseBrowser().rpc("notifications_mark_read", { p_ids: [n.id] });
    }
    router.push(notifHref(n));
  }
  async function markAll() {
    setItems((p) => p.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
    await supabaseBrowser().rpc("notifications_mark_read", { p_ids: null });
  }

  return (
    <div className="bell" ref={box}>
      <button type="button" className="bell-btn" aria-label={lb.title} onClick={() => { setOpen((o) => !o); if (!open) load(); }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-menu">
          <div className="bell-head"><b>{lb.title}</b>{unread > 0 && <button type="button" className="bell-link" onClick={markAll}>{lb.markAll}</button>}</div>
          {items.length === 0 && <p className="bell-empty">{lb.empty}</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" className={"bell-item" + (n.read_at ? "" : " unread")} onClick={() => openItem(n)}>
                  <span>{notifText(lang, n)}</span>
                  <small>{fmtDT(n.created_at)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
