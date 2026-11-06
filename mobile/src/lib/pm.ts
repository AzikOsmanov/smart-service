import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePerms } from "@/lib/perm";

export const FN_GROUPS = ["motion", "faces", "business", "special", "night", "deter", "track", "multi", "health", "search", "storage", "power", "family"] as const;

export type Fn = {
  id: string; key: string; grp: string; scope: string; kind: string; sort_order: number;
  name_en: string; name_ru: string; name_az: string; dahua_name: string | null; unv_name: string | null;
  desc_en: string | null; desc_ru: string | null; desc_az: string | null;
};
export const fnName = (f: Fn, lang: string) => (lang === "ru" ? f.name_ru : lang === "az" ? f.name_az : f.name_en) || f.name_en;
export const fnDesc = (f: Fn, lang: string) => (lang === "ru" ? f.desc_ru : lang === "az" ? f.desc_az : f.desc_en) || f.desc_en || "";

// The function library (read-only on the phone; the list is edited on the website).
export function useFunctions(): Fn[] {
  const [rows, setRows] = useState<Fn[]>([]);
  useEffect(() => {
    sb.from("catalog_functions").select("id,key,grp,scope,kind,sort_order,name_en,name_ru,name_az,dahua_name,unv_name,desc_en,desc_ru,desc_az").is("deleted_at", null).order("sort_order").then(({ data }) => setRows((data ?? []) as Fn[]));
  }, []);
  return rows;
}

// Staff follow the menu permissions; approved customers may use the menu fully.
export function usePmAccess(): { view: boolean; edit: boolean; del: boolean } | null {
  const { staff, profile, ready } = useAuth();
  const perms = usePerms(["projects.view", "projects.edit", "projects.delete"]);
  if (!ready || !profile) return null;
  if (!staff) { const ok = profile.registration === "approved"; return { view: ok, edit: ok, del: ok }; }
  if (!perms) return null;
  return { view: perms["projects.view"], edit: perms["projects.edit"], del: perms["projects.delete"] };
}
