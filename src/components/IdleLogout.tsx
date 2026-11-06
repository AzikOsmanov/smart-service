"use client";
import { useEffect, useRef, useState } from "react";
import { idleSignOut } from "@/lib/idle-actions";

type Labels = { title: string; body: string; stay: string };
const KEY = "ss_last_activity";   // shared by all tabs of this browser
const WARN_MS = 60000;

// Signs the person out after `minutes` without mouse, keyboard, touch or scroll, in every open tab of this browser.
export default function IdleLogout({ minutes, labels }: { minutes: number; labels: Labels }) {
  const [left, setLeft] = useState<number | null>(null);
  const lastWrite = useRef(0), lastPing = useRef(0), ending = useRef(false);
  const limit = minutes * 60000;

  const read = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
  const mark = (force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite.current < 3000) return;
    lastWrite.current = now;
    try { localStorage.setItem(KEY, String(now)); } catch { /* storage blocked: this tab still counts on its own */ }
    if (now - lastPing.current > 60000) { lastPing.current = now; fetch("/api/activity", { method: "POST", keepalive: true }).catch(() => {}); }
  };

  useEffect(() => {
    mark(true);
    const own = { t: Date.now() };   // fallback when storage is blocked
    const act = () => { own.t = Date.now(); mark(); };
    const evs = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
    evs.forEach((e) => window.addEventListener(e, act, { passive: true }));
    const tick = async () => {
      if (ending.current) return;
      const last = Math.max(read(), own.t);
      const idle = Date.now() - last;
      if (idle >= limit) {
        ending.current = true;
        try { await idleSignOut(); } catch { /* the server also ends idle sessions on the next request */ }
        window.location.href = "/login?e=idle";
      } else if (idle >= limit - WARN_MS) setLeft(Math.max(1, Math.ceil((limit - idle) / 1000)));
      else setLeft(null);
    };
    const iv = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { evs.forEach((e) => window.removeEventListener(e, act)); clearInterval(iv); document.removeEventListener("visibilitychange", tick); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  if (left === null) return null;
  return (
    <div role="alertdialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div className="card" style={{ maxWidth: 380, margin: 16 }}>
        <h2>{labels.title}</h2>
        <p>{labels.body.replace("{s}", String(left))}</p>
        <button onClick={() => { mark(true); setLeft(null); }}>{labels.stay}</button>
      </div>
    </div>
  );
}
