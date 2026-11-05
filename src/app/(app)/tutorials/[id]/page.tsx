import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { embedUrl } from "@/lib/video";

export default async function Tutorial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: t } = /^[0-9a-f-]{36}$/i.test(id) ? await sb.from("tutorials").select("id,title,description,source,storage_path,url,mime").eq("id", id).is("deleted_at", null).maybeSingle() : { data: null };
  if (!t) return <div className="card"><p>{S.tutNotFound}</p><Link href="/tutorials">{S.tutBack}</Link></div>;
  const signed = t.source === "upload" && t.storage_path ? (await sb.storage.from("tutorials").createSignedUrl(t.storage_path, 3600)).data?.signedUrl ?? null : null;
  const embed = t.source === "link" && t.url ? embedUrl(t.url) : null;
  return (
    <div>
      <p><Link href="/tutorials">{S.tutBack}</Link></p>
      <div className="card">
        <h1>{t.title}</h1>
        {t.description ? <p>{t.description}</p> : null}
        {signed && <video src={signed} controls playsInline preload="metadata" style={{ width: "100%", maxHeight: "70vh", background: "#000", borderRadius: 8 }} />}
        {embed && <div style={{ position: "relative", paddingTop: "56.25%" }}><iframe src={embed} allow="fullscreen; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, borderRadius: 8 }} /></div>}
        {t.source === "link" && !embed && t.url && <a className="btn" href={t.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{S.tutOpenLink}</a>}
      </div>
    </div>
  );
}
