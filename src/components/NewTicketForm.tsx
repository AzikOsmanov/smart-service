"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { uploadTicketFiles } from "@/components/TicketFiles";

export default function NewTicketForm({ tenantId, companyId, userId, devices }: { tenantId: string; companyId: string; userId: string; devices: { id: string; serial_number: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const subject = String(fd.get("subject") || "").trim();
    const description = String(fd.get("description") || "").trim();
    if (subject.length < 3 || !description) { setErr("Please fill in the subject and describe the problem."); return; }
    setBusy(true); setErr("");
    const sb = supabaseBrowser();
    const { data, error } = await sb.from("tickets").insert({
      tenant_id: tenantId, customer_id: userId, company_id: companyId, device_id: String(fd.get("device")), subject, description, status: "new",
    }).select("id").single();
    if (error || !data) { setErr(error?.message ?? "Could not create the ticket"); setBusy(false); return; }
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const failed = files.length ? await uploadTicketFiles(tenantId, data.id, userId, files) : [];
    router.push(`/tickets/${data.id}${failed.length ? "?warn=" + encodeURIComponent("Ticket created, but these files failed: " + failed.join(", ")) : ""}`);
  }
  return (
    <form onSubmit={onSubmit} className="card" style={{ maxWidth: 640 }}>
      <label>Device<select name="device" required>{devices.map((d) => <option key={d.id} value={d.id}>{d.serial_number}</option>)}</select></label>
      <label>Subject<input name="subject" required minLength={3} maxLength={160} /></label>
      <label>What is wrong?<textarea name="description" required rows={6} maxLength={4000} /></label>
      <label>Photos / videos / PDF (optional, up to 25 MB each)<input name="files" type="file" accept="image/*,video/*,application/pdf" multiple /></label>
      {err && <p className="err">{err}</p>}
      <button disabled={busy}>{busy ? "Sending…" : "Send to the service team"}</button>
    </form>
  );
}
