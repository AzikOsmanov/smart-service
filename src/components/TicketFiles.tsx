"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fmt } from "@/lib/fmt";
import type { PortalLabels } from "@/lib/i18n-portal";

export const TICKET_FILE_MAX = 25 * 1024 * 1024;

export async function uploadTicketFiles(tenantId: string, ticketId: string, userId: string, files: File[]): Promise<string[]> {
  const sb = supabaseBrowser();
  const failed: string[] = [];
  for (const f of files) {
    if (f.size > TICKET_FILE_MAX) { failed.push(`${f.name} (over 25 MB)`); continue; }
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const key = `${tenantId}/${ticketId}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from("ticket-files").upload(key, f, { contentType: f.type });
    if (up.error) { failed.push(f.name); continue; }
    const ins = await sb.from("ticket_attachments").insert({
      tenant_id: tenantId, ticket_id: ticketId, uploaded_by: userId, file_name: f.name.slice(0, 200),
      mime_type: f.type, size_bytes: f.size, storage_key: key, kind: f.type.startsWith("video/") ? "video" : f.type === "application/pdf" ? "pdf" : "image",
    });
    if (ins.error) failed.push(f.name);
  }
  return failed;
}

export default function TicketFiles({ tenantId, ticketId, userId, L }: { tenantId: string; ticketId: string; userId: string; L: PortalLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const files = Array.from((form.elements.namedItem("files") as HTMLInputElement).files ?? []);
    if (!files.length) return;
    setBusy(true); setErr("");
    const failed = await uploadTicketFiles(tenantId, ticketId, userId, files);
    if (failed.length) setErr(fmt(L.uploadFailed, { files: failed.join(", ") }));
    form.reset(); setBusy(false); router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="row">
      <input name="files" type="file" accept="image/*,video/*,application/pdf" multiple required />
      <button disabled={busy}>{busy ? L.uploading : L.addFiles}</button>
      {err && <span className="err">{err}</span>}
    </form>
  );
}
