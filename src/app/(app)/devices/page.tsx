import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { getPortal } from "@/lib/i18n-portal";
import StaffDevices from "./staff";

async function CustomerDevices({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const sb = await supabaseServer();
  const { t } = await getT();
  const { L } = await getPortal();
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
      <p>{L.devicesIntro}</p>
      <p><a className="btn" href="/tickets/new" style={{ textDecoration: "none" }}>{t("newTicket")}</a></p>
      <div className="card">
        <table><thead><tr><th>{L.colSn}</th><th>{L.colModel}</th><th>{L.colWarranty}</th><th></th></tr></thead><tbody>
          {(devices ?? []).map((d) => (
            <tr key={d.id}><td>{d.serial_number}</td><td>{(d.model_id && model.get(d.model_id)) || "—"}</td><td>{d.warranty_until ?? "—"}</td>
              <td>{d.owner_id === uid ? <span className="badge">{L.yours}</span> : <span className="badge">{L.prevOwner}</span>}</td></tr>))}
        </tbody></table>
        {!devices?.length && <p>{L.noDevices}</p>}
      </div>
      {!!claims?.length && (
        <div className="card">
          <h2>{L.ownReq}</h2>
          <table><thead><tr><th>{L.colSn}</th><th>{L.colStatus}</th><th>{L.colSent}</th></tr></thead><tbody>
            {claims.map((c) => <tr key={c.id}><td>{serialById.get(c.device_id) ?? "—"}</td><td>{c.status}</td><td>{new Date(c.created_at).toLocaleString()}</td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

export default async function Devices(props: { searchParams: Promise<{ error?: string; ok?: string; q?: string }> }) {
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  const { data: me } = await sb.from("users").select("kind").eq("id", sess.session!.user.id).maybeSingle();
  if (me?.kind === "staff") return <StaffDevices searchParams={props.searchParams} />;
  return <CustomerDevices searchParams={props.searchParams} />;
}
