import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getStaff } from "@/lib/i18n-staff";
import { pmCtx } from "@/lib/pm-ctx";
import { addMissingFunctions, loadFunctions, fnName } from "@/lib/functions";
import CatalogTabs from "@/components/CatalogTabs";
import { FN_GROUPS } from "@/lib/function-seed";

const t = (fd: FormData, k: string, n = 200) => String(fd.get(k) ?? "").trim().slice(0, n);
async function save(fd: FormData) {
  "use server";
  const c = await pmCtx();
  if (!c.canEditCatalog) redirect("/catalog");
  const id = t(fd, "id", 40);
  const grp = (FN_GROUPS as readonly string[]).includes(t(fd, "grp")) ? t(fd, "grp") : "motion";
  const scope = ["camera", "recorder", "both"].includes(t(fd, "scope")) ? t(fd, "scope") : "camera";
  const kind = t(fd, "kind") === "tech" ? "tech" : "function";
  const en = t(fd, "name_en", 120);
  if (!en) redirect("/catalog/functions");
  const row = {
    grp, scope, kind, name_en: en, name_ru: t(fd, "name_ru", 120) || en, name_az: t(fd, "name_az", 120) || en,
    dahua_name: t(fd, "dahua_name") || null, unv_name: t(fd, "unv_name") || null,
    desc_en: t(fd, "desc_en", 800) || null, desc_ru: t(fd, "desc_ru", 800) || null, desc_az: t(fd, "desc_az", 800) || null, updated_at: new Date().toISOString(),
  };
  let res;
  if (id) res = await c.sb.from("catalog_functions").update(row).eq("id", id);
  else {
    const key = (t(fd, "key", 60).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "")) || en.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
    res = await c.sb.from("catalog_functions").insert({ ...row, key, tenant_id: c.tenantId, sort_order: 1000 });
  }
  if (res.error) redirect("/catalog/functions?error=" + encodeURIComponent(res.error.message));
  revalidatePath("/catalog/functions");
  redirect("/catalog/functions");
}
async function remove(fd: FormData) {
  "use server";
  const c = await pmCtx();
  if (!c.canDeleteCatalog) redirect("/catalog/functions");
  await c.sb.from("catalog_functions").update({ deleted_at: new Date().toISOString() }).eq("id", t(fd, "id", 40));
  revalidatePath("/catalog/functions");
  redirect("/catalog/functions");
}
async function addMissing() {
  "use server";
  const c = await pmCtx();
  if (!c.canEditCatalog) redirect("/catalog");
  const n = await addMissingFunctions(c.tenantId);
  revalidatePath("/catalog/functions");
  redirect("/catalog/functions?added=" + n);
}

export default async function Functions({ searchParams }: { searchParams: Promise<{ error?: string; edit?: string; added?: string }> }) {
  const { error, edit, added } = await searchParams;
  const c = await pmCtx();
  if (!c.canCatalog) redirect("/tickets");
  const { S, lang } = await getStaff();
  const L = (k: string) => (S as Record<string, string>)[k] ?? k;
  const fns = await loadFunctions(c.sb, c.tenantId);
  const e = fns.find((f) => f.id === edit) ?? null;
  return (
    <div>
      <CatalogTabs active="functions" showLibrary S={S as Record<string, string>} />
      <h1>{S.fnLibTitle}</h1>
      {error && <p className="err">{error}</p>}
      {added !== undefined && <p>{S.fnLibAdded.replace("{n}", String(Number(added) || 0))}</p>}
      {c.canEditCatalog && (
        <form action={save} className="card" key={e?.id ?? "new"}>
          <h2>{e ? S.catEdit : S.catAdd}</h2>
          {e && <input type="hidden" name="id" value={e.id} />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {!e && <label>{S.fnKey}<input name="key" maxLength={60} placeholder="my_function" /></label>}
            <label>{S.fnGroup}<select name="grp" defaultValue={e?.grp ?? "motion"}>{FN_GROUPS.map((g) => <option key={g} value={g}>{L("fnGrp_" + g)}</option>)}</select></label>
            <label>{S.fnScope}<select name="scope" defaultValue={e?.scope ?? "camera"}>{["camera", "recorder", "both"].map((x) => <option key={x} value={x}>{L("fnScope_" + x)}</option>)}</select></label>
            <label>{S.fnKind}<select name="kind" defaultValue={e?.kind ?? "function"}><option value="function">{S.fnKindFunction}</option><option value="tech">{S.fnKindTech}</option></select></label>
            <label>{S.fnName} (EN)<input name="name_en" required maxLength={120} defaultValue={e?.name_en ?? ""} /></label>
            <label>{S.fnName} (RU)<input name="name_ru" maxLength={120} defaultValue={e?.name_ru ?? ""} /></label>
            <label>{S.fnName} (AZ)<input name="name_az" maxLength={120} defaultValue={e?.name_az ?? ""} /></label>
            <label>Dahua<input name="dahua_name" maxLength={200} defaultValue={e?.dahua_name ?? ""} /></label>
            <label>UNV<input name="unv_name" maxLength={200} defaultValue={e?.unv_name ?? ""} /></label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 10 }}>
            <label>EN<textarea name="desc_en" rows={3} maxLength={800} defaultValue={e?.desc_en ?? ""} /></label>
            <label>RU<textarea name="desc_ru" rows={3} maxLength={800} defaultValue={e?.desc_ru ?? ""} /></label>
            <label>AZ<textarea name="desc_az" rows={3} maxLength={800} defaultValue={e?.desc_az ?? ""} /></label>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}><button>{S.save}</button>{e && <Link className="btn ghost" href="/catalog/functions">{S.pmCancel}</Link>}</div>
        </form>
      )}
      {c.canEditCatalog && <form action={addMissing} className="card"><p><small>{S.fnLibAddHint}</small></p><button className="btn ghost">{S.fnLibAddMissing}</button></form>}
      {FN_GROUPS.map((g) => {
        const items = fns.filter((f) => f.grp === g);
        if (!items.length) return null;
        return (
          <div className="card" key={g}>
            <h2>{L("fnGrp_" + g)}</h2>
            <table>
              <thead><tr><th>{S.fnName}</th><th>Dahua</th><th>UNV</th><th>{S.fnScope}</th><th></th></tr></thead>
              <tbody>{items.map((f) => (
                <tr key={f.id}>
                  <td><b>{fnName(f, lang)}</b><br /><small>{f.key}{f.kind === "tech" ? ` · ${S.fnKindTech}` : ""}</small></td>
                  <td>{f.dahua_name ?? "—"}</td><td>{f.unv_name ?? "—"}</td><td>{L("fnScope_" + f.scope)}</td>
                  <td className="row" style={{ gap: 6 }}>
                    {c.canEditCatalog && <Link className="btn ghost" href={`/catalog/functions?edit=${f.id}`}>{S.edit}</Link>}
                    {c.canDeleteCatalog && <form action={remove}><input type="hidden" name="id" value={f.id} /><button className="btn ghost">{S.delete}</button></form>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
