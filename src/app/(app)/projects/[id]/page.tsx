import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getStaff, type SKey } from "@/lib/i18n-staff";
import { pmCtx } from "@/lib/pm-ctx";
import { fmtDT } from "@/lib/fmt-time";
import { AI_OPTIONS, FORMS, GOALS, matchPoint, type CatDevice, type Point } from "@/lib/projects";
import PdfButton from "@/components/PdfButton";

const numOrNull = (v: FormDataEntryValue | null) => { const x = Number(String(v ?? "").replace(",", ".")); return String(v ?? "").trim() !== "" && Number.isFinite(x) && x >= 0 ? x : null; };
const pick = <T extends string>(v: FormDataEntryValue | null, allowed: readonly T[], d: T): T => ((allowed as readonly string[]).includes(String(v)) ? (String(v) as T) : d);

async function savePoint(fd: FormData) {
  "use server";
  const c = await pmCtx();
  const pid = String(fd.get("project"));
  if (!c.canEditProjects) redirect(`/projects/${pid}`);
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  if (!name) redirect(`/projects/${pid}`);
  const row = {
    name, env: pick(fd.get("env"), ["indoor", "outdoor"] as const, "outdoor"), mount_h_m: numOrNull(fd.get("mount_h_m")), dist_m: numOrNull(fd.get("dist_m")), width_m: numOrNull(fd.get("width_m")),
    goal: pick(fd.get("goal"), GOALS, "recognize"), night_m: numOrNull(fd.get("night_m")), night_type: pick(fd.get("night_type"), ["any", "ir", "color"] as const, "any"),
    min_mpx: numOrNull(fd.get("min_mpx")), audio: pick(fd.get("audio"), ["none", "mic", "two_way"] as const, "none"),
    ai: fd.getAll("ai").map(String).filter((a) => (AI_OPTIONS as readonly string[]).includes(a)), form: (FORMS as readonly string[]).includes(String(fd.get("form"))) ? String(fd.get("form")) : null,
    qty: Math.min(500, Math.max(1, Math.round(numOrNull(fd.get("qty")) ?? 1))), notes: String(fd.get("notes") ?? "").trim().slice(0, 1000) || null, updated_at: new Date().toISOString(),
  };
  const id = String(fd.get("id") ?? "");
  const r = id
    ? await c.sb.from("project_points").update({ ...row, chosen_device_id: null }).eq("id", id).eq("project_id", pid)
    : await c.sb.from("project_points").insert({ ...row, tenant_id: c.tenantId, project_id: pid });
  if (r.error) redirect(`/projects/${pid}?error=${encodeURIComponent(r.error.message)}`);
  revalidatePath(`/projects/${pid}`);
  redirect(`/projects/${pid}`);
}
async function chooseDevice(fd: FormData) {
  "use server";
  const c = await pmCtx();
  const pid = String(fd.get("project")), id = String(fd.get("id")), dev = String(fd.get("device") ?? "");
  if (!c.canEditProjects) redirect(`/projects/${pid}`);
  await c.sb.from("project_points").update({ chosen_device_id: /^[0-9a-f-]{36}$/i.test(dev) ? dev : null, updated_at: new Date().toISOString() }).eq("id", id).eq("project_id", pid);
  revalidatePath(`/projects/${pid}`);
  redirect(`/projects/${pid}`);
}
async function deletePoint(fd: FormData) {
  "use server";
  const c = await pmCtx();
  const pid = String(fd.get("project"));
  if (!c.canEditProjects) redirect(`/projects/${pid}`);
  await c.sb.from("project_points").update({ deleted_at: new Date().toISOString() }).eq("id", String(fd.get("id"))).eq("project_id", pid);
  revalidatePath(`/projects/${pid}`);
  redirect(`/projects/${pid}`);
}
async function setBrand(fd: FormData) {
  "use server";
  const c = await pmCtx();
  const pid = String(fd.get("project"));
  if (!c.canEditProjects) redirect(`/projects/${pid}`);
  await c.sb.from("projects").update({ brand_pref: pick(fd.get("brand"), ["any", "dahua", "unv"] as const, "any"), updated_at: new Date().toISOString() }).eq("id", pid);
  revalidatePath(`/projects/${pid}`);
  redirect(`/projects/${pid}`);
}
async function deleteProject(fd: FormData) {
  "use server";
  const c = await pmCtx();
  const pid = String(fd.get("project"));
  if (!c.canDeleteProjects) redirect(`/projects/${pid}`);
  await c.sb.from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", pid);
  redirect("/projects");
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { id } = await params;
  const { edit, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await pmCtx();
  if (!c.canProjects) redirect("/tickets");
  const { S } = await getStaff();
  const { data: project } = await c.sb.from("projects").select("id,name,client,address,brand_pref,created_at,created_by").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!project) notFound();
  const [{ data: ptsRaw }, { data: devs }] = await Promise.all([
    c.sb.from("project_points").select("*").eq("project_id", id).is("deleted_at", null).order("created_at"),
    c.sb.from("catalog_devices").select("id,brand,kind,model,description,form,mpx,lens_mm,hfov_deg,ir_range_m,night_modes,audio,ai,poe_w,outdoor").is("deleted_at", null),
  ]);
  const pts = (ptsRaw ?? []) as (Point & { project_id: string })[];
  const catalog = (devs ?? []) as CatDevice[];
  const cams = catalog.filter((d) => d.kind === "camera");
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const editing = pts.find((p) => p.id === edit) ?? null;
  const L = (k: string) => (S as Record<string, string>)[k] ?? k;
  const fmtN = (n: number | null) => (n == null ? "—" : String(Number(n.toFixed(1))));

  // bill of materials: models and quantities only
  const bom = new Map<string, { device: CatDevice; qty: number; points: string[] }>();
  let open = 0;
  for (const p of pts) {
    const d = p.chosen_device_id ? byId.get(p.chosen_device_id) : null;
    if (!d) { open++; continue; }
    const row = bom.get(d.id) ?? { device: d, qty: 0, points: [] };
    row.qty += p.qty; row.points.push(p.name); bom.set(d.id, row);
  }
  const bomRows = Array.from(bom.values()).sort((a, b) => a.device.model.localeCompare(b.device.model));
  const goalName = (g: string) => L("pmGoal_" + g);

  return (
    <div>
      <p><Link href="/projects">← {S.pmTitle}</Link></p>
      <div className="card">
        <h1>{project.name}</h1>
        <p>{[project.client, project.address].filter(Boolean).join(" · ") || "—"} · {fmtDT(project.created_at)}</p>
        {error && <p className="err">{error}</p>}
        {c.canEditProjects && (
          <form action={setBrand} className="row" style={{ gap: 8, alignItems: "end" }}>
            <input type="hidden" name="project" value={id} />
            <label>{S.pmBrand}<select name="brand" defaultValue={project.brand_pref}><option value="any">{S.pmBrandAny}</option><option value="dahua">Dahua</option><option value="unv">Uniview (UNV)</option></select></label>
            <button className="btn ghost">{S.save}</button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>{editing ? S.pmEditPoint : S.pmAddPoint}</h2>
        {c.canEditProjects ? (
          <form action={savePoint} key={editing?.id ?? "new"}>
            <input type="hidden" name="project" value={id} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
              <label>{S.pmPointName}<input name="name" required maxLength={120} defaultValue={editing?.name ?? ""} /></label>
              <label>{S.pmEnv}<select name="env" defaultValue={editing?.env ?? "outdoor"}><option value="outdoor">{S.pmOutdoor}</option><option value="indoor">{S.pmIndoor}</option></select></label>
              <label>{S.pmHeight}<input name="mount_h_m" inputMode="decimal" defaultValue={editing?.mount_h_m ?? ""} /></label>
              <label>{S.pmDist}<input name="dist_m" inputMode="decimal" defaultValue={editing?.dist_m ?? ""} /></label>
              <label>{S.pmWidth}<input name="width_m" inputMode="decimal" defaultValue={editing?.width_m ?? ""} /></label>
              <label>{S.pmGoal}<select name="goal" defaultValue={editing?.goal ?? "recognize"}>{GOALS.map((g) => <option key={g} value={g}>{goalName(g)}</option>)}</select></label>
              <label>{S.pmNight}<input name="night_m" inputMode="decimal" defaultValue={editing?.night_m ?? ""} /></label>
              <label>{S.pmNightType}<select name="night_type" defaultValue={editing?.night_type ?? "any"}><option value="any">{S.pmNightAny}</option><option value="ir">{S.pmNightIr}</option><option value="color">{S.pmNightColor}</option></select></label>
              <label>{S.pmMinMpx}<input name="min_mpx" inputMode="decimal" defaultValue={editing?.min_mpx ?? ""} /></label>
              <label>{S.pmAudio}<select name="audio" defaultValue={editing?.audio ?? "none"}><option value="none">{S.pmAudioNone}</option><option value="mic">{S.pmAudioMic}</option><option value="two_way">{S.pmAudioTwo}</option></select></label>
              <label>{S.pmForm}<select name="form" defaultValue={editing?.form ?? "any"}><option value="any">{S.pmFormAny}</option>{FORMS.map((f) => <option key={f} value={f}>{L("pmForm_" + f)}</option>)}</select></label>
              <label>{S.pmQty}<input name="qty" type="number" min={1} max={500} defaultValue={editing?.qty ?? 1} /></label>
            </div>
            <fieldset style={{ margin: "10px 0" }}><legend>{S.pmAi}</legend>
              <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                {AI_OPTIONS.map((a) => <label key={a} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="ai" value={a} defaultChecked={editing?.ai?.includes(a) ?? false} style={{ width: "auto" }} />{L("pmAi_" + a)}</label>)}
              </div>
            </fieldset>
            <label>{S.pmNotes}<textarea name="notes" rows={2} maxLength={1000} defaultValue={editing?.notes ?? ""} /></label>
            <div className="row" style={{ gap: 8 }}><button>{S.pmSavePoint}</button>{editing && <Link className="btn ghost" href={`/projects/${id}`}>{S.pmCancel}</Link>}</div>
          </form>
        ) : <p>{S.pmReadOnly}</p>}
      </div>

      {pts.length === 0 && <div className="card"><p>{S.pmNoPoints}</p></div>}
      {pts.map((p, i) => {
        const ms = matchPoint(p, catalog, project.brand_pref);
        const good = ms.filter((m) => m.ok).slice(0, 5), shown = good.length ? good : ms.slice(0, 3);
        const chosen = p.chosen_device_id ? byId.get(p.chosen_device_id) : null;
        return (
          <div className="card" key={p.id}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{i + 1}. {p.name} <small>× {p.qty}</small></h2>
              {c.canEditProjects && (
                <div className="row" style={{ gap: 8 }}>
                  <Link className="btn ghost" href={`/projects/${id}?edit=${p.id}`}>{S.edit}</Link>
                  <form action={deletePoint}><input type="hidden" name="project" value={id} /><input type="hidden" name="id" value={p.id} /><button className="btn ghost">{S.delete}</button></form>
                </div>
              )}
            </div>
            <p style={{ margin: "6px 0" }}><small>
              {p.env === "indoor" ? S.pmIndoor : S.pmOutdoor} · {S.pmHeight}: {fmtN(p.mount_h_m)} · {S.pmDist}: {fmtN(p.dist_m)} · {S.pmWidth}: {fmtN(p.width_m)} · {goalName(p.goal)} · {S.pmNight}: {fmtN(p.night_m)} ({p.night_type === "ir" ? S.pmNightIr : p.night_type === "color" ? S.pmNightColor : S.pmNightAny}) · {S.pmAudio}: {p.audio === "two_way" ? S.pmAudioTwo : p.audio === "mic" ? S.pmAudioMic : S.pmAudioNone}
              {p.ai.length ? ` · ${p.ai.map((a) => L("pmAi_" + a)).join(", ")}` : ""}{p.notes ? ` · ${p.notes}` : ""}
            </small></p>
            {chosen && <div style={{ margin: "6px 0" }}><b>{S.pmChosen}: {chosen.brand === "dahua" ? "Dahua" : "UNV"} {chosen.model}</b>{c.canEditProjects && <form action={chooseDevice} style={{ display: "inline", marginLeft: 8 }}><input type="hidden" name="project" value={id} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="device" value="" /><button className="btn ghost">{S.pmClear}</button></form>}</div>}
            {cams.length === 0 ? <p>{S.pmEmptyCat}</p> : (
              <>
                <b>{good.length ? S.pmSuggested : S.pmNoMatch}</b>
                <table><thead><tr><th>{S.pmModel}</th><th>Mpx</th><th>{S.catLens}</th><th>{S.catIr}</th><th>px/m</th><th></th></tr></thead><tbody>
                  {shown.map((m) => (
                    <tr key={m.device.id}>
                      <td><b>{m.device.brand === "dahua" ? "Dahua" : "UNV"} {m.device.model}</b>{m.device.description && <><br /><small>{m.device.description}</small></>}
                        {!m.ok && <><br /><small className="err">{m.fails.map((f) => L("pmFail_" + f)).join(", ")}</small></>}</td>
                      <td>{m.device.mpx ?? "—"}</td><td>{m.device.lens_mm ?? "—"}</td><td>{m.device.ir_range_m ?? "—"}</td>
                      <td>{m.ppm != null ? `${Math.round(m.ppm)} / ${m.needPpm}` : "—"}</td>
                      <td>{c.canEditProjects && chosen?.id !== m.device.id && <form action={chooseDevice}><input type="hidden" name="project" value={id} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="device" value={m.device.id} /><button className="btn">{S.pmChoose}</button></form>}</td>
                    </tr>
                  ))}
                </tbody></table>
                <p><small>{S.pmPpmNote}</small></p>
              </>
            )}
          </div>
        );
      })}

      <div className="card">
        <h2>{S.pmBom}</h2>
        <div id="bom-report" style={{ background: "#fff", color: "#111", padding: 20, borderRadius: 8, fontSize: 14 }}>
          <div style={{ borderBottom: "2px solid #1d4ed8", paddingBottom: 8, marginBottom: 10 }}>
            <b style={{ fontSize: 18 }}>{project.name}</b><br />
            <span style={{ color: "#444" }}>{[project.client, project.address].filter(Boolean).join(" · ")} · {fmtDT(new Date())}</span>
          </div>
          {bomRows.length === 0 ? <p>{S.pmBomNone}</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #999" }}><th style={{ padding: "4px 6px" }}>#</th><th>{S.pmModel}</th><th>{S.pmPointsCol}</th><th style={{ textAlign: "right" }}>{S.pmQtyCol}</th></tr></thead>
              <tbody>{bomRows.map((r, i) => (
                <tr key={r.device.id} style={{ borderBottom: "1px dotted #ccc" }}><td style={{ padding: "4px 6px" }}>{i + 1}</td><td><b>{r.device.brand === "dahua" ? "Dahua" : "UNV"} {r.device.model}</b></td><td>{r.points.join(", ")}</td><td style={{ textAlign: "right" }}><b>{r.qty}</b></td></tr>
              ))}</tbody>
            </table>
          )}
          {open > 0 && <p style={{ color: "#b91c1c" }}>{S.pmBomOpen.replace("{n}", String(open))}</p>}
        </div>
        {bomRows.length > 0 && <div style={{ marginTop: 12 }}><PdfButton targetId="bom-report" fileName={`project-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pdf`} label={S.pmPdf} busyLabel={S.pmPdfBusy} /></div>}
      </div>

      {c.canDeleteProjects && (
        <form action={deleteProject} className="card"><input type="hidden" name="project" value={id} /><button className="btn ghost">{S.pmDeleteProject}</button></form>
      )}
    </div>
  );
}
