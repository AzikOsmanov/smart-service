"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { StaffLabels } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

const MAX = 50 * 1024 * 1024;

export default function TutorialForm({ tenantId, S, onDone }: { tenantId: string; S: StaffLabels; onDone?: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(""); setOk("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    const f = file instanceof File && file.size > 0 ? file : null;
    const link = String(fd.get("url") || "").trim();
    if (!f && !link) { setErr(S.tutNeedSource); return; }
    if (f && f.size > MAX) { setErr(S.tutTooBig); return; }
    if (f && !f.type.startsWith("video/")) { setErr(S.tutOnlyVideo); return; }
    if (!f && !/^https:\/\/[^\s]+$/i.test(link)) { setErr(S.tutBadLink); return; }
    setBusy(true);
    const sb = supabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    let path: string | null = null;
    if (f) {
      const ext = (f.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
      path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("tutorials").upload(path, f, { contentType: f.type });
      if (up.error) { setErr(up.error.message); setBusy(false); return; }
    }
    const { data: row, error } = await sb.from("tutorials").insert({
      tenant_id: tenantId, title: String(fd.get("title") || "").trim(), description: String(fd.get("description") || "").trim() || null,
      audience: String(fd.get("audience") || "all"), source: f ? "upload" : "link", storage_path: path, url: f ? null : link,
      mime: f?.type ?? null, size_bytes: f?.size ?? null, created_by: u.user!.id,
    }).select("id").single();
    if (error || !row) { setErr(error?.message ?? S.failedWord); if (path) await sb.storage.from("tutorials").remove([path]); setBusy(false); return; }
    const { data: n, error: pe } = await sb.rpc("publish_tutorial", { p_id: row.id });
    setBusy(false);
    if (pe) { setErr(pe.message); return; }
    form.reset();
    const msg = fmt(S.tutSent, { n: String(n ?? 0) });
    setOk(msg);
    router.refresh();
    onDone?.(msg);
  }

  return (
    <form onSubmit={submit}>
      <label>{S.tutName}<input name="title" required maxLength={160} /></label>
      <label>{S.tutDesc}<textarea name="description" rows={3} maxLength={1000} /></label>
      <label>{S.tutAudience}
        <select name="audience" defaultValue="all">
          <option value="all">{S.tutAudAll}</option><option value="customers">{S.tutAudCustomers}</option><option value="staff">{S.tutAudStaff}</option>
        </select>
      </label>
      <label>{S.tutFile}<input name="file" type="file" accept="video/*" /></label>
      <label>{S.tutLink}<input name="url" type="url" placeholder="https://" /></label>
      {err && <p className="err">{err}</p>}
      {ok && <p>{ok}</p>}
      <button disabled={busy}>{busy ? S.tutUploading : S.tutPublish}</button>
    </form>
  );
}
