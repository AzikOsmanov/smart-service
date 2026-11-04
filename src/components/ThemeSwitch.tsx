"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

function apply(mode: Mode) {
  const el = document.documentElement;
  if (mode === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", mode);
}

export default function ThemeSwitch({ labels }: { labels: { system: string; light: string; dark: string; theme: string } }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try { const v = localStorage.getItem("theme"); if (v === "light" || v === "dark") setMode(v); } catch {}
  }, []);
  function choose(m: Mode) {
    setMode(m);
    apply(m);
    try { m === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", m); } catch {}
  }
  return (
    <select className="ctl" aria-label={labels.theme} value={mode} onChange={(e) => choose(e.target.value as Mode)}>
      <option value="system">{labels.system}</option>
      <option value="light">{labels.light}</option>
      <option value="dark">{labels.dark}</option>
    </select>
  );
}
