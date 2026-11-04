"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { uploadTicketFiles } from "@/components/TicketFiles";
import SnInput from "@/components/SnInput";

type Dev = { id: string; serial_number: string; model?: string | null };
const NEW = "__new__";

export default function NewTicketForm({ tenantId, companyId, userId, devices }: { tenantId: string; companyId: string; userId: string; devices: Dev[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState(devices[0]?.id ?? NEW);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [needLabel, setNeedLabel] = useState(false);

  async function resolveDevice(sb: ReturnType<typeof supabaseBrowser>, fd: FormData): Promise<string | null> {
    if (choice !== NEW) return choice;
    const serial = String(fd.get("sn") || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/.test(serial)) { setErr("Enter a valid serial number (4-64 letters, digits, - _ / .)."); return null; }
    const ins = await sb.from("devices").insert({ tenant_id: tenantId, serial_number: serial, owner_id: userId, added_by: userId, company_id: companyId }).select("id").single();
    if (!ins.error && ins.data) return ins.data.id;
    if (ins.error?.code !== "23505") { setErr(ins.error?.message ?? "Could not add the device."); return null; }

    // Serial number already registered by someone else: ownership request with a photo of the label.
    const file = fd.get("label");
    if (!(file instanceof File) || file.size === 0) {
      setNeedLabel(true);
      setErr("This serial number is already registered. To continue, attach a photo of the device label and send again.");
      return null;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setErr("The label photo must be a JPG, PNG or WEBP image."); return null; }
    if (file.size > 4 * 1024 * 1024) { setErr("The label photo is too large (4 MB max)."); return null; }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${tenantId}/${userId}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from("device-labels").upload(path, file, { contentType: file.type });
    if (up.error) { setErr("Could not upload the photo: " + up.error.message); return null; }
    const { data: result, error } = await sb.rpc("submit_device_claim", { p_serial: serial, p_label_photo_key: path });
    if (error) { setErr(error.message === "already_yours" ? "This device is already in your list. Select it above." : error.message); return null; }
    if (result === "approved") {
      const { data: d } = await sb.from("devices").select("id").eq("serial_number", serial).eq("owner_id", userId).is("deleted_at", null).maybeSingle();
      if (d) return d.id;
    }
    setInfo(`Ownership request for ${serial} was sent. The service team will review it. You can open a ticket for this device once it is approved.`);
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const subject = String(fd.get("subject") || "").trim();
    const description = String(fd.get("description") || "").trim();
    setErr(""); setInfo("");
    if (subject.length < 3 || !description) { setErr("Please fill in the subject and describe the problem."); return; }
    setBusy(true);
    const sb = supabaseBrowser();
    const deviceId = await resolveDevice(sb, fd);
    if (!deviceId) { setBusy(false); return; }
    const { data, error } = await sb.from("tickets").insert({
      tenant_id: tenantId, customer_id: userId, company_id: companyId, device_id: deviceId, subject, description, status: "new",
    }).select("id").single();
    if (error || !data) { setErr(error?.message ?? "Could not create the ticket"); setBusy(false); return; }
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const failed = files.length ? await uploadTicketFiles(tenantId, data.id, userId, files) : [];
    router.push(`/tickets/${data.id}${failed.length ? "?warn=" + encodeURIComponent("Ticket created, but these files failed: " + failed.join(", ")) : ""}`);
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ maxWidth: 680 }}>
      <h2>1. Device</h2>
      {devices.map((d) => (
        <label key={d.id} className="row" style={{ cursor: "pointer" }}>
          <input type="radio" name="pick" checked={choice === d.id} onChange={() => setChoice(d.id)} style={{ width: "auto" }} />
          <span><b>{d.serial_number}</b>{d.model ? ` — ${d.model}` : ""}</span>
        </label>
      ))}
      <label className="row" style={{ cursor: "pointer" }}>
        <input type="radio" name="pick" checked={choice === NEW} onChange={() => setChoice(NEW)} style={{ width: "auto" }} />
        <span>{devices.length ? "Another device (add by serial number)" : "Add your device by serial number"}</span>
      </label>
      {choice === NEW && (
        <div>
          <SnInput name="sn" required placeholder="Serial number (type or scan)" />
          {needLabel && (
            <label>Photo of the SN label
              <input name="label" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" /></label>
          )}
        </div>
      )}
      <h2>2. What is wrong?</h2>
      <label>Subject<input name="subject" required minLength={3} maxLength={160} /></label>
      <label>Description<textarea name="description" required rows={6} maxLength={4000} /></label>
      <label>Photos / videos / PDF (optional, up to 25 MB each)<input name="files" type="file" accept="image/*,video/*,application/pdf" multiple /></label>
      {err && <p className="err">{err}</p>}
      {info && <p>{info}</p>}
      <button disabled={busy}>{busy ? "Sending…" : "Send to the service team"}</button>
    </form>
  );
}
