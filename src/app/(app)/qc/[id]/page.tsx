import Link from "next/link";
import { fmtDT } from "@/lib/fmt-time";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import ConfirmButton from "@/components/ConfirmButton";
import { QC_STATUSES } from "@/lib/qc";
import { downloadUrls } from "@/lib/downloads";
import { getStaff } from "@/lib/i18n-staff";

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
  const { S } = await getStaff();
  const qcName: Record<string, string> = { done: S.qcDone, broken: S.qcBroken, hardware_issue: S.qcHardware };
  const { data: c } = await sb.from("qc_checks").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) notFound();
  const [{ data: media }, { data: canEdit }, { data: canDelete }, { data: p }, { data: history }] = await Promise.all([
    sb.from("qc_media").select("id,path,kind,mime,file_name").eq("qc_id", id).order("created_at"),
    sb.rpc("has_permission", { p_code: "qc.edit" }),
    sb.rpc("has_permission", { p_code: "qc.delete" }),
    c.performed_by ? sb.from("users").select("first_name,last_name").eq("id", c.performed_by).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("qc_checks").select("id,status,created_at").eq("serial_number", c.serial_number).is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  const paths = (media ?? []).map((m) => m.path);
  const { data: signed } = paths.length ? await sb.storage.from("qc-media").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const nameOf = (m: { id: string; path: string; kind: string; file_name: string | null }, i: number) => m.file_name || `${c.serial_number}_${i + 1}.${m.kind === "video" ? "mp4" : "jpg"}`;
  const dlOf = await downloadUrls(sb, "qc-media", (media ?? []).map((m, i) => ({ path: m.path, name: nameOf(m, i) })));
  const mine = canEdit === true;
  return (
    <div>
      <div className="card">
        <p><Link href="/qc">← {S.qcTitle}</Link></p>
        <h1>SN {c.serial_number}</h1>
        <div className="row">
          <span className="badge">{qcName[c.status] ?? c.status}</span>
          <span>{S.engineer}: <b>{p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "—"}</b></span>
          <small>{fmtDT(c.created_at)}</small>
          {c.ticket_id && <Link href={`/tickets/${c.ticket_id}`}>{S.ticketWord}</Link>}
        </div>
        {error && <p className="err">{error}</p>}
      </div>
      {mine ? (
        <form action={update} className="card">
          <input type="hidden" name="id" value={id} />
          <label>{S.qcStatusCol}
            <select name="status" defaultValue={c.status}>{QC_STATUSES.map((s) => <option key={s} value={s}>{qcName[s]}</option>)}</select>
          </label>
          <label>{S.comments}<textarea name="comment" rows={4} defaultValue={c.comment ?? ""} /></label>
          <button>{S.save}</button>
        </form>
      ) : (
        <div className="card"><h2>{S.comments}</h2><p>{c.comment ?? "—"}</p></div>
      )}
      <div className="card">
        <h2>{S.photosVideos}</h2>
        {(media ?? []).length === 0 && <p>{S.noFiles}</p>}
        <div className="row" style={{ alignItems: "flex-start" }}>
          {(media ?? []).map((m, i) => {
            const u = url.get(m.path);
            if (!u) return null;
            const dl = <div><small>{nameOf(m, i)} · <a href={dlOf.get(m.path) ?? u}>⬇ {S.downloadWord}</a></small></div>;
            return m.kind === "video"
              ? <div key={m.id}><video src={u} controls style={{ maxWidth: 360, borderRadius: 8 }} />{dl}</div>
              : <div key={m.id}><a href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ maxWidth: 240, borderRadius: 8 }} /></a>{dl}</div>;
          })}
        </div>
      </div>
      <div className="card">
        <h2>{S.historyOfSn}</h2>
        <ul>
          {(history ?? []).map((h) => (
            <li key={h.id}><Link href={`/qc/${h.id}`}>{fmtDT(h.created_at)}</Link> — {qcName[h.status] ?? h.status}</li>
          ))}
        </ul>
      </div>
      {canDelete === true && (
        <form action={remove} className="card">
          <input type="hidden" name="id" value={id} />
          <ConfirmButton className="btn danger" message={S.deleteQcQ}>{S.deleteQc}</ConfirmButton>
        </form>
      )}
    </div>
  );
}
