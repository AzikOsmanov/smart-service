import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import SnInput from "@/components/SnInput";

async function addDevice(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const serial = String(fd.get("serial") || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-_/.]{3,63}$/.test(serial)) redirect("/devices?error=" + encodeURIComponent("Enter a valid serial number (4-64 letters, digits, - _ / .)."));
  const ownerId = String(fd.get("owner") || "");
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  let company: string | null = null;
  if (ownerId) {
    const { data: o } = await sb.from("users").select("company_id").eq("id", ownerId).maybeSingle();
    company = o?.company_id ?? null;
  }
  const { error } = await sb.from("devices").insert({
    tenant_id: me!.tenant_id, serial_number: serial, model_id: String(fd.get("model") || "") || null,
    owner_id: ownerId || null, company_id: company, added_by: auth.user!.id,
    warranty_until: String(fd.get("warranty") || "") || null,
  });
  if (error) redirect("/devices?error=" + encodeURIComponent(error.code === "23505" ? "This serial number is already registered." : error.message));
  revalidatePath("/devices");
  redirect("/devices?ok=" + encodeURIComponent(`Device ${serial} added.`));
}

export default async function StaffDevices({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; q?: string }> }) {
  const { error: msgErr, ok, q } = await searchParams;
  const sb = await supabaseServer();
  const [{ data: canEdit }, { data: canModels }] = await Promise.all([
    sb.rpc("has_permission", { p_code: "devices.edit" }), sb.rpc("has_permission", { p_code: "devices.models.view" }),
  ]);
  const term = (q ?? "").trim().replace(/[%,()]/g, "");
  let query = sb.from("devices").select("id,serial_number,model_id,owner_id,warranty_until,is_verified,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (term) query = query.ilike("serial_number", `%${term}%`);
  const [{ data: devices, error }, { data: models }, { data: customers }] = await Promise.all([
    query,
    sb.from("device_models").select("id,name").is("deleted_at", null).order("name"),
    sb.from("users").select("id,first_name,last_name,email,companies(name)").eq("kind", "customer").eq("registration", "approved").is("deleted_at", null).order("first_name"),
  ]);
  const model = new Map((models ?? []).map((m) => [m.id, m.name]));
  const owner = new Map((customers ?? []).map((c: any) => [c.id, `${c.first_name} ${c.last_name}${c.companies?.name ? " · " + c.companies.name : ""}`]));
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Devices</h1>
        {canModels === true && <Link className="btn" href="/devices/models">Device models</Link>}
      </div>
      {msgErr && <p className="err">{msgErr}</p>}
      {ok && <p>{ok}</p>}
      <form method="get" className="card row">
        <input name="q" placeholder="Search by serial number" defaultValue={q ?? ""} />
        <button>Search</button>
      </form>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>Serial number</th><th>Model</th><th>Owner</th><th>Warranty until</th><th>Verified</th><th>Added</th></tr></thead><tbody>
          {(devices ?? []).map((d) => (
            <tr key={d.id}>
              <td><Link href={`/devices/${d.id}`}><b>{d.serial_number}</b></Link></td>
              <td>{(d.model_id && model.get(d.model_id)) || "—"}</td>
              <td>{(d.owner_id && owner.get(d.owner_id)) || "—"}</td>
              <td>{d.warranty_until ?? "—"}</td>
              <td>{d.is_verified ? "Yes" : "No"}</td>
              <td>{new Date(d.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {(devices ?? []).length === 0 && <tr><td colSpan={6}>No devices found.</td></tr>}
        </tbody></table>
      </div>
      {canEdit === true && (
        <form action={addDevice} className="card" style={{ maxWidth: 640 }}>
          <h2>Add a device for a customer</h2>
          <label>Serial number<SnInput name="serial" required /></label>
          <label>Model<select name="model" defaultValue=""><option value="">— not set —</option>{(models ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Owner (approved customer)<select name="owner" defaultValue=""><option value="">— no owner yet —</option>{(customers ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.companies?.name ? ` · ${c.companies.name}` : ""}</option>)}</select></label>
          <label>Warranty until<input name="warranty" type="date" /></label>
          <button>Add device</button>
        </form>
      )}
    </div>
  );
}
