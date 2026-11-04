import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

async function apply(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const id = String(fd.get("id"));
  await sb.from("tickets").update({ assigned_to: auth.user!.id, status: "assigned" }).eq("id", id).is("assigned_to", null);
  revalidatePath(`/tickets/${id}`);
}

async function setStatus(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { error } = await sb.rpc("set_device_service_status", { p_ticket: id, p_status: String(fd.get("status")), p_comment: String(fd.get("comment") || "") });
  if (error) redirect(`/tickets/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/tickets/${id}`);
}

async function saveManual(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const date = (k: string) => (String(fd.get(k) || "") || null);
  const { error } = await sb.rpc("save_manual_device_info", {
    p_ticket: id, p_model: String(fd.get("model") || ""), p_warranty_until: date("warranty"),
    p_sold_date: date("sold"), p_customer_name: String(fd.get("customer") || ""),
  });
  if (error) redirect(`/tickets/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/tickets/${id}`);
}

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const sb = await supabaseServer();
  const { data: t } = await sb.from("tickets").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: dev } = await sb.from("devices").select("serial_number").eq("id", t.device_id).maybeSingle();
  const { data: state } = await sb.from("ticket_service_state").select("status,comment,changed_at").eq("ticket_id", id).maybeSingle();
  const { data: info } = await sb.from("device_external_info").select("model_name,sold_date,warranty_until,customer_name,source").eq("ticket_id", id).maybeSingle();
  const staff = state !== null || t.assigned_to !== null || info !== null;
  return (
    <div>
      <p><a href="/tickets">← Tickets</a></p>
      <div className="card">
        <h1>{t.ticket_no} — {t.subject}</h1>
        <p>{t.description}</p>
        <p>Serial number: <b>{dev?.serial_number ?? "—"}</b> · Status: {t.status} · Priority: {t.priority}</p>
        <p>Customer sees: {t.customer_device_status ?? "—"}</p>
        {error && <p className="err">{error}</p>}
      </div>
      {!t.assigned_to ? (
        <form action={apply} className="card"><input type="hidden" name="id" value={id} /><button>Apply (take this ticket)</button></form>
      ) : (
        <>
          <form action={setStatus} className="card">
            <h2>Device service status</h2>
            <p>Current: <b>{state?.status ?? "—"}</b></p>
            <input type="hidden" name="id" value={id} />
            <select name="status" defaultValue={state?.status ?? "in_progress"}>
              <option value="in_progress">In progress</option><option value="done">Done</option>
              <option value="rma">RMA</option><option value="repair_not_possible">Repair is not possible</option>
            </select>
            <input name="comment" placeholder="Comment (internal)" />
            <button>Save status</button>
          </form>
          <form action={saveManual} className="card">
            <h2>Device information (staff only)</h2>
            <p>Source: {info?.source ?? "not filled"}</p>
            <input type="hidden" name="id" value={id} />
            <label>Model<input name="model" defaultValue={info?.model_name ?? ""} /></label>
            <label>Sold date<input name="sold" type="date" defaultValue={info?.sold_date ?? ""} /></label>
            <label>Warranty until<input name="warranty" type="date" defaultValue={info?.warranty_until ?? ""} /></label>
            <label>Customer name<input name="customer" defaultValue={info?.customer_name ?? ""} /></label>
            <button>Save device information</button>
          </form>
        </>
      )}
      {!staff && null}
    </div>
  );
}
