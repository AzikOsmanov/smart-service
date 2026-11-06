import ExcelJS from "exceljs";
import { FORMS, KINDS, type CatDevice } from "@/lib/projects";
import type { StaffLabels } from "@/lib/i18n-staff";

// One column per catalog field. The first row of the Excel sheet holds these names; the importer reads them from there.
export const COLUMNS = ["brand", "kind", "model", "description", "form", "mpx", "lens_mm", "hfov_deg", "ir_range_m", "light_range_m", "night_modes", "audio", "series", "functions", "poe_w", "outdoor",
  "dori_detect_m", "dori_observe_m", "dori_recognize_m", "dori_identify_m", "channels", "bays", "max_tb_per_disk", "throughput_mbps", "ports", "poe_ports", "poe_budget_w", "notes"] as const;
export type Col = (typeof COLUMNS)[number];

const num = (v: string) => { const s = v.trim().replace(",", "."); const x = Number(s); return s !== "" && Number.isFinite(x) && x >= 0 ? x : null; };
const list = (s: string) => s.split(/[;|,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const oneOf = <T extends string>(v: string, allowed: readonly T[]): T | null => ((allowed as readonly string[]).includes(v) ? (v as T) : null);

export type CatRow = Record<string, string | string[] | boolean | number | null>;
// Turns one row of text cells (keyed by column name) into a database row, or null when brand/model are missing or wrong.
export function toCatRow(get: (k: string) => string, fnKeys: string[]): CatRow | null {
  const brand = oneOf(get("brand").trim().toLowerCase(), ["dahua", "unv"] as const), model = get("model").trim().slice(0, 120);
  if (!brand || !model) return null;
  return {
    brand, kind: oneOf(get("kind").trim().toLowerCase(), KINDS) ?? "camera", model, description: get("description").trim().slice(0, 300) || null,
    form: oneOf(get("form").trim().toLowerCase(), FORMS), mpx: num(get("mpx")), lens_mm: num(get("lens_mm")), hfov_deg: num(get("hfov_deg")), ir_range_m: num(get("ir_range_m")), light_range_m: num(get("light_range_m")),
    night_modes: list(get("night_modes")).filter((x) => x === "ir" || x === "color"), audio: oneOf(get("audio").trim().toLowerCase(), ["none", "mic", "two_way"] as const) ?? "none",
    series: get("series").trim().slice(0, 80) || null, functions: list(get("functions")).filter((a) => fnKeys.includes(a)), poe_w: num(get("poe_w")), outdoor: ["on", "yes", "true", "1", "y"].includes(get("outdoor").trim().toLowerCase()),
    dori_detect_m: num(get("dori_detect_m")), dori_observe_m: num(get("dori_observe_m")), dori_recognize_m: num(get("dori_recognize_m")), dori_identify_m: num(get("dori_identify_m")),
    channels: num(get("channels")), bays: num(get("bays")), max_tb_per_disk: num(get("max_tb_per_disk")), throughput_mbps: num(get("throughput_mbps")), ports: num(get("ports")), poe_ports: num(get("poe_ports")), poe_budget_w: num(get("poe_budget_w")),
    notes: get("notes").trim().slice(0, 500) || null,
  };
}

export async function buildWorkbook(devices: (CatDevice & { notes?: string | null })[], S: StaffLabels, template: boolean, fns: { key: string; grp: string; name: string; dahua: string | null; unv: string | null }[]): Promise<Buffer> {
  const L = (k: string) => (S as Record<string, string>)[k] ?? k;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Devices", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c, key: c, width: c === "model" || c === "description" || c === "notes" ? 30 : 14 }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  if (!template) {
    for (const d of devices) {
      const r = d as Record<string, unknown>;
      ws.addRow(COLUMNS.map((c) => {
        const v = r[c];
        if (Array.isArray(v)) return v.join(";");
        if (typeof v === "boolean") return v ? "yes" : "no";
        return v ?? "";
      }));
    }
  }
  // drop-down lists so typing mistakes are caught while filling the sheet
  const dv = (col: Col, values: readonly string[]) => {
    const letter = ws.getColumn(COLUMNS.indexOf(col) + 1).letter;
    for (let i = 2; i <= 1000; i++) ws.getCell(`${letter}${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`] };
  };
  dv("brand", ["dahua", "unv"]); dv("kind", KINDS); dv("form", FORMS); dv("audio", ["none", "mic", "two_way"]); dv("outdoor", ["yes", "no"]);

  const help = wb.addWorksheet("Help");
  help.columns = [{ header: "Column", key: "c", width: 22 }, { header: L("catHelpMeaning"), key: "m", width: 60 }, { header: L("catHelpValues"), key: "v", width: 70 }];
  help.getRow(1).font = { bold: true };
  const rows: [string, string, string][] = [
    ["brand", L("pmBrand"), "dahua | unv"], ["kind", L("catKind"), KINDS.join(" | ")], ["model", L("pmModel"), L("catHelpModel")], ["description", L("catDesc"), ""],
    ["form", L("pmForm"), FORMS.join(" | ")], ["mpx", "Mpx", L("catHelpNumber")], ["lens_mm", L("catLens"), L("catHelpNumber")], ["hfov_deg", L("catFov"), L("catHelpFov")],
    ["ir_range_m", L("catIr"), L("catHelpNumber")], ["light_range_m", L("catLight"), L("catHelpNumber")], ["night_modes", L("pmNightType"), "ir;color"], ["audio", L("pmAudio"), "none | mic | two_way"],
    ["series", L("catSeries"), ""], ["functions", L("fnTitle"), L("catHelpFunctions")], ["poe_w", L("catPoe"), L("catHelpNumber")], ["outdoor", L("catOutdoor"), "yes | no"],
    ["dori_detect_m", L("catDoriDetect"), L("catHelpNumber")], ["dori_observe_m", L("catDoriObserve"), L("catHelpNumber")], ["dori_recognize_m", L("catDoriRecognize"), L("catHelpNumber")], ["dori_identify_m", L("catDoriIdentify"), L("catHelpNumber")],
    ["channels", L("catChannels"), L("catHelpNvr")], ["bays", L("catBays"), L("catHelpNvr")], ["max_tb_per_disk", L("catMaxTb"), L("catHelpNvr")], ["throughput_mbps", L("catBw"), L("catHelpNvr")],
    ["ports", L("catPorts"), L("catHelpSwitch")], ["poe_ports", L("catPoePorts"), L("catHelpSwitch")], ["poe_budget_w", L("catPoeBudget"), L("catHelpSwitch")], ["notes", L("pmNotes"), ""],
  ];
  rows.forEach(([c, m, v]) => help.addRow([c, m, v]));
  help.addRow([]);
  help.addRow(["", L("catHelpUpdate"), ""]);
  const fw = wb.addWorksheet("Functions");
  fw.columns = [{ header: "key", key: "k", width: 26 }, { header: L("fnGroup"), key: "g", width: 22 }, { header: L("fnName"), key: "n", width: 44 }, { header: "Dahua", key: "d", width: 40 }, { header: "UNV", key: "u", width: 40 }];
  fw.getRow(1).font = { bold: true };
  for (const f of fns) fw.addRow([f.key, L("fnGrp_" + f.grp), f.name, f.dahua ?? "", f.unv ?? ""]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type ParsedSheet = { rows: { line: number; row: CatRow | null }[]; missing: string[] };
export async function parseWorkbook(buf: ArrayBuffer, fnKeys: string[]): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Devices") ?? wb.worksheets[0];
  if (!ws) return { rows: [], missing: ["brand", "model"] };
  const idx = new Map<string, number>();
  ws.getRow(1).eachCell((cell, i) => { idx.set(String(cell.text ?? "").trim().toLowerCase(), i); });
  const missing = ["brand", "model"].filter((k) => !idx.has(k));
  const rows: ParsedSheet["rows"] = [];
  const last = Math.min(ws.rowCount, 2001);
  for (let r = 2; r <= last; r++) {
    const row = ws.getRow(r);
    const get = (k: string) => { const i = idx.get(k); return i ? String(row.getCell(i).text ?? "").trim() : ""; };
    if (!COLUMNS.some((c) => get(c))) continue;   // empty line
    rows.push({ line: r, row: toCatRow(get, fnKeys) });
  }
  return { rows, missing };
}
