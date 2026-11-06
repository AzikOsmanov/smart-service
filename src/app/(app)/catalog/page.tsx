import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getStaff } from "@/lib/i18n-staff";
import { pmCtx } from "@/lib/pm-ctx";
import { AI_OPTIONS, FORMS, KINDS } from "@/lib/projects";

const num = (v: FormDataEntryValue | string | null | undefined) => { const s = String(v ?? "").trim().replace(",", "."); const x = Number(s); return s !== "" && Number.isFinite(x) && x >= 0 ? x : null; };
const list = (s: string) => s.split(/[;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const oneOf = <T extends string>(v: string, allowed: readonly T[]): T | null => ((allowed as readonly string[]).includes(v) ? (v as T) : null);

type Row = Record<string, string | string[] | boolean | number | null>;
function rowFrom(get: (k: string) => string, getAll: (k: string) => string[]): Row | null {
  const brand = oneOf(get("brand").toLowerCase(), ["dahua", "unv"] as const), model = get("model").trim().slice(0, 120);
  if (!brand || !model) return null;
  return {
    brand, kind: oneOf(get("kind").toLowerCase(), KINDS) ?? "camera", model, description: get("description").trim().slice(0, 300) || null, form: oneOf(get("form").toLowerCase(), FORMS),
    mpx: num(get("mpx")), lens_mm: num(get("lens_mm")), hfov_deg: num(get("hfov_deg")), ir_range_m: num(get("ir_range_m")),
    night_modes: getAll("night_modes").filter((x) => x === "ir" || x === "color"), audio: oneOf(get("audio").toLowerCase(), ["none", "mic", "two_way"] as const) ?? "none",
    ai: getAll("ai").filter((a) => (AI_OPTIONS as readonly string[]).includes(a)), poe_w: num(get("poe_w")), outdoor: ["on", "yes", "true", "1"].includes(get("outdoor").toLowerCase()),
    channels: num(get("channels")), bays: num(get("bays")), max_tb_per_disk: num(get("max_tb_per_disk")), throughput_mbps: num(get("throughput_mbps")), ports: num(get("ports")), poe_ports: num(get("poe_ports")), poe_budget_w: num(get("poe_budget_w")),
  };
}

async function saveDevice(fd: FormData) {
  "use server";
  const c = await pmCtx();
  if (!c.canEditCatalog) redirect("/catalog");
  const r = rowFrom((k) => String(fd.get(k) ?? ""), (k) => fd.getAll(k).map(String));
  if (!r) redirect("/catalog");
  const id = String(fd.get("id") ?? "");
  const res = id ? await c.sb.from("catalog_devices").update({ ...r, updated_at: new Date().toISOString() }).eq("id", id) : await c.sb.from("catalog_devices").insert({ ...r, tenant_id: c.tenantId, created_by: c.uid });
  if (res.error) redirect("/catalog?error=" + encodeURIComponent(res.error.message));
  revalidatePath("/catalog");
  redirect("/catalog");
}
async function deleteDevice(fd: FormData) {
  "use server";
  const c = await pmCtx();
  if (!c.canDeleteCatalog) redirect("/catalog");
  await c.sb.from("catalog_devices").update({ deleted_at: new Date().toISOString() }).eq("id", String(fd.get("id")));
  revalidatePath("/catalog");
  redirect("/catalog");
}
// CSV: first line = column names (brand, kind, model, description, form, mpx, lens_mm, hfov_deg, ir_range_m, night_modes, audio, ai, poe_w, outdoor, channels, bays, max_tb_per_disk, throughput_mbps, ports, poe_ports, poe_budget_w); lists use ";".
async function importCsv(fd: FormData) {
  "use server";
  const c = await pmCtx();
  if (!c.canEditCatalog) redirect("/catalog");
  const text = String(fd.get("csv") ?? "").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) redirect("/catalog");
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const split = (l: string) => {
    if (sep === "\t") return l.split("\t");
    const out: string[] = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out;
  };
  const head = split(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, unknown>[] = [];
  for (const l of lines.slice(1, 501)) {
    const cells = split(l), m: Record<string, string> = {};
    head.forEach((h, i) => { m[h] = (cells[i] ?? "").trim(); });
    const r = rowFrom((k) => m[k] ?? "", (k) => (k === "ai" || k === "night_modes" ? list(m[k] ?? "") : []));
    if (r) rows.push({ ...r, tenant_id: c.tenantId, created_by: c.uid });
  }
  if (rows.length) {
    const res = await c.sb.from("catalog_devices").insert(rows);
    if (res.error) redirect("/catalog?error=" + encodeURIComponent(res.error.message));
  }
  revalidatePath("/catalog");
  redirect("/catalog?ok=" + rows.length);
}

export default async function Catalog({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; edit?: string; brand?: string; kind?: string }> }) {
  const { error, ok, edit, brand, kind } = await searchParams;
  const c = await pmCtx();
  if (!c.canCatalog) redirect("/tickets");
  const { S } = await getStaff();
  const L = (k: string) => (S as Record<string, string>)[k] ?? k;
  let q = c.sb.from("catalog_devices").select("*").is("deleted_at", null).order("brand").order("kind").order("model").limit(1000);
  if (brand === "dahua" || brand === "unv") q = q.eq("brand", brand);
  if (kind && (KINDS as readonly string[]).includes(kind)) q = q.eq("kind", kind);
  const { data: rows } = await q;
  const editing = (rows ?? []).find((r) => r.id === edit) ?? null;
  const dv = (k: string) => (editing ? ((editing as Record<string, unknown>)[k] ?? "") as string | number : "");
  const nf = (k: string, label: string) => <label>{label}<input name={k} inputMode="decimal" defaultValue={dv(k)} /></label>;
  return (
    <div>
      <h1>{S.catTitle}</h1>
      {error && <p className="err">{error}</p>}
      {ok && <p>{S.catImported.replace("{n}", ok)}</p>}
      {c.canEditCatalog && (
        <form action={saveDevice} className="card" key={editing?.id ?? "new"}>
          <h2>{editing ? S.catEdit : S.catAdd}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <label>{S.pmBrand}<select name="brand" defaultValue={editing?.brand ?? "dahua"}><option value="dahua">Dahua</option><option value="unv">Uniview (UNV)</option></select></label>
            <label>{S.catKind}<select name="kind" defaultValue={editing?.kind ?? "camera"}>{KINDS.map((k) => <option key={k} value={k}>{L("catKind_" + k)}</option>)}</select></label>
            <label>{S.pmModel}<input name="model" required maxLength={120} defaultValue={dv("model")} /></label>
            <label>{S.catDesc}<input name="description" maxLength={300} defaultValue={dv("description")} /></label>
            <label>{S.pmForm}<select name="form" defaultValue={editing?.form ?? ""}><option value="">—</option>{FORMS.map((f) => <option key={f} value={f}>{L("pmForm_" + f)}</option>)}</select></label>
            {nf("mpx", "Mpx")}{nf("lens_mm", S.catLens)}{nf("hfov_deg", S.catFov)}{nf("ir_range_m", S.catIr)}{nf("poe_w", S.catPoe)}
            <label>{S.pmAudio}<select name="audio" defaultValue={editing?.audio ?? "none"}><option value="none">{S.pmAudioNone}</option><option value="mic">{S.pmAudioMic}</option><option value="two_way">{S.pmAudioTwo}</option></select></label>
            {nf("channels", S.catChannels)}{nf("bays", S.catBays)}{nf("max_tb_per_disk", S.catMaxTb)}{nf("throughput_mbps", S.catBw)}{nf("ports", S.catPorts)}{nf("poe_ports", S.catPoePorts)}{nf("poe_budget_w", S.catPoeBudget)}
          </div>
          <div className="row" style={{ gap: 16, flexWrap: "wrap", margin: "10px 0" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="outdoor" defaultChecked={editing?.outdoor ?? false} style={{ width: "auto" }} />{S.catOutdoor}</label>
            {(["ir", "color"] as const).map((n) => <label key={n} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="night_modes" value={n} defaultChecked={editing?.night_modes?.includes(n) ?? false} style={{ width: "auto" }} />{n === "ir" ? S.pmNightIr : S.pmNightColor}</label>)}
          </div>
          <div className="row" style={{ gap: 14, flexWrap: "wrap", margin: "0 0 10px" }}>
            {AI_OPTIONS.map((a) => <label key={a} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="ai" value={a} defaultChecked={editing?.ai?.includes(a) ?? false} style={{ width: "auto" }} />{L("pmAi_" + a)}</label>)}
          </div>
          <div className="row" style={{ gap: 8 }}><button>{S.save}</button>{editing && <Link className="btn ghost" href="/catalog">{S.pmCancel}</Link>}</div>
        </form>
      )}
      {c.canEditCatalog && (
        <form action={importCsv} className="card">
          <h2>{S.catImport}</h2>
          <p><small>{S.catImportHint}</small></p>
          <textarea name="csv" rows={5} placeholder="brand,kind,model,description,form,mpx,lens_mm,hfov_deg,ir_range_m,night_modes,audio,ai,poe_w,outdoor" />
          <button>{S.catImport}</button>
        </form>
      )}
      <div className="card">
        <form className="row" method="get" style={{ gap: 8 }}>
          <select name="brand" defaultValue={brand ?? ""}><option value="">{S.pmBrand}</option><option value="dahua">Dahua</option><option value="unv">Uniview (UNV)</option></select>
          <select name="kind" defaultValue={kind ?? ""}><option value="">{S.catKind}</option>{KINDS.map((k) => <option key={k} value={k}>{L("catKind_" + k)}</option>)}</select>
          <button>{S.filter}</button>
        </form>
        <table>
          <thead><tr><th>{S.pmBrand}</th><th>{S.catKind}</th><th>{S.pmModel}</th><th>Mpx</th><th>{S.catLens}</th><th>{S.catIr}</th><th>{S.pmAudio}</th><th>{S.pmAi}</th><th></th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.brand === "dahua" ? "Dahua" : "UNV"}</td><td>{L("catKind_" + r.kind)}</td><td><b>{r.model}</b>{r.description && <><br /><small>{r.description}</small></>}</td>
                <td>{r.mpx ?? "—"}</td><td>{r.lens_mm ?? "—"}</td><td>{r.ir_range_m ?? "—"}</td><td>{r.audio === "two_way" ? S.pmAudioTwo : r.audio === "mic" ? S.pmAudioMic : "—"}</td>
                <td>{(r.ai as string[]).map((a) => L("pmAi_" + a)).join(", ") || "—"}</td>
                <td className="row" style={{ gap: 6 }}>
                  {c.canEditCatalog && <Link className="btn ghost" href={`/catalog?edit=${r.id}`}>{S.edit}</Link>}
                  {c.canDeleteCatalog && <form action={deleteDevice}><input type="hidden" name="id" value={r.id} /><button className="btn ghost">{S.delete}</button></form>}
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && <tr><td colSpan={9}>{S.catNone}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
