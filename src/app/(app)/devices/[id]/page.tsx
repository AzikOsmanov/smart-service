import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

async function save(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { error } = await sb.from("devices").update({
    model_id: String(fd.get("model") || "") || null,
    warranty_until: String(fd.get("warranty") || "") || null,
    is_verified: fd.get("verified") === "on",
    notes: String(fd.get("notes") || "") || null,
  }).eq("id", id);
  if (error) redirect(`/devices/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/devices/${id}`);
  redirect(`/devices/${id}?ok=${encodeURIComponent("Saved.")}`);
}

export default async function DeviceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  const { data: me } = await sb.from("users").select("kind").eq("id", sess.session!.user.id).maybeSingle();
  if (me?.kind !== "staff") redirect("/devices");
  const { data: d } = await sb.from("devices").select("*").eq("id", id).maybeSingle();
  if (!d) notFound();
  const [{ data: canEdit }, { data: models }, { data: owner }, { data: tickets }, { data: hist }, { data: qc }] = await Promise.all([
    sb.rpc("has_permission", { p_code: "devices.edit" }),
    sb.from("device_models").select("id,name").is("deleted_at", null).order("name"),
    d.owner_id ? sb.from("users").select("first_name,last_name,email,phone,companies(name,city)").eq("id", d.owner_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("tickets").select("id,ticket_no,subject,status,created_at").eq("device_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
    sb.from("device_ownership_history").select("id,user_id,owned_from,owned_until").eq("device_id", id).order("owned_from", { ascending: false }),
    sb.from("qc_checks").select("id,status,created_at").eq("serial_number", d.serial_number).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
  ]);
  const histIds = Array.from(new Set((hist ?? []).map((h) => h.user_id).filter(Boolean))) as string[];
  const { data: histUsers } = histIds.length ? await sb.from("users").select("id,first_name,last_name,companies(name)").in("id", histIds) : { data: [] };
  const hu = new Map((histUsers ?? []).map((u: any) => [u.id, `${u.first_name} ${u.last_name}${u.companies?.name ? " · " + u.companies.name : ""}`]));
  const o: any = owner;
  const qcLabel: Record<string, string> = { done: "Done", broken: "Broken", hardware_issue: "Hardware issue" };
  return (
    <div>
      <div className="card">
        <p><Link href="/devices">← Devices</Link></p>
        <h1>SN {d.serial_number}</h1>
        <p>Owner: {o ? <b>{o.first_name} {o.last_name}</b> : "—"} {o && <small>{o.companies?.name}{o.companies?.city ? ` / ${o.companies.city}` : ""} · {o.email} {o.phone}</small>}</p>
        <p><small>Added {new Date(d.created_at).toLocaleString()}</small></p>
        {error && <p className="err">{error}</p>}
        {ok && <p>{ok}</p>}
      </div>
      {canEdit === true ? (
        <form action={save} className="card" style={{ maxWidth: 560 }}>
          <input type="hidden" name="id" value={id} />
          <label>Model<select name="model" defaultValue={d.model_id ?? ""}><option value="">— not set —</option>{(models ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Warranty until<input name="warranty" type="date" defaultValue={d.warranty_until ?? ""} /></label>
          <label className="row"><input name="verified" type="checkbox" defaultChecked={d.is_verified} style={{ width: "auto" }} /> Verified by the service center</label>
          <label>Notes (staff only)<textarea name="notes" rows={3} defaultValue={d.notes ?? ""} /></label>
          <button>Save</button>
        </form>
      ) : (
        <div className="card"><p>Model: {(models ?? []).find((m) => m.id === d.model_id)?.name ?? "—"} · Warranty until: {d.warranty_until ?? "—"} · Verified: {d.is_verified ? "Yes" : "No"}</p></div>
      )}
      <div className="card">
        <h2>Tickets</h2>
        <table><tbody>
          {(tickets ?? []).map((t) => <tr key={t.id}><td><Link href={`/tickets/${t.id}`}>{t.ticket_no}</Link></td><td>{t.subject}</td><td>{t.status}</td><td>{new Date(t.created_at).toLocaleDateString()}</td></tr>)}
          {(tickets ?? []).length === 0 && <tr><td>No tickets for this device.</td></tr>}
        </tbody></table>
      </div>
      <div className="card">
        <h2>Quality Control</h2>
        <ul>{(qc ?? []).map((c) => <li key={c.id}><Link href={`/qc/${c.id}`}>{new Date(c.created_at).toLocaleString()}</Link> — {qcLabel[c.status] ?? c.status}</li>)}</ul>
        {(qc ?? []).length === 0 && <p>No QC checks yet.</p>}
        <p><Link href={`/qc/new?sn=${encodeURIComponent(d.serial_number)}`}>New QC check</Link> · <Link href={`/qc?sn=${encodeURIComponent(d.serial_number)}`}>All checks</Link></p>
      </div>
      <div className="card">
        <h2>Ownership history</h2>
        <table><thead><tr><th>Owner</th><th>From</th><th>Until</th></tr></thead><tbody>
          {(hist ?? []).map((h) => <tr key={h.id}><td>{(h.user_id && hu.get(h.user_id)) || "—"}</td><td>{new Date(h.owned_from).toLocaleDateString()}</td><td>{h.owned_until ? new Date(h.owned_until).toLocaleDateString() : "now"}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}
