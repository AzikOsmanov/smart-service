import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";

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
      <p>Devices are added when you create a ticket: choose a device or add a new one by serial number.</p>
      <p><a className="btn" href="/tickets/new" style={{ textDecoration: "none" }}>{t("newTicket")}</a></p>
      <div className="card">
        <table><thead><tr><th>SN</th><th>Model</th><th>Warranty until</th><th></th></tr></thead><tbody>
          {(devices ?? []).map((d) => (
            <tr key={d.id}><td>{d.serial_number}</td><td>{(d.model_id && model.get(d.model_id)) || "—"}</td><td>{d.warranty_until ?? "—"}</td>
              <td>{d.owner_id === uid ? <span className="badge">Yours</span> : <span className="badge">Previous owner (read only)</span>}</td></tr>))}
        </tbody></table>
        {!devices?.length && <p>No devices yet. They appear here after you create a ticket.</p>}
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
