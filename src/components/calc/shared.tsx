"use client";
import type { ReactNode } from "react";

export type L = Record<string, string>;
export const n1 = (n: number, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
export const num = (v: string, d = 0) => { const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : d; };
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
export const dur = (min: number, L: L) => {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 120) return `${Math.round(min)} ${L.calcMin}`;
  const h = Math.floor(min / 60), m = Math.round(min - h * 60);
  return `${h} ${L.calcHours}${m ? ` ${m} ${L.calcMin}` : ""}`;
};
export const stamp = () => new Date().toLocaleString("en-GB", { timeZone: "Asia/Baku", dateStyle: "medium", timeStyle: "short" });
export const fileStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

export function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={{ display: "block", minWidth: 0 }}>{label}{children}</label>; }
export const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 } as const;

// The block that is turned into the PDF: always dark text on white, whatever theme the person uses.
export function Report({ id, title, brandLine, inputs, children, note, L }: { id: string; title: string; brandLine: string; inputs: [string, string][]; children: ReactNode; note: string; L: L }) {
  return (
    <div id={id} style={{ background: "#fff", color: "#111", padding: 20, borderRadius: 8, marginTop: 14, fontSize: 14, lineHeight: 1.45 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "2px solid #1d4ed8", paddingBottom: 8, marginBottom: 10 }}>
        <b style={{ fontSize: 18 }}>{title}</b><span style={{ color: "#444" }}>{brandLine} · {L.calcDate}: {stamp()}</span>
      </div>
      <b>{L.calcInputs}</b>
      <table style={{ width: "100%", borderCollapse: "collapse", margin: "4px 0 12px" }}><tbody>
        {inputs.map(([k, v]) => <tr key={k}><td style={{ padding: "2px 8px 2px 0", color: "#444", width: "62%" }}>{k}</td><td style={{ padding: "2px 0" }}>{v}</td></tr>)}
      </tbody></table>
      <b>{L.calcResults}</b>
      <div style={{ marginTop: 4 }}>{children}</div>
      <p style={{ marginTop: 14, fontSize: 12, color: "#555", borderTop: "1px solid #ddd", paddingTop: 8 }}>{note}</p>
    </div>
  );
}
export function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", borderBottom: "1px dotted #ccc", fontWeight: strong ? 700 : 400 }}><span>{k}</span><span style={{ textAlign: "right" }}>{v}</span></div>;
}
