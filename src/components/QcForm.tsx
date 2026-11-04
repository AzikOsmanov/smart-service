"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { QC_LABEL, QC_STATUSES } from "@/lib/qc";

const MAX = 50 * 1024 * 1024;

export default function QcForm({ tenantId, initialSn, ticketId }: { tenantId: string; initialSn: string; ticketId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    for (const f of files) {
      if (f.size > MAX) { setErr(`${f.name} is larger than 50 MB`); setBusy(false); return; }
      if (!/^(image|video)\//.test(f.type)) { setErr(`${f.name}: only images and videos are allowed`); setBusy(false); return; }
    }
    const sb = supabaseBrowser();
    const { data: id, error } = await sb.rpc("qc_record", {
      p_serial: String(fd.get("sn")), p_status: String(fd.get("status")), p_comment: String(fd.get("comment") || ""), p_ticket: ticketId,
    });
    if (error || !id) { setErr(error?.message === "invalid_serial" ? "Serial number is not valid" : error?.message ?? "Failed"); setBusy(false); return; }
    const { data: u } = await sb.auth.getUser();
    const failed: string[] = [];
    for (const f of files) {
      const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const path = `${tenantId}/${id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("qc-media").upload(path, f, { contentType: f.type });
      if (up.error) { failed.push(f.name); continue; }
      const ins = await sb.from("qc_media").insert({
        tenant_id: tenantId, qc_id: id, path, kind: f.type.startsWith("video/") ? "video" : "image",
        mime: f.type, size_bytes: f.size, uploaded_by: u.user!.id,
      });
      if (ins.error) failed.push(f.name);
    }
    if (failed.length) { setErr(`Saved, but these files failed: ${failed.join(", ")}`); setBusy(false); router.push(`/qc/${id}`); return; }
    router.push(`/qc/${id}`);
  }

  return (
    <form onSubmit={submit}>
      <label>Serial number (SN)<input name="sn" defaultValue={initialSn} required minLength={4} /></label>
      <label>QC status
        <select name="status" defaultValue="done">
          {QC_STATUSES.map((s) => <option key={s} value={s}>{QC_LABEL[s]}</option>)}
        </select>
      </label>
      <label>Comments<textarea name="comment" rows={4} placeholder="What was tested, what you found…" /></label>
      <label>Photos / videos (up to 50 MB each)
        <input name="files" type="file" accept="image/*,video/*" multiple />
      </label>
      {err && <p className="err">{err}</p>}
      <button disabled={busy}>{busy ? "Saving…" : "Save QC check"}</button>
    </form>
  );
}
