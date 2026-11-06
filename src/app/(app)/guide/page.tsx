import { redirect } from "next/navigation";
import { getStaff } from "@/lib/i18n-staff";
import { supabaseServer } from "@/lib/supabase-server";
import { loadFunctions, fnName, fnDesc } from "@/lib/functions";
import CatalogTabs from "@/components/CatalogTabs";
import { FN_GROUPS } from "@/lib/function-seed";

// Technology guide: every function with the Dahua and UNV names and a short description. Staff with guide.view and approved customers.
export default async function Guide({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await sb.from("users").select("tenant_id,kind,registration").eq("id", auth.user.id).single();
  const staff = me?.kind === "staff";
  const ok = staff ? (await sb.rpc("has_permission", { p_code: "guide.view" })).data === true : me?.registration === "approved";
  if (!ok) redirect("/tickets");
  const canCat = staff && (await sb.rpc("has_permission", { p_code: "catalog.view" })).data === true;
  const { S, lang } = await getStaff();
  const L = (k: string) => (S as Record<string, string>)[k] ?? k;
  const all = await loadFunctions(sb, me!.tenant_id as string);
  const term = (q ?? "").trim().toLowerCase();
  const list = term ? all.filter((f) => [f.name_en, f.name_ru, f.name_az, f.dahua_name, f.unv_name, f.desc_en, f.desc_ru, f.desc_az].some((x) => (x ?? "").toLowerCase().includes(term))) : all;
  return (
    <div>
      {staff && canCat && <CatalogTabs active="guide" showLibrary S={S as Record<string, string>} />}
      <h1>{S.guideTitle}</h1>
      <p><small>{S.guideHint}</small></p>
      <form method="get" className="row" style={{ gap: 8 }}><input name="q" defaultValue={q ?? ""} placeholder={S.guideSearch} /><button>{S.filter}</button></form>
      {FN_GROUPS.map((g) => {
        const items = list.filter((f) => f.grp === g);
        if (!items.length) return null;
        return (
          <div className="card" key={g}>
            <h2>{L("fnGrp_" + g)}</h2>
            <table>
              <thead><tr><th>{S.fnName}</th><th>Dahua</th><th>UNV</th></tr></thead>
              <tbody>{items.map((f) => (
                <tr key={f.id}>
                  <td><b>{fnName(f, lang)}</b>{fnDesc(f, lang) && <><br /><small>{fnDesc(f, lang)}</small></>}</td>
                  <td>{f.dahua_name ?? "—"}</td><td>{f.unv_name ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      })}
      {list.length === 0 && <p>{S.guideNone}</p>}
    </div>
  );
}
