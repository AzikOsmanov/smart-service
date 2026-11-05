// One queue item for the IEO integration (called from processOutbox; 1C items never come here).
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIeoById, createTicket, updateStatus } from "@/lib/ieo";

type Item = { id: string; operation: string };
type Tkt = { id: string; tenant_id: string; ticket_no: number | string; subject: string; description: string | null; customer_id: string; device_id: string };
type Ref = { external_id: string | null; external_number: string | null; source: string } | null;

export async function processIeoItem(admin: SupabaseClient, it: Item, t: Tkt, ref: Ref, integrationId: string): Promise<"done" | "waiting"> {
  const conn = await loadIeoById(integrationId);
  if (!conn) throw new Error("The IEO connection was deleted.");
  if (it.operation === "create_ticket") {
    if (ref?.external_id) return "done";
    const [{ data: dev }, { data: ext }, { data: cust }] = await Promise.all([
      admin.from("devices").select("serial_number").eq("id", t.device_id).maybeSingle(),
      admin.from("device_external_info").select("customer_name").eq("device_id", t.device_id).maybeSingle(),
      admin.from("users").select("first_name,last_name,companies(name)").eq("id", t.customer_id).maybeSingle(),
    ]);
    const c: any = cust;
    const customer = ext?.customer_name || `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() + (c?.companies?.name ? ` · ${c.companies.name}` : "");
    const r = await createTicket(conn, { ticket_no: t.ticket_no, serial: dev?.serial_number ?? "", subject: t.subject, description: t.description ?? "", customer });
    await admin.from("ticket_external_refs").upsert({
      tenant_id: t.tenant_id, ticket_id: t.id, integration_id: conn.id, source: "integration", external_id: r.id, external_number: r.number,
      sync_status: "synced", last_synced_at: new Date().toISOString(), last_error: null,
    }, { onConflict: "ticket_id" });
    return "done";
  }
  if (!ref?.external_id) {   // not in IEO yet: try again in a minute without counting an attempt
    await admin.from("integration_outbox").update({ next_attempt_at: new Date(Date.now() + 60000).toISOString(), last_error: "Waiting for the ticket to be created in IEO first." }).eq("id", it.id);
    return "waiting";
  }
  const { data: st } = await admin.from("ticket_service_state").select("status").eq("ticket_id", t.id).maybeSingle();
  if (st?.status) await updateStatus(conn, { id: ref.external_id, number: ref.external_number ?? String(t.ticket_no), ticket_no: String(t.ticket_no) }, st.status);
  await admin.from("ticket_external_refs").update({ sync_status: "synced", last_synced_at: new Date().toISOString(), last_error: null }).eq("ticket_id", t.id);
  return "done";
}
