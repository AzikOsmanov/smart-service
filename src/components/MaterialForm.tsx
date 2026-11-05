"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { StaffLabels } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

const MAX = 50 * 1024 * 1024;
const OK_TYPE = /^(application\/pdf|image\/|text\/plain|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|application\/zip)/;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|heic|txt|docx?|xlsx?|zip)$/i;

export default function MaterialForm({ tenantId, creator, S, onDone }: { tenantId: string; creator: string; S: StaffLabels; onDone?: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const text = String(fd.get("body") || "").trim();
    const video = String(fd.get("video") || "").trim();
    if (!text && !files.length && !video) { setErr(S.matNeedContent); return; }
    if (video && !/^https:\/\/[^\s]+$/i.test(video)) { setErr(S.tutBadLink); return; }
    for (const f of files) {
      if (f.size > MAX) { setErr(fmt(S.matFileBig, { name: f.name })); return; }
      if (!OK_TYPE.test(f.type) && !OK_EXT.test(f.name)) { setErr(fmt(S.matFileType, { name: f.name })); return; }
    }
    setBusy(true);
    const sb = supabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    const { data: row, error } = await sb.from("materials").insert({
      tenant_id: tenantId, creator_name: String(fd.get("creator") || "").trim(), title: String(fd.get("title") || "").trim(),
      description: String(fd.get("description") || "").trim() || null, body: text || null, video_url: video || null, created_by: u.user!.id,
    }).select("id").single();
    if (error || !row) { setErr(error?.message ?? S.failedWord); setBusy(false); return; }
    const failed: string[] = [];
    for (const f of files) {
      const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const path = `${tenantId}/${row.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("materials").upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (up.error) { failed.push(f.name); continue; }
      const ins = await sb.from("material_files").insert({
        tenant_id: tenantId, material_id: row.id, path, file_name: f.name.slice(0, 200), mime: f.type || null, size_bytes: f.size,
        kind: f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : f.type.startsWith("image/") ? "image" : "file", uploaded_by: u.user!.id,
      });
      if (ins.error) failed.push(f.name);
    }
    setBusy(false);
    form.reset();
    const msg = failed.length ? fmt(S.matSomeFailed, { files: failed.join(", ") }) : S.matSaved;
    router.refresh();
    if (failed.length) setErr(msg); else onDone?.(msg);
  }

  return (
    <form onSubmit={submit}>
      <label>{S.matCreator}<input name="creator" required maxLength={120} defaultValue={creator} /></label>
      <label>{S.matName}<input name="title" required maxLength={160} /></label>
      <label>{S.matDesc}<textarea name="description" rows={2} maxLength={1000} /></label>
      <label>{S.matText}<textarea name="body" rows={8} maxLength={50000} /></label>
      <label>{S.matFiles}<input name="files" type="file" multiple accept="application/pdf,image/*,.txt,.doc,.docx,.xls,.xlsx,.zip" /></label>
      <label>{S.matVideo}<input name="video" type="url" placeholder="https://" /></label>
      {err && <p className="err">{err}</p>}
      <button disabled={busy}>{busy ? S.tutUploading : S.matSave}</button>
    </form>
  );
}
