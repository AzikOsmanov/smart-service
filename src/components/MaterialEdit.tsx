"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { StaffLabels } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

const MAX = 50 * 1024 * 1024;
const OK_TYPE = /^(application\/pdf|image\/|text\/plain|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|application\/zip)/;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|heic|txt|docx?|xlsx?|zip)$/i;

type M = { id: string; tenant_id: string; creator_name: string; title: string; description: string | null; body: string | null; video_url: string | null };
type F = { id: string; path: string; file_name: string };

// "Edit" button + pop-up: change texts, remove existing files, add new files.
export default function MaterialEdit({ m, files, S }: { m: M; files: F[]; S: StaffLabels }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [removed, setRemoved] = useState<string[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const add = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const text = String(fd.get("body") || "").trim();
    const video = String(fd.get("video") || "").trim();
    if (!text && !video && !add.length && files.length - removed.length <= 0) { setErr(S.matNeedContent); return; }
    if (video && !/^https:\/\/[^\s]+$/i.test(video)) { setErr(S.tutBadLink); return; }
    for (const f of add) {
      if (f.size > MAX) { setErr(fmt(S.matFileBig, { name: f.name })); return; }
      if (!OK_TYPE.test(f.type) && !OK_EXT.test(f.name)) { setErr(fmt(S.matFileType, { name: f.name })); return; }
    }
    setBusy(true);
    const sb = supabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("materials").update({
      creator_name: String(fd.get("creator") || "").trim(), title: String(fd.get("title") || "").trim(),
      description: String(fd.get("description") || "").trim() || null, body: text || null, video_url: video || null, updated_at: new Date().toISOString(),
    }).eq("id", m.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    const failed: string[] = [];
    for (const id of removed) {
      const f = files.find((x) => x.id === id);
      if (!f) continue;
      const d = await sb.from("material_files").delete().eq("id", id);
      if (d.error) { failed.push(f.file_name); continue; }
      await sb.storage.from("materials").remove([f.path]);
    }
    for (const f of add) {
      const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const path = `${m.tenant_id}/${m.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("materials").upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (up.error) { failed.push(f.name); continue; }
      const ins = await sb.from("material_files").insert({
        tenant_id: m.tenant_id, material_id: m.id, path, file_name: f.name.slice(0, 200), mime: f.type || null, size_bytes: f.size,
        kind: f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : f.type.startsWith("image/") ? "image" : "file", uploaded_by: u.user!.id,
      });
      if (ins.error) failed.push(f.name);
    }
    setBusy(false);
    router.refresh();
    if (failed.length) { setErr(fmt(S.matSomeFailed, { files: failed.join(", ") })); return; }
    setRemoved([]);
    ref.current?.close();
  }

  const left = files.filter((f) => !removed.includes(f.id));
  return (
    <>
      <button type="button" className="btn" onClick={() => { setErr(""); setRemoved([]); ref.current?.showModal(); }}>{S.matEdit}</button>
      <dialog ref={ref} className="modal" onCancel={(e) => e.preventDefault()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{S.matEditTitle}</h2>
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()} aria-label="Close">✕</button>
        </div>
        <form onSubmit={submit}>
          <label>{S.matCreator}<input name="creator" required maxLength={120} defaultValue={m.creator_name} /></label>
          <label>{S.matName}<input name="title" required maxLength={160} defaultValue={m.title} /></label>
          <label>{S.matDesc}<textarea name="description" rows={2} maxLength={1000} defaultValue={m.description ?? ""} /></label>
          <label>{S.matText}<textarea name="body" rows={8} maxLength={50000} defaultValue={m.body ?? ""} /></label>
          {left.length > 0 && (
            <div>
              <b>{S.matCurrentFiles}</b>
              {left.map((f) => (
                <div key={f.id} className="row" style={{ justifyContent: "space-between", margin: "6px 0" }}>
                  <span>📎 {f.file_name}</span>
                  <button type="button" className="btn danger" onClick={() => setRemoved((r) => [...r, f.id])}>{S.matRemoveFile}</button>
                </div>
              ))}
            </div>
          )}
          <label>{S.matAddMore}<input name="files" type="file" multiple accept="application/pdf,image/*,.txt,.doc,.docx,.xls,.xlsx,.zip" /></label>
          <label>{S.matVideo}<input name="video" type="url" placeholder="https://" defaultValue={m.video_url ?? ""} /></label>
          {err && <p className="err">{err}</p>}
          <button disabled={busy}>{busy ? S.tutUploading : S.matSaveChanges}</button>
        </form>
      </dialog>
    </>
  );
}
