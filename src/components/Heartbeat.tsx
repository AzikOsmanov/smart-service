"use client";
import { useEffect } from "react";
import { heartbeat } from "@/lib/presence";

// Keeps "online" status fresh while the page is open and visible.
export default function Heartbeat() {
  useEffect(() => {
    const ping = () => { if (document.visibilityState === "visible") heartbeat().catch(() => {}); };
    ping();
    const t = setInterval(ping, 60000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", ping); };
  }, []);
  return null;
}
