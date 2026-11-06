import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export type Rep = { title: string; brand: string; date: string; inputs: [string, string][]; rows: [string, string, boolean?][]; msgs: { text: string; bad: boolean }[]; note: string; labels: { inputs: string; results: string; date: string } };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function reportHtml(r: Rep): string {
  const tr = (a: string, b: string, strong?: boolean) => `<tr style="${strong ? "font-weight:700" : ""}"><td style="padding:3px 8px 3px 0;border-bottom:1px dotted #ccc">${esc(a)}</td><td style="padding:3px 0;border-bottom:1px dotted #ccc;text-align:right">${esc(b)}</td></tr>`;
  return `<html><head><meta charset="utf-8"/></head><body style="font-family:Arial,Helvetica,sans-serif;color:#111;padding:24px;font-size:13px">
<div style="display:flex;justify-content:space-between;border-bottom:2px solid #1d4ed8;padding-bottom:8px;margin-bottom:12px"><b style="font-size:18px">${esc(r.title)}</b><span style="color:#444">${esc(r.brand)} · ${esc(r.labels.date)}: ${esc(r.date)}</span></div>
<b>${esc(r.labels.inputs)}</b><table style="width:100%;border-collapse:collapse;margin:4px 0 14px">${r.inputs.map(([a, b]) => tr(a, b)).join("")}</table>
<b>${esc(r.labels.results)}</b><table style="width:100%;border-collapse:collapse;margin:4px 0">${r.rows.map(([a, b, s]) => tr(a, b, s)).join("")}</table>
${r.msgs.map((m) => `<p style="font-weight:600;color:${m.bad ? "#b91c1c" : "#15803d"};margin:6px 0">${esc(m.text)}</p>`).join("")}
<p style="margin-top:16px;font-size:11px;color:#555;border-top:1px solid #ddd;padding-top:8px">${esc(r.note)}</p></body></html>`;
}

// Nothing is saved on the server; the PDF lives only in the phone's cache and is handed to the share sheet.
export async function sharePdf(r: Rep) {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(r) });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: r.title, UTI: "com.adobe.pdf" });
}
