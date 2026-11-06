import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { FN_SEED } from "@/lib/function-seed";

// The function library: editable list of requirements (face detection, tripwire, ...) with the Dahua and UNV names.
export type Fn = {
  id: string; key: string; grp: string; scope: string; kind: string; sort_order: number;
  name_en: string; name_ru: string; name_az: string; dahua_name: string | null; unv_name: string | null;
  desc_en: string | null; desc_ru: string | null; desc_az: string | null;
};
export const fnName = (f: Fn, lang: string) => (lang === "ru" ? f.name_ru : lang === "az" ? f.name_az : f.name_en) || f.name_en;
export const fnDesc = (f: Fn, lang: string) => (lang === "ru" ? f.desc_ru : lang === "az" ? f.desc_az : f.desc_en) || f.desc_en || "";
// Name the maker uses for this function, for the brand shown.
export const fnBrand = (f: Fn, brand: string) => (brand === "dahua" ? f.dahua_name : f.unv_name);

const COLS = "id,key,grp,scope,kind,sort_order,name_en,name_ru,name_az,dahua_name,unv_name,desc_en,desc_ru,desc_az";

// Adds every standard function that is not in the library yet (never changes ones already there). Returns how many were added.
export async function addMissingFunctions(tenantId: string): Promise<number> {
  const admin = supabaseAdmin();
  const { data: have } = await admin.from("catalog_functions").select("key").eq("tenant_id", tenantId);
  const keys = new Set((have ?? []).map((r) => r.key as string));
  const rows = FN_SEED.map((s, i) => ({ s, i })).filter(({ s }) => !keys.has(s.key)).map(({ s, i }) => ({
    tenant_id: tenantId, key: s.key, grp: s.grp, scope: s.scope, kind: s.kind, sort_order: i, dahua_name: s.dahua, unv_name: s.unv,
    name_en: s.name[0], name_ru: s.name[1], name_az: s.name[2], desc_en: s.desc[0], desc_ru: s.desc[1], desc_az: s.desc[2],
  }));
  if (rows.length) await admin.from("catalog_functions").upsert(rows, { onConflict: "tenant_id,key", ignoreDuplicates: true });
  return rows.length;
}

// All live functions. The first time (empty library) the standard list is loaded.
export async function loadFunctions(sb: { from: (t: string) => any }, tenantId: string): Promise<Fn[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const get = async () => ((await sb.from("catalog_functions").select(COLS).is("deleted_at", null).order("sort_order")).data ?? []) as Fn[];
  let rows = await get();
  if (rows.length === 0) { await addMissingFunctions(tenantId); rows = await get(); }
  return rows;
}
