import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { FN_GROUPS, fnName, useFunctions, usePmAccess, type Fn } from "@/lib/pm";
import { CAT_COLS, DISK_SIZES, FORMS, GOALS, matchPoint, planSystem, type CatDevice, type Point } from "@/lib/projects";
import { sharePdf, type Rep } from "@/lib/calcpdf";
import { Btn, Card, Choice, Err, Field, H2, Loading, Row, Screen, Txt } from "@/components/ui";

type Proj = { id: string; name: string; client: string | null; address: string | null; brand_pref: string; rec_days: number; disk_tb: number; raid: string; ups_minutes: number; rec_functions: string[] | null };
type PointRow = Point & { project_id: string };
type Form = { id: string; name: string; env: string; mount_h_m: string; dist_m: string; width_m: string; goal: string; night_m: string; night_type: string; min_mpx: string; audio: string; form: string; qty: string; notes: string; functions: string[] };
const blank: Form = { id: "", name: "", env: "outdoor", mount_h_m: "", dist_m: "", width_m: "", goal: "recognize", night_m: "", night_type: "any", min_mpx: "", audio: "none", form: "any", qty: "1", notes: "", functions: [] };
const num = (v: string): number | null => { const s = v.trim().replace(",", "."); const x = Number(s); return s !== "" && Number.isFinite(x) && x >= 0 ? x : null; };
const nf = (n: number | null) => (n == null ? "—" : String(Number(n.toFixed(1))));
const nf1 = (n: number, d = 1) => Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
const brandName = (b: string) => (b === "dahua" ? "Dahua" : "UNV");

// Tick-list of functions, grouped; groups with something ticked start open.
function FnTicks({ fns, selected, onChange, scopes, skipFamily }: { fns: Fn[]; selected: string[]; onChange: (v: string[]) => void; scopes: string[]; skipFamily?: boolean }) {
  const { t, lang, c } = usePrefs();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const list = fns.filter((f) => f.kind === "function" && scopes.includes(f.scope));
  return (
    <View style={{ gap: 4 }}>
      {FN_GROUPS.filter((g) => !(skipFamily && g === "family")).map((g) => {
        const items = list.filter((f) => f.grp === g);
        if (!items.length) return null;
        const n = items.filter((f) => selected.includes(f.key)).length;
        const isOpen = open[g] ?? n > 0;
        return (
          <View key={g}>
            <Pressable onPress={() => setOpen({ ...open, [g]: !isOpen })} style={{ paddingVertical: 8 }}>
              <Text style={{ color: c.fg, fontWeight: "700" }}>{isOpen ? "▾" : "▸"} {t(`x_fnGrp_${g}` as never)}{n ? ` (${n})` : ""}</Text>
            </Pressable>
            {isOpen && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 6 }}>
                {items.map((f) => {
                  const on = selected.includes(f.key);
                  return (
                    <Pressable key={f.key} onPress={() => onChange(on ? selected.filter((k) => k !== f.key) : [...selected, f.key])} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: on ? c.accent : c.chipBg }}>
                      <Text style={{ color: on ? c.accentFg : c.fg, fontSize: 13 }}>{on ? "✓ " : ""}{fnName(f, lang)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, c } = usePrefs();
  const { profile } = useAuth();
  const acc = usePmAccess();
  const fns = useFunctions();
  const [project, setProject] = useState<Proj | null>(null);
  const [pts, setPts] = useState<PointRow[]>([]);
  const [catalog, setCatalog] = useState<CatDevice[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [recFns, setRecFns] = useState<string[]>([]);
  const [sys, setSys] = useState({ days: "30", disk: 4, raid: "none", ups: "30" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: pr }, { data: cat }] = await Promise.all([
      sb.from("projects").select("id,name,client,address,brand_pref,rec_days,disk_tb,raid,ups_minutes,rec_functions").eq("id", id).is("deleted_at", null).maybeSingle(),
      sb.from("project_points").select("*").eq("project_id", id).is("deleted_at", null).order("created_at"),
      sb.from("catalog_devices").select(CAT_COLS).is("deleted_at", null),
    ]);
    const proj = (p as Proj | null) ?? null;
    setProject(proj); setPts((pr ?? []) as PointRow[]); setCatalog((cat ?? []) as unknown as CatDevice[]);
    if (proj) { setRecFns(proj.rec_functions ?? []); setSys({ days: String(proj.rec_days), disk: Number(proj.disk_tb), raid: proj.raid, ups: String(proj.ups_minutes) }); }
    setLoaded(true);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byId = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog]);
  const fnBy = useMemo(() => new Map(fns.map((f) => [f.key, f])), [fns]);
  const fnLabel = (k: string) => (fnBy.get(k) ? fnName(fnBy.get(k)!, lang) : k);
  const brandFn = (k: string, brand: string) => { const f = fnBy.get(k); return f ? (brand === "dahua" ? f.dahua_name : f.unv_name) : null; };
  const goalName = (g: string) => t(`x_pmGoal_${g}` as never);
  const cams = catalog.filter((d) => d.kind === "camera");

  async function savePoint() {
    if (!form || !project || !profile || !form.name.trim()) return;
    setBusy(true); setErr("");
    const row = {
      name: form.name.trim().slice(0, 120), env: form.env, mount_h_m: num(form.mount_h_m), dist_m: num(form.dist_m), width_m: num(form.width_m), goal: form.goal, night_m: num(form.night_m), night_type: form.night_type,
      min_mpx: num(form.min_mpx), audio: form.audio, functions: form.functions, form: form.form === "any" ? null : form.form, qty: Math.min(500, Math.max(1, Math.round(num(form.qty) ?? 1))), notes: form.notes.trim().slice(0, 1000) || null, updated_at: new Date().toISOString(),
    };
    const r = form.id ? await sb.from("project_points").update({ ...row, chosen_device_id: null }).eq("id", form.id).eq("project_id", project.id) : await sb.from("project_points").insert({ ...row, tenant_id: profile.tenant_id, project_id: project.id });
    setBusy(false);
    if (r.error) { setErr(r.error.message); return; }
    setForm(null); load();
  }
  async function choose(pid: string, dev: string | null) { await sb.from("project_points").update({ chosen_device_id: dev, updated_at: new Date().toISOString() }).eq("id", pid); load(); }
  async function removePoint(pid: string) { await sb.from("project_points").update({ deleted_at: new Date().toISOString() }).eq("id", pid); load(); }
  async function setBrand(b: string) { if (!project) return; await sb.from("projects").update({ brand_pref: b, updated_at: new Date().toISOString() }).eq("id", project.id); load(); }
  async function saveSystem() {
    if (!project) return;
    const days = Math.min(3650, Math.max(1, Math.round(num(sys.days) ?? 30))), ups = Math.min(1440, Math.max(0, Math.round(num(sys.ups) ?? 30)));
    const { error } = await sb.from("projects").update({ rec_days: days, disk_tb: sys.disk, raid: sys.raid, ups_minutes: ups, rec_functions: recFns, updated_at: new Date().toISOString() }).eq("id", project.id);
    setErr(error?.message ?? ""); load();
  }
  async function removeProject() { if (!project) return; await sb.from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", project.id); router.back(); }

  if (!loaded || !acc) return <Loading />;
  if (!project) return <Screen><Txt muted>{t("x_pmNone")}</Txt></Screen>;
  if (!acc.view) return <Screen><Txt muted>{t("x_pmReadOnly")}</Txt></Screen>;

  const chosenList = pts.flatMap((p) => { const d = p.chosen_device_id ? byId.get(p.chosen_device_id) : null; return d ? [{ device: d, qty: p.qty }] : []; });
  const raid = (["none", "1", "5", "6", "10"] as const).includes(project.raid as never) ? (project.raid as "none" | "1" | "5" | "6" | "10") : "none";
  const plan = planSystem(chosenList, catalog, { days: project.rec_days, diskTb: Number(project.disk_tb), raid, upsMin: project.ups_minutes, recFns: project.rec_functions ?? [] });
  const raidName = raid === "none" ? t("x_calcRaidNone") : `RAID ${raid}`;
  const nvrOk = !!plan.nvr?.ok;

  // bill of materials: models and quantities only
  const bom = new Map<string, { device: CatDevice; qty: number; points: string[] }>();
  let open = 0;
  for (const p of pts) {
    const d = p.chosen_device_id ? byId.get(p.chosen_device_id) : null;
    if (!d) { open++; continue; }
    const r = bom.get(d.id) ?? { device: d, qty: 0, points: [] };
    r.qty += p.qty; r.points.push(p.name); bom.set(d.id, r);
  }
  const bomRows = Array.from(bom.values()).sort((a, b) => a.device.model.localeCompare(b.device.model));
  async function sharePdfBom() {
    setBusy(true);
    try {
      const rep: Rep = {
        title: project!.name, brand: [project!.client, project!.address].filter(Boolean).join(" · "), date: new Date().toLocaleString("en-GB", { timeZone: "Asia/Baku", dateStyle: "medium", timeStyle: "short" }),
        inputs: [], rows: bomRows.map((r) => [`${brandName(r.device.brand)} ${r.device.model} (${r.points.join(", ")})`, String(r.qty), true] as [string, string, boolean]),
        msgs: open > 0 ? [{ text: t("x_pmBomOpen", { n: open }), bad: true }] : [], note: "", labels: { inputs: "", results: t("x_pmBom"), date: t("x_date") },
      };
      await sharePdf(rep);
    } finally { setBusy(false); }
  }

  const set = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Card>
        <H2>{project.name}</H2>
        <Txt muted small>{[project.client, project.address].filter(Boolean).join(" · ") || "—"}</Txt>
        <Err>{err}</Err>
        <Txt muted small>{t("x_pmBrand")}</Txt>
        {acc.edit ? <Choice value={project.brand_pref as "any" | "dahua" | "unv"} onChange={setBrand} options={[{ value: "any", label: t("x_pmBrandAny") }, { value: "dahua", label: "Dahua" }, { value: "unv", label: "UNV" }]} /> : <Txt>{project.brand_pref === "any" ? t("x_pmBrandAny") : brandName(project.brand_pref)}</Txt>}
      </Card>

      {acc.edit && !form && <Btn title={`＋ ${t("x_pmAddPoint")}`} onPress={() => setForm({ ...blank })} />}
      {form && (
        <Card>
          <H2>{form.id ? t("x_pmEditPoint") : t("x_pmAddPoint")}</H2>
          <Field label={t("x_pmPointName")} value={form.name} onChangeText={(v) => set("name", v)} maxLength={120} />
          <Txt muted small>{t("x_pmEnv")}</Txt>
          <Choice value={form.env as "indoor" | "outdoor"} onChange={(v) => set("env", v)} options={[{ value: "outdoor", label: t("x_pmOutdoor") }, { value: "indoor", label: t("x_pmIndoor") }]} />
          <Field label={t("x_pmHeight")} value={form.mount_h_m} onChangeText={(v) => set("mount_h_m", v)} keyboardType="decimal-pad" />
          <Field label={t("x_pmDist")} value={form.dist_m} onChangeText={(v) => set("dist_m", v)} keyboardType="decimal-pad" />
          <Field label={t("x_pmWidth")} value={form.width_m} onChangeText={(v) => set("width_m", v)} keyboardType="decimal-pad" />
          <Txt muted small>{t("x_pmGoal")}</Txt>
          <Choice value={form.goal} onChange={(v) => set("goal", v)} options={GOALS.map((g) => ({ value: g as string, label: goalName(g) }))} />
          <Field label={t("x_pmNight")} value={form.night_m} onChangeText={(v) => set("night_m", v)} keyboardType="decimal-pad" />
          <Txt muted small>{t("x_pmNightType")}</Txt>
          <Choice value={form.night_type} onChange={(v) => set("night_type", v)} options={[{ value: "any", label: t("x_pmNightAny") }, { value: "ir", label: t("x_pmNightIr") }, { value: "color", label: t("x_pmNightColor") }]} />
          <Field label={t("x_pmMinMpx")} value={form.min_mpx} onChangeText={(v) => set("min_mpx", v)} keyboardType="decimal-pad" />
          <Txt muted small>{t("x_pmAudio")}</Txt>
          <Choice value={form.audio} onChange={(v) => set("audio", v)} options={[{ value: "none", label: t("x_pmAudioNone") }, { value: "mic", label: t("x_pmAudioMic") }, { value: "two_way", label: t("x_pmAudioTwo") }]} />
          <Txt muted small>{t("x_pmForm")}</Txt>
          <Choice value={form.form} onChange={(v) => set("form", v)} options={[{ value: "any", label: t("x_pmFormAny") }, ...FORMS.map((f) => ({ value: f as string, label: t(`x_pmForm_${f}` as never) }))]} />
          <Field label={t("x_pmQty")} value={form.qty} onChangeText={(v) => set("qty", v)} keyboardType="number-pad" />
          <Txt muted small>{t("x_fnTitle")}</Txt>
          <FnTicks fns={fns} selected={form.functions} onChange={(v) => setForm({ ...form, functions: v })} scopes={["camera", "both"]} skipFamily />
          <Field label={t("x_pmNotes")} value={form.notes} onChangeText={(v) => set("notes", v)} multiline maxLength={1000} />
          <Btn title={t("x_pmSavePoint")} onPress={savePoint} busy={busy} disabled={!form.name.trim()} />
          <Btn kind="ghost" title={t("x_pmCancel")} onPress={() => setForm(null)} />
        </Card>
      )}

      {pts.length === 0 && <Txt muted>{t("x_pmNoPoints")}</Txt>}
      {pts.map((p, i) => {
        const ms = matchPoint(p, catalog, project.brand_pref);
        const good = ms.filter((m) => m.ok).slice(0, 5), shown = good.length ? good : ms.slice(0, 3);
        const chosen = p.chosen_device_id ? byId.get(p.chosen_device_id) : null;
        return (
          <Card key={p.id}>
            <H2>{`${i + 1}. ${p.name} × ${p.qty}`}</H2>
            <Txt muted small>
              {`${p.env === "indoor" ? t("x_pmIndoor") : t("x_pmOutdoor")} · ${t("x_pmHeight")}: ${nf(p.mount_h_m)} · ${t("x_pmDist")}: ${nf(p.dist_m)} · ${t("x_pmWidth")}: ${nf(p.width_m)} · ${goalName(p.goal)} · ${t("x_pmNight")}: ${nf(p.night_m)} · ${t("x_pmAudio")}: ${p.audio === "two_way" ? t("x_pmAudioTwo") : p.audio === "mic" ? t("x_pmAudioMic") : t("x_pmAudioNone")}`}
              {(p.functions ?? []).length ? ` · ${p.functions.map(fnLabel).join(", ")}` : ""}{p.notes ? ` · ${p.notes}` : ""}
            </Txt>
            {acc.edit && (
              <Row>
                <Btn kind="ghost" title={t("x_edit")} onPress={() => setForm({ id: p.id, name: p.name, env: p.env, mount_h_m: p.mount_h_m?.toString() ?? "", dist_m: p.dist_m?.toString() ?? "", width_m: p.width_m?.toString() ?? "", goal: p.goal, night_m: p.night_m?.toString() ?? "", night_type: p.night_type, min_mpx: p.min_mpx?.toString() ?? "", audio: p.audio, form: p.form ?? "any", qty: String(p.qty), notes: p.notes ?? "", functions: p.functions ?? [] })} />
                <Btn kind="ghost" title={t("x_delete")} onPress={() => removePoint(p.id)} />
              </Row>
            )}
            {chosen && (
              <Row>
                <Txt bold>{`${t("x_pmChosen")}: ${brandName(chosen.brand)} ${chosen.model}`}</Txt>
                {acc.edit && <Btn kind="ghost" title={t("x_pmClear")} onPress={() => choose(p.id, null)} />}
              </Row>
            )}
            {cams.length === 0 ? <Txt muted>{t("x_pmEmptyCat")}</Txt> : (
              <View style={{ gap: 8 }}>
                <Txt bold>{good.length ? t("x_pmSuggested") : t("x_pmNoMatch")}</Txt>
                {shown.map((m) => (
                  <View key={m.device.id} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, gap: 2 }}>
                    <Txt bold>{`${brandName(m.device.brand)} ${m.device.model}`}</Txt>
                    {m.device.description ? <Txt muted small>{m.device.description}</Txt> : null}
                    <Txt small>{`${m.device.mpx ?? "—"} Mpx · ${t("x_catLens")}: ${m.device.lens_mm ?? "—"} · ${t("x_catIr")}: ${m.device.ir_range_m ?? "—"} · ${m.dori != null ? `${t("x_pmDori")} ${m.dori} m` : m.ppm != null ? `px/m ${Math.round(m.ppm)} / ${m.needPpm}` : "—"}`}</Txt>
                    {(p.functions ?? []).length > 0 && <Txt muted small>{p.functions.map((k) => { const b = brandFn(k, m.device.brand); return `${fnLabel(k)}${b ? ` (${b})` : ""}`; }).join(", ")}</Txt>}
                    {!m.ok && <Text style={{ color: c.danger, fontSize: 12 }}>{m.fails.map((f) => t(`x_pmFail_${f}` as never)).join(", ")}</Text>}
                    {acc.edit && chosen?.id !== m.device.id && <Btn title={t("x_pmChoose")} onPress={() => choose(p.id, m.device.id)} />}
                  </View>
                ))}
                <Txt muted small>{t("x_pmPpmNote")}</Txt>
              </View>
            )}
          </Card>
        );
      })}

      {chosenList.length > 0 && (
        <Card>
          <H2>{t("x_pmSystem")}</H2>
          {acc.edit && (
            <View style={{ gap: 8 }}>
              <Field label={t("x_calcDays")} value={sys.days} onChangeText={(v) => setSys({ ...sys, days: v })} keyboardType="number-pad" />
              <Txt muted small>{t("x_calcDiskSize")}</Txt>
              <Choice value={String(sys.disk)} onChange={(v) => setSys({ ...sys, disk: Number(v) })} options={DISK_SIZES.map((x) => ({ value: String(x), label: `${x} TB` }))} />
              <Txt muted small>{t("x_calcRaid")}</Txt>
              <Choice value={sys.raid} onChange={(v) => setSys({ ...sys, raid: v })} options={[{ value: "none", label: t("x_calcRaidNone") }, ...["1", "5", "6", "10"].map((x) => ({ value: x, label: `RAID ${x}` }))]} />
              <Field label={t("x_pmUpsMin")} value={sys.ups} onChangeText={(v) => setSys({ ...sys, ups: v })} keyboardType="number-pad" />
              <Txt muted small>{t("x_fnRecTitle")}</Txt>
              <FnTicks fns={fns} selected={recFns} onChange={setRecFns} scopes={["recorder", "both"]} skipFamily />
              <Btn kind="ghost" title={t("x_save")} onPress={saveSystem} />
            </View>
          )}
          <Txt>{`${t("x_pmCams")}: ${plan.cams}`}</Txt>
          <Txt>{`${t("x_calcBwTotal")}: ${nf1(plan.mbps)} Mbps`}</Txt>
          <Txt>{`${t("x_calcNeedRec")}: ${nf1(plan.needTb, 2)} TB`}</Txt>
          <Txt>{`${t("x_calcDisksNeed")}: ${plan.disks ? `${plan.disks} × ${project.disk_tb} TB (${raidName})` : t("x_calcNoDisks")}`}</Txt>
          {plan.nvr ? (
            <View>
              <Txt bold>{`${t("x_pmNvr")}: ${brandName(plan.nvr.device.brand)} ${plan.nvr.device.model}`}</Txt>
              {!nvrOk && <Text style={{ color: c.danger, fontSize: 12 }}>{`${t("x_pmNvrNoFit")}: ${plan.nvr.fails.map((f) => t(`x_pmNvrFail_${f}` as never)).join(", ")}`}</Text>}
            </View>
          ) : <Text style={{ color: c.danger }}>{`${t("x_pmNvr")}: ${t("x_pmNvrNone")}`}</Text>}
          {plan.fitDiskTb ? <Txt muted small>{t("x_pmFitDisk", { tb: plan.fitDiskTb })}</Txt> : null}
          <View>
            <Txt>{`${t("x_pmSwitch")}: ${plan.poeCams === 0 ? t("x_pmSwitchNoPoe") : !plan.swNeeded ? t("x_pmSwitchInNvr") : plan.sw ? `${brandName(plan.sw.brand)} ${plan.sw.model}` : t("x_pmSwitchNone", { p: plan.poeCams, w: Math.ceil(plan.poeBudgetW) })}`}</Txt>
            {plan.poeCams > 0 && <Txt muted small>{t("x_pmPoeNeed", { p: plan.poeCams, w: Math.ceil(plan.poeBudgetW) })}</Txt>}
          </View>
          <View>
            <Txt>{`${t("x_pmUps")}: ${plan.loadW > 0 ? t("x_pmUpsText", { w: Math.ceil(plan.loadW), rec: Math.ceil(plan.upsW) }) : "—"}`}</Txt>
            {plan.loadW > 0 && plan.needAh24 != null && <Txt muted small>{t("x_pmUpsBattery", { m: project.ups_minutes, wh: Math.ceil(plan.usableWh), ah: nf1(plan.needAh24) })}</Txt>}
          </View>
          <Txt muted small>{t("x_pmSystemNote")}</Txt>
        </Card>
      )}

      <Card>
        <H2>{t("x_pmBom")}</H2>
        {bomRows.length === 0 ? <Txt muted>{t("x_pmBomNone")}</Txt> : bomRows.map((r, i) => (
          <View key={r.device.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <View style={{ flex: 1 }}><Txt bold>{`${i + 1}. ${brandName(r.device.brand)} ${r.device.model}`}</Txt><Txt muted small>{r.points.join(", ")}</Txt></View>
            <Txt bold>{`× ${r.qty}`}</Txt>
          </View>
        ))}
        {open > 0 && <Text style={{ color: c.danger }}>{t("x_pmBomOpen", { n: open })}</Text>}
        {bomRows.length > 0 && <Btn title={busy ? t("x_pmPdfBusy") : t("x_pmPdf")} busy={busy} onPress={sharePdfBom} />}
      </Card>
      {acc.del && <Btn kind="danger" title={t("x_pmDeleteProject")} onPress={removeProject} />}
    </Screen>
  );
}
