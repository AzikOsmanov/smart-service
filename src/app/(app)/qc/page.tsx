import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { QC_LABEL, QC_STATUSES, type QcStatus } from "@/lib/qc";

export default async function QcList({ searchParams }: { searchParams: Promise<{ sn?: string; status?: string }> }) {
  const { sn, status } = await searchParams;
  const sb = await supabaseServer();
  const [{ data: canView }, { data: canEdit }] = await Promise.all([
    sb.rpc("has_permission", { p_code: "qc.view" }), sb.rpc("has_permission", { p_code: "qc.edit" }),
  ]);
  if (canView !== true) redirect("/tickets");
  let q = sb.from("qc_checks").select("id,serial_number,status,comment,created_at,performed_by").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  const term = (sn ?? "").trim().replace(/[%,()]/g, "");
  if (term) q = q.ilike("serial_number", `%${term}%`);
  if (status && (QC_STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);
  const { data: rows, error } = await q;
  const ids = Array.from(new Set((rows ?? []).map((r) => r.performed_by).filter(Boolean))) as string[];
  const { data: people } = ids.length ? await sb.from("users").select("id,first_name,last_name").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>Quality Control</h1>
          {canEdit === true && <Link className="btn" href="/qc/new">New QC check</Link>}
        </div>
        <form className="row" method="get">
          <input name="sn" placeholder="Serial number" defaultValue={sn ?? ""} />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {QC_STATUSES.map((s) => <option key={s} value={s}>{QC_LABEL[s]}</option>)}
          </select>
          <button>Filter</button>
        </form>
        {error && <p className="err">{error.message}</p>}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Serial number</th><th>QC status</th><th>Comment</th><th>Engineer</th><th>Date</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td><Link href={`/qc/${r.id}`}><b>{r.serial_number}</b></Link></td>
                <td><span className="badge">{QC_LABEL[r.status as QcStatus]}</span></td>
                <td>{(r.comment ?? "").slice(0, 80)}</td>
                <td>{who.get(r.performed_by ?? "") ?? "—"}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && <tr><td colSpan={5}>No QC checks yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
