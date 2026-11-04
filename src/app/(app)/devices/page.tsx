import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";

function go(key: "error" | "ok", msg: string): never { redirect(`/devices?${key}=${encodeURIComponent(msg)}`); }

async function addDevice(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const serial = String(fd.get("serial") || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/.test(serial)) go("error", "Enter a valid serial number (4-64 letters, digits, - _ / .).");
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const { data: me } = await sb.from("users").select("tenant_id,company_id").eq("id", uid).single();
  if (!me) go("error", "Account not found.");
  const ins = await sb.from("devices").insert({ tenant_id: me!.tenant_id, serial_number: serial, owner_id: uid, added_by: uid, company_id: me!.company_id });
  if (!ins.error) { revalidatePath("/devices"); go("ok", `Device ${serial} added.`); }
  if (ins.error.code !== "23505") go("error", ins.error.message);

  // The serial number is already registered by someone else: ownership request with a photo of the label.
  const file = fd.get("label");
  if (!(file instanceof File) || file.size === 0) go("error", "This serial number is already registered. To request ownership, attach a photo of the device label and submit again.");
  const f = file as File;
  if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) go("error", "The label photo must be a JPG, PNG or WEBP image.");
  if (f.size > 4 * 1024 * 1024) go("error", "The label photo is too large (4 MB max).");
  const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
  const path = `${me!.tenant_id}/${uid}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from("device-labels").upload(path, f, { contentType: f.type });
  if (up.error) go("error", "Could not upload the photo: " + up.error.message);
  const { data: result, error } = await sb.rpc("submit_device_claim", { p_serial: serial, p_label_photo_key: path });
  if (error) go("error", error.message === "already_yours" ? "This device is already in your list." : error.message);
  revalidatePath("/devices");
  go("ok", result === "approved" ? `Device ${serial} was transferred to you.` : `Ownership request for ${serial} sent. The service team will review it.`);
}

export default async function Devices({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const sb = await supabaseServer();
  const { t } = await getT();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const [{ data: devices }, { data: models }, { data: claims }] = await Promise.all([
    sb.from("devices").select("id,serial_number,model_id,owner_id,warranty_until,created_at").is("deleted_at", null).order("created_at", { ascending: false }),
    sb.from("device_models").select("id,name"),
    sb.from("device_claims").select("id,device_id,status,created_at").eq("claimant_id", uid).order("created_at", { ascending: false }),
  ]);
  const model = new Map((models ?? []).map((m) => [m.id, m.name]));
  const serialById = new Map((devices ?? []).map((d) => [d.id, d.serial_number]));
  return (
    <div>
      <h1>{t("devices")}</h1>
      {error && <p className="err">{error}</p>}
      {ok && <p>{ok}</p>}
      <form action={addDevice} className="card" style={{ maxWidth: 560 }}>
        <h2>Add a device</h2>
        <label>Serial number (SN)<input name="serial" required placeholder="e.g. ABC123456" autoComplete="off" /></label>
        <label>Photo of the SN label <small>(only needed if the device is already registered to someone else)</small>
          <input name="label" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" /></label>
        <button>Add device</button>
      </form>
      <div className="card">
        <table><thead><tr><th>SN</th><th>Model</th><th>Warranty until</th><th></th></tr></thead><tbody>
          {(devices ?? []).map((d) => (
            <tr key={d.id}><td>{d.serial_number}</td><td>{(d.model_id && model.get(d.model_id)) || "—"}</td><td>{d.warranty_until ?? "—"}</td>
              <td>{d.owner_id === uid ? <span className="badge">Yours</span> : <span className="badge">Previous owner (read only)</span>}</td></tr>))}
        </tbody></table>
        {!devices?.length && <p>No devices yet. Add your first device above.</p>}
      </div>
      {!!claims?.length && (
        <div className="card">
          <h2>Ownership requests</h2>
          <table><thead><tr><th>SN</th><th>Status</th><th>Sent</th></tr></thead><tbody>
            {claims.map((c) => <tr key={c.id}><td>{serialById.get(c.device_id) ?? "—"}</td><td>{c.status}</td><td>{new Date(c.created_at).toLocaleString()}</td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
