import Link from "next/link";
import { fmtDT } from "@/lib/fmt-time";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { embedUrl } from "@/lib/video";

const size = (n: number | null) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function Material({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: canView } = await sb.rpc("has_permission", { p_code: "materials.view" });
  const { data: sess } = await sb.auth.getSession();
  const { data: me } = await sb.from("users").select("kind,registration").eq("id", sess.session!.user.id).maybeSingle();
  if (me?.kind === "staff" ? canView !== true : me?.registration !== "approved") redirect("/tickets");
  const { data: m } = /^[0-9a-f-]{36}$/i.test(id) ? await sb.from("materials").select("id,title,description,body,video_url,creator_name,created_at").eq("id", id).is("deleted_at", null).maybeSingle() : { data: null };
  if (!m) return <div className="card"><p>{S.matNotFound}</p><Link href="/materials">{S.matBack}</Link></div>;
  const { data: files } = await sb.from("material_files").select("id,path,file_name,kind,size_bytes").eq("material_id", m.id).order("created_at");
  const signed = await Promise.all((files ?? []).map(async (f) => ({ ...f, url: (await sb.storage.from("materials").createSignedUrl(f.path, 3600)).data?.signedUrl ?? null })));
  const embed = m.video_url ? embedUrl(m.video_url) : null;
  return (
    <div>
      <p><Link href="/materials">{S.matBack}</Link></p>
      <div className="card">
        <h1>{m.title}</h1>
        <p><small>{S.matBy.replace("{name}", m.creator_name)} · {fmtDT(m.created_at)}</small></p>
        {m.description ? <p><b>{m.description}</b></p> : null}
        {m.body ? <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{m.body}</div> : null}
      </div>
      {m.video_url && (
        <div className="card">
          <h2>{S.matVideoWord}</h2>
          {embed
            ? <div style={{ position: "relative", paddingTop: "56.25%" }}><iframe src={embed} allow="fullscreen; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, borderRadius: 8 }} /></div>
            : <a className="btn" href={m.video_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{S.tutOpenLink}</a>}
        </div>
      )}
      {signed.length > 0 && (
        <div className="card">
          <h2>{S.matFilesWord}</h2>
          {signed.map((f) => f.url && (
            <div key={f.id} style={{ marginBottom: 16 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{f.kind === "pdf" ? "📄" : f.kind === "image" ? "🖼" : "📎"} {f.file_name} <small>{size(f.size_bytes)}</small></span>
                <a className="btn" href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{S.matOpen}</a>
              </div>
              {f.kind === "image" && <img src={f.url} alt={f.file_name} style={{ maxWidth: "100%", borderRadius: 8, marginTop: 8 }} />}
              {f.kind === "pdf" && <iframe src={f.url} title={f.file_name} style={{ width: "100%", height: 560, border: "1px solid var(--line, #8884)", borderRadius: 8, marginTop: 8 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
