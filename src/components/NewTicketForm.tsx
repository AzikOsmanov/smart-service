"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { uploadTicketFiles } from "@/components/TicketFiles";
import SnInput from "@/components/SnInput";
import { fmt } from "@/lib/fmt";
import type { PortalLabels } from "@/lib/i18n-portal";

type Dev = { id: string; serial_number: string; model?: string | null };
const NEW = "__new__";

export default function NewTicketForm({ tenantId, companyId, userId, devices, L }: { tenantId: string; companyId: string; userId: string; devices: Dev[]; L: PortalLabels }) {
  const router = useRouter();
  const [choice, setChoice] = useState(devices[0]?.id ?? NEW);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [needLabel, setNeedLabel] = useState(false);

  async function resolveDevice(sb: ReturnType<typeof supabaseBrowser>, fd: FormData): Promise<string | null> {
    if (choice !== NEW) return choice;
    const serial = String(fd.get("sn") || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/.test(serial)) { setErr(L.errInvalidSn); return null; }
    const ins = await sb.from("devices").insert({ tenant_id: tenantId, serial_number: serial, owner_id: userId, added_by: userId, company_id: companyId }).select("id").single();
    if (!ins.error && ins.data) return ins.data.id;
    if (ins.error?.code !== "23505") { setErr(ins.error?.message ?? L.errAddDevice); return null; }

    // Serial number already registered by someone else: ownership request with a photo of the label.
    const file = fd.get("label");
    if (!(file instanceof File) || file.size === 0) {
      setNeedLabel(true);
      setErr(L.errAlreadyReg);
      return null;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setErr(L.errLabelType); return null; }
    if (file.size > 4 * 1024 * 1024) { setErr(L.errLabelBig); return null; }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${tenantId}/${userId}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from("device-labels").upload(path, file, { contentType: file.type });
    if (up.error) { setErr(L.errUpload + up.error.message); return null; }
    const { data: result, error } = await sb.rpc("submit_device_claim", { p_serial: serial, p_label_photo_key: path });
    if (error) { setErr(error.message === "already_yours" ? L.errAlreadyYours : error.message); return null; }
    if (result === "approved") {
      const { data: d } = await sb.from("devices").select("id").eq("serial_number", serial).eq("owner_id", userId).is("deleted_at", null).maybeSingle();
      if (d) return d.id;
    }
    setInfo(fmt(L.claimSent, { sn: serial }));
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const subject = String(fd.get("subject") || "").trim();
    const description = String(fd.get("description") || "").trim();
    setErr(""); setInfo("");
    if (subject.length < 3 || !description) { setErr(L.errFill); return; }
    setBusy(true);
    const sb = supabaseBrowser();
    const deviceId = await resolveDevice(sb, fd);
    if (!deviceId) { setBusy(false); return; }
    const { data, error } = await sb.from("tickets").insert({
      tenant_id: tenantId, customer_id: userId, company_id: companyId, device_id: deviceId, subject, description, status: "new",
    }).select("id").single();
    if (error || !data) { setErr(error?.message ?? L.errTicket); setBusy(false); return; }
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const failed = files.length ? await uploadTicketFiles(tenantId, data.id, userId, files) : [];
    router.push(`/tickets/${data.id}${failed.length ? "?warn=" + encodeURIComponent(fmt(L.warnFiles, { files: failed.join(", ") })) : ""}`);
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ maxWidth: 680 }}>
      <h2>{L.step1}</h2>
      {devices.map((d) => (
        <label key={d.id} className="row" style={{ cursor: "pointer" }}>
          <input type="radio" name="pick" checked={choice === d.id} onChange={() => setChoice(d.id)} style={{ width: "auto" }} />
          <span><b>{d.serial_number}</b>{d.model ? ` — ${d.model}` : ""}</span>
        </label>
      ))}
      <label className="row" style={{ cursor: "pointer" }}>
        <input type="radio" name="pick" checked={choice === NEW} onChange={() => setChoice(NEW)} style={{ width: "auto" }} />
        <span>{devices.length ? L.anotherDevice : L.addFirstDevice}</span>
      </label>
      {choice === NEW && (
        <div>
          <SnInput L={L} name="sn" required placeholder={L.snPlaceholder} />
          {needLabel && (
            <label>{L.snLabelPhoto}
              <input name="label" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" /></label>
          )}
        </div>
      )}
      <h2>{L.step2}</h2>
      <label>{L.subject}<input name="subject" required minLength={3} maxLength={160} /></label>
      <label>{L.description}<textarea name="description" required rows={6} maxLength={4000} /></label>
      <label>{L.filesOptional}<input name="files" type="file" accept="image/*,video/*,application/pdf" multiple /></label>
      {err && <p className="err">{err}</p>}
      {info && <p>{info}</p>}
      <button disabled={busy}>{busy ? L.sending : L.sendToTeam}</button>
    </form>
  );
}
