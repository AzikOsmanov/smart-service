import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import TutorialForm from "@/components/TutorialForm";
import ConfirmButton from "@/components/ConfirmButton";

async function remove(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: ok } = await sb.rpc("has_permission", { p_code: "tutorials.delete" });
  if (ok !== true) redirect("/tutorials");
  const id = String(fd.get("id"));
  const { data: row } = await sb.from("tutorials").select("storage_path").eq("id", id).maybeSingle();
  await sb.from("tutorials").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (row?.storage_path) await sb.storage.from("tutorials").remove([row.storage_path]);
  revalidatePath("/tutorials");
}

export default async function Tutorials() {
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: sess } = await sb.auth.getSession();
  const { data: me } = await sb.from("users").select("kind,tenant_id").eq("id", sess.session!.user.id).maybeSingle();
  const staff = me?.kind === "staff";
  const [{ data: canView }, { data: canEdit }, { data: canDelete }] = await Promise.all([
    sb.rpc("has_permission", { p_code: "tutorials.view" }), sb.rpc("has_permission", { p_code: "tutorials.edit" }), sb.rpc("has_permission", { p_code: "tutorials.delete" }),
  ]);
  if (staff && canView !== true) redirect("/tickets");
  const { data: rows, error } = await sb.from("tutorials").select("id,title,description,audience,source,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  const aud: Record<string, string> = { all: S.tutAudAll, customers: S.tutAudCustomers, staff: S.tutAudStaff };
  return (
    <div>
      <h1>{S.tutTitle}</h1>
      {staff && canEdit === true && (
        <div className="card"><h2>{S.tutAdd}</h2><TutorialForm tenantId={me!.tenant_id} S={S} /></div>
      )}
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        {(rows ?? []).map((r) => (
          <div key={r.id} className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border, #8884)" }}>
            <div>
              <Link href={`/tutorials/${r.id}`}><b>{r.title}</b></Link>{" "}
              {staff && <span className="badge">{aud[r.audience] ?? r.audience}</span>}
              {r.description ? <div><small>{r.description}</small></div> : null}
              <div><small>{new Date(r.created_at).toLocaleString()}</small></div>
            </div>
            <span className="row">
              <Link className="btn" href={`/tutorials/${r.id}`} style={{ textDecoration: "none" }}>{S.tutWatch}</Link>
              {staff && canDelete === true && (
                <form action={remove}><input type="hidden" name="id" value={r.id} />
                  <ConfirmButton className="btn danger" message={S.tutDeleteQ}>{S.tutDelete}</ConfirmButton></form>)}
            </span>
          </div>
        ))}
        {!(rows ?? []).length && <p>{S.tutNone}</p>}
      </div>
    </div>
  );
}
