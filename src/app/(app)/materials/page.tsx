import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import MaterialAdd from "@/components/MaterialAdd";
import ConfirmButton from "@/components/ConfirmButton";

async function remove(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: ok } = await sb.rpc("has_permission", { p_code: "materials.delete" });
  if (ok !== true) redirect("/materials");
  const id = String(fd.get("id"));
  const { data: files } = await sb.from("material_files").select("path").eq("material_id", id);
  await sb.from("materials").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (files?.length) await sb.storage.from("materials").remove(files.map((f) => f.path));
  revalidatePath("/materials");
}

export default async function Materials({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: sess } = await sb.auth.getSession();
  const [{ data: me }, { data: canView }, { data: canEdit }, { data: canDelete }] = await Promise.all([
    sb.from("users").select("kind,tenant_id,first_name,last_name").eq("id", sess.session!.user.id).maybeSingle(),
    sb.rpc("has_permission", { p_code: "materials.view" }), sb.rpc("has_permission", { p_code: "materials.edit" }), sb.rpc("has_permission", { p_code: "materials.delete" }),
  ]);
  if (me?.kind !== "staff" || canView !== true) redirect("/tickets");
  const term = (q ?? "").trim().replace(/[%,()*]/g, "").slice(0, 80);
  let query = sb.from("materials").select("id,title,description,creator_name,video_url,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (term) { const like = `%${term}%`; query = query.or(`title.ilike.${like},description.ilike.${like},creator_name.ilike.${like},body.ilike.${like}`); }
  const { data: rows, error } = await query;
  const ids = (rows ?? []).map((r) => r.id);
  const { data: files } = ids.length ? await sb.from("material_files").select("material_id").in("material_id", ids) : { data: [] };
  const fileCount = new Map<string, number>();
  for (const f of files ?? []) fileCount.set(f.material_id, (fileCount.get(f.material_id) ?? 0) + 1);
  const myName = `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim();
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{S.matTitle}</h1>
        {canEdit === true && <span><MaterialAdd tenantId={me.tenant_id} creator={myName} S={S} /></span>}
      </div>
      <div className="card">
        <form className="row" method="get" style={{ marginBottom: 12 }}>
          <input name="q" defaultValue={q ?? ""} placeholder={S.matSearch} style={{ minWidth: 280 }} />
          <button>{S.filter}</button>
          {q && <a className="btn ghost" href="/materials" style={{ textDecoration: "none" }}>{S.clearFilters}</a>}
        </form>
        {error && <p className="err">{error.message}</p>}
        {(rows ?? []).map((r) => (
          <div key={r.id} className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line, #8884)" }}>
            <div>
              <Link href={`/materials/${r.id}`}><b>{r.title}</b></Link>
              {fileCount.get(r.id) ? <span className="badge" style={{ marginLeft: 8 }}>📎 {fileCount.get(r.id)}</span> : null}
              {r.video_url ? <span className="badge" style={{ marginLeft: 8 }}>▶</span> : null}
              {r.description ? <div><small>{r.description}</small></div> : null}
              <div><small>{S.matBy.replace("{name}", r.creator_name)} · {new Date(r.created_at).toLocaleString()}</small></div>
            </div>
            <span className="row">
              <Link className="btn" href={`/materials/${r.id}`} style={{ textDecoration: "none" }}>{S.matOpen}</Link>
              {canDelete === true && (
                <form action={remove}><input type="hidden" name="id" value={r.id} />
                  <ConfirmButton className="btn danger" message={S.matDeleteQ}>{S.tutDelete}</ConfirmButton></form>)}
            </span>
          </div>
        ))}
        {!(rows ?? []).length && <p>{S.matNone}</p>}
      </div>
    </div>
  );
}
