"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { uploadTicketFiles } from "@/components/TicketFiles";
import SnInput from "@/components/SnInput";
import type { PortalLabels } from "@/lib/i18n-portal";

export default function PasswordResetForm({ tenantId, companyId, userId, L }: { tenantId: string; companyId: string; userId: string; L: PortalLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [needRegister, setNeedRegister] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sn = String(fd.get("sn") || "").replace(/\s+/g, "").toUpperCase();
    setErr("");
    if (!/^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/.test(sn)) { setErr(L.errInvalidSn); return; }
    const photo = fd.get("label");
    if (!(photo instanceof File) || photo.size === 0) { setErr(L.prPhotoRequired); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) { setErr(L.errLabelType); return; }
    if (photo.size > 4 * 1024 * 1024) { setErr(L.errLabelBig); return; }
    setBusy(true);
    const sb = supabaseBrowser();

    const reg = await sb.rpc("is_serial_registered", { p_serial: sn });
    if (reg.error) { setErr(reg.error.message); setBusy(false); return; }
    if (reg.data !== true) {
      if (fd.get("registerNow") !== "on") { setNeedRegister(true); setErr(L.prNotRegistered); setBusy(false); return; }
      const ins = await sb.from("devices").insert({ tenant_id: tenantId, serial_number: sn, owner_id: userId, added_by: userId, company_id: companyId });
      if (ins.error && ins.error.code !== "23505") { setErr(ins.error.message); setBusy(false); return; }
    }

    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const key = `${tenantId}/${userId}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from("device-labels").upload(key, photo, { contentType: photo.type });
    if (up.error) { setErr(L.errUpload + up.error.message); setBusy(false); return; }

    const { data: ticketId, error } = await sb.rpc("request_password_reset", {
      p_serial: sn, p_label_photo_key: key, p_method: String(fd.get("method") || "send_code"), p_note: String(fd.get("note") || ""),
    });
    if (error || !ticketId) {
      setErr(error?.message === "serial_not_registered" ? L.prRegisteredNeeded : error?.message === "invalid_serial" ? L.errInvalidSn : error?.message ?? L.errTicket);
      setBusy(false); return;
    }
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length) await uploadTicketFiles(tenantId, ticketId as string, userId, files);
    router.push(`/tickets/${ticketId}`);
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ maxWidth: 680 }}>
      <h1>{L.prTitle}</h1>
      <p>{L.prIntro}</p>
      <label>{L.snDefault}<SnInput L={L} name="sn" required placeholder={L.snPlaceholder} /></label>
      {needRegister && (
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" name="registerNow" style={{ width: "auto" }} /> {L.prRegisterNow}
        </label>
      )}
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>{L.prMethod}</legend>
        <label className="row"><input type="radio" name="method" value="send_code" defaultChecked style={{ width: "auto" }} /> {L.prMethodCode}</label>
        <label className="row"><input type="radio" name="method" value="bring_device" style={{ width: "auto" }} /> {L.prMethodBring}</label>
      </fieldset>
      <label>{L.prLabelPhoto}<input name="label" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required /></label>
      <label>{L.prFiles}<input name="files" type="file" multiple /></label>
      <label>{L.prNote}<textarea name="note" rows={3} maxLength={1000} /></label>
      {err && <p className="err">{err}</p>}
      <button disabled={busy}>{busy ? L.prSending : L.prSubmit}</button>
    </form>
  );
}
