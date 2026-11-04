import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import ConfirmButton from "@/components/ConfirmButton";
import { QC_LABEL, QC_STATUSES, type QcStatus } from "@/lib/qc";

async function update(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { error } = await sb.from("qc_checks").update({ status: String(fd.get("status")), comment: String(fd.get("comment") || "") || null }).eq("id", id);
  if (error) redirect(`/qc/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/qc/${id}`);
}

async function remove(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { error } = await sb.from("qc_checks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect(`/qc/${id}?error=${encodeURIComponent(error.message)}`);
  redirect("/qc");
}

export default async function QcDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const sb = await supabaseServer();
  const { data: c } = await sb.from("qc_checks").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) notFound();
  const [{ data: media }, { data: canEdit }, { data: canDelete }, { data: p }, { data: history }] = await Promise.all([
    sb.from("qc_media").select("id,path,kind,mime").eq("qc_id", id).order("created_at"),
    sb.rpc("has_permission", { p_code: "qc.edit" }),
    sb.rpc("has_permission", { p_code: "qc.delete" }),
    c.performed_by ? sb.from("users").select("first_name,last_name").eq("id", c.performed_by).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("qc_checks").select("id,status,created_at").eq("serial_number", c.serial_number).is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  const paths = (media ?? []).map((m) => m.path);
  const { data: signed } = paths.length ? await sb.storage.from("qc-media").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const mine = canEdit === true;
  return (
    <div>
      <div className="card">
        <p><Link href="/qc">← Quality Control</Link></p>
        <h1>SN {c.serial_number}</h1>
        <div className="row">
          <span className="badge">{QC_LABEL[c.status as QcStatus]}</span>
          <span>Engineer: <b>{p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "—"}</b></span>
          <small>{new Date(c.created_at).toLocaleString()}</small>
          {c.ticket_id && <Link href={`/tickets/${c.ticket_id}`}>Ticket</Link>}
        </div>
        {error && <p className="err">{error}</p>}
      </div>
      {mine ? (
        <form action={update} className="card">
          <input type="hidden" name="id" value={id} />
          <label>QC status
            <select name="status" defaultValue={c.status}>{QC_STATUSES.map((s) => <option key={s} value={s}>{QC_LABEL[s]}</option>)}</select>
          </label>
          <label>Comments<textarea name="comment" rows={4} defaultValue={c.comment ?? ""} /></label>
          <button>Save</button>
        </form>
      ) : (
        <div className="card"><h2>Comments</h2><p>{c.comment ?? "—"}</p></div>
      )}
      <div className="card">
        <h2>Photos and videos</h2>
        {(media ?? []).length === 0 && <p>No files.</p>}
        <div className="row" style={{ alignItems: "flex-start" }}>
          {(media ?? []).map((m) => {
            const u = url.get(m.path);
            if (!u) return null;
            return m.kind === "video"
              ? <video key={m.id} src={u} controls style={{ maxWidth: 360, borderRadius: 8 }} />
              : <a key={m.id} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ maxWidth: 240, borderRadius: 8 }} /></a>;
          })}
        </div>
      </div>
      <div className="card">
        <h2>History of this serial number</h2>
        <ul>
          {(history ?? []).map((h) => (
            <li key={h.id}><Link href={`/qc/${h.id}`}>{new Date(h.created_at).toLocaleString()}</Link> — {QC_LABEL[h.status as QcStatus]}</li>
          ))}
        </ul>
      </div>
      {canDelete === true && (
        <form action={remove} className="card">
          <input type="hidden" name="id" value={id} />
          <ConfirmButton className="btn danger" message="Delete this QC check?">Delete QC check</ConfirmButton>
        </form>
      )}
    </div>
  );
}
