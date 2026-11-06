"use client";
import { useState } from "react";
import Modal from "./Modal";
import DiskCalc from "./DiskCalc";
import UpsCalc from "./UpsCalc";
import type { L } from "./shared";

// The two boxes of the Calculator menu; each opens its calculator in a pop-up window.
export default function CalcHub({ L }: { L: L }) {
  const [open, setOpen] = useState<null | "disk" | "ups">(null);
  const box = (k: "disk" | "ups", title: string, desc: string, icon: string) => (
    <button type="button" onClick={() => setOpen(k)} className="card" style={{ textAlign: "left", cursor: "pointer", flex: "1 1 280px", margin: 0, display: "block", background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--line)", padding: 20, borderRadius: 12 }}>
      <div style={{ fontSize: 34 }} aria-hidden>{icon}</div>
      <h2 style={{ margin: "6px 0" }}>{title}</h2>
      <p style={{ margin: "0 0 10px", opacity: 0.8 }}>{desc}</p>
      <span className="btn" style={{ display: "inline-block" }}>{L.calcOpen}</span>
    </button>
  );
  return (
    <>
      <div className="row" style={{ gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
        {box("disk", L.calcDisk, L.calcDiskDesc, "💽")}
        {box("ups", L.calcUps, L.calcUpsDesc, "🔋")}
      </div>
      {open === "disk" && <Modal title={L.calcDisk} onClose={() => setOpen(null)} closeLabel={L.calcClose}><DiskCalc L={L} /></Modal>}
      {open === "ups" && <Modal title={L.calcUps} onClose={() => setOpen(null)} closeLabel={L.calcClose}><UpsCalc L={L} /></Modal>}
    </>
  );
}
