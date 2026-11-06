import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtDT } from "@/lib/fmt-time";
import { getStaff } from "@/lib/i18n-staff";
import { pmCtx } from "@/lib/pm-ctx";

async function createProject(fd: FormData) {
  "use server";
  const c = await pmCtx();
  if (!c.canEditProjects) redirect("/projects");
  const name = String(fd.get("name") ?? "").trim().slice(0, 160);
  if (!name) redirect("/projects");
  const brand = ["dahua", "unv"].includes(String(fd.get("brand"))) ? String(fd.get("brand")) : "any";
  const { data, error } = await c.sb.from("projects").insert({
    tenant_id: c.tenantId, name, client: String(fd.get("client") ?? "").trim().slice(0, 160) || null, address: String(fd.get("address") ?? "").trim().slice(0, 300) || null, brand_pref: brand, created_by: c.uid,
  }).select("id").single();
  if (error || !data) redirect("/projects?error=" + encodeURIComponent(error?.message ?? "error"));
  redirect(`/projects/${data.id}`);
}

export default async function Projects({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const c = await pmCtx();
  if (!c.canProjects) redirect("/tickets");
  const { S } = await getStaff();
  const { data: rows } = await c.sb.from("projects").select("id,name,client,address,brand_pref,created_at,created_by").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  const ids = (rows ?? []).map((r) => r.id);
  const { data: pts } = ids.length ? await c.sb.from("project_points").select("project_id").in("project_id", ids).is("deleted_at", null) : { data: [] };
  const count = new Map<string, number>();
  (pts ?? []).forEach((p) => count.set(p.project_id, (count.get(p.project_id) ?? 0) + 1));
  return (
    <div>
      <h1>{S.pmTitle}</h1>
      {error && <p className="err">{error}</p>}
      {c.canEditProjects && (
        <form action={createProject} className="card" style={{ maxWidth: 640 }}>
          <h2>{S.pmNew}</h2>
          <label>{S.pmName}<input name="name" required maxLength={160} /></label>
          <label>{S.pmClient}<input name="client" maxLength={160} /></label>
          <label>{S.pmAddress}<input name="address" maxLength={300} /></label>
          <label>{S.pmBrand}<select name="brand" defaultValue="any"><option value="any">{S.pmBrandAny}</option><option value="dahua">Dahua</option><option value="unv">Uniview (UNV)</option></select></label>
          <button>{S.pmNew}</button>
        </form>
      )}
      <div className="card">
        <table>
          <thead><tr><th>{S.pmName}</th><th>{S.pmClient}</th><th>{S.pmAddress}</th><th>{S.pmPointsCol}</th><th>{S.date}</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}><td><Link href={`/projects/${r.id}`}><b>{r.name}</b></Link></td><td>{r.client ?? "—"}</td><td>{r.address ?? "—"}</td><td>{count.get(r.id) ?? 0}</td><td>{fmtDT(r.created_at)}</td></tr>
            ))}
            {(rows ?? []).length === 0 && <tr><td colSpan={5}>{S.pmNone}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
