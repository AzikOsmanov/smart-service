// Sends queued changes to 1C. Called right after a change, by the daily cron, and by the administrator ("Run now").
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadConnectionById, createServiceTicket, updateStatus } from "@/lib/onec";
import { processIeoItem } from "@/lib/ieo-outbox";

const MAX_ATTEMPTS = 8;

export async function processOutbox(limit = 20): Promise<{ sent: number; failed: number; waiting: number }> {
  const admin = supabaseAdmin();
  const { data: items } = await admin.from("integration_outbox").select("id,integration_id,ticket_id,operation,attempts,tenant_id")
    .in("status", ["pending", "failed"]).lte("next_attempt_at", new Date().toISOString()).order("seq").limit(limit);
  let sent = 0, failed = 0, waiting = 0;
  for (const it of items ?? []) {
    const fail = async (msg: string, keepAttempts = false) => {
      const attempts = it.attempts + (keepAttempts ? 0 : 1);
      await admin.from("integration_outbox").update({
        status: attempts >= MAX_ATTEMPTS ? "dead" : "failed", attempts, last_error: msg.slice(0, 500),
        next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60000).toISOString(),
      }).eq("id", it.id);
      await admin.from("ticket_external_refs").update({ sync_status: "failed", last_error: msg.slice(0, 500) }).eq("ticket_id", it.ticket_id).eq("source", "integration");
      failed++;
    };
    try {
      const conn = await loadConnectionById(it.integration_id);
      if (!conn || !conn.is_enabled) { await admin.from("integration_outbox").update({ status: "dead", last_error: "The connection is switched off or deleted." }).eq("id", it.id); failed++; continue; }
      const { data: t } = await admin.from("tickets").select("id,tenant_id,ticket_no,subject,description,customer_id,device_id").eq("id", it.ticket_id).maybeSingle();
      if (!t) { await admin.from("integration_outbox").update({ status: "dead", last_error: "Ticket no longer exists." }).eq("id", it.id); failed++; continue; }
      const { data: ref } = await admin.from("ticket_external_refs").select("external_id,external_number,source").eq("ticket_id", t.id).maybeSingle();

      if (conn.kind.startsWith("ieo_")) {   // IEO has its own code; the 1C branches below are unchanged
        const w = await processIeoItem(admin, it, t as any, ref as any, conn.id);
        if (w === "waiting") { waiting++; continue; }
      } else if (it.operation === "create_ticket") {
        if (ref?.external_id) { await admin.from("integration_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", it.id); sent++; continue; }
        const [{ data: dev }, { data: ext }, { data: cust }] = await Promise.all([
          admin.from("devices").select("serial_number").eq("id", t.device_id).maybeSingle(),
          admin.from("device_external_info").select("customer_name").eq("device_id", t.device_id).maybeSingle(),
          admin.from("users").select("first_name,last_name,companies(name)").eq("id", t.customer_id).maybeSingle(),
        ]);
        const c: any = cust;
        const customer = ext?.customer_name || `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() + (c?.companies?.name ? ` · ${c.companies.name}` : "");
        const r = await createServiceTicket(conn, { ticket_no: t.ticket_no, serial: dev?.serial_number ?? "", subject: t.subject, description: t.description ?? "", customer });
        await admin.from("ticket_external_refs").upsert({
          tenant_id: t.tenant_id, ticket_id: t.id, integration_id: conn.id, source: "integration", external_id: r.id, external_number: r.number,
          sync_status: "synced", last_synced_at: new Date().toISOString(), last_error: null,
        }, { onConflict: "ticket_id" });
      } else {   // update_status: always send the newest status, so several queued changes collapse into one call
        if (!ref?.external_id) {   // the ticket is not in 1C yet: try again in a minute without counting an attempt
          await admin.from("integration_outbox").update({ next_attempt_at: new Date(Date.now() + 60000).toISOString(), last_error: "Waiting for the ticket to be created in 1C first." }).eq("id", it.id);
          waiting++; continue;
        }
        const { data: st } = await admin.from("ticket_service_state").select("status").eq("ticket_id", t.id).maybeSingle();
        if (st?.status) await updateStatus(conn, ref.external_id, st.status);
        await admin.from("ticket_external_refs").update({ sync_status: "synced", last_synced_at: new Date().toISOString(), last_error: null }).eq("ticket_id", t.id);
      }
      await admin.from("integration_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", it.id);
      await admin.from("integrations").update({ last_success_at: new Date().toISOString(), last_error: null }).eq("id", it.integration_id);
      sent++;
    } catch (e: any) {
      await fail(String(e?.message ?? e));
      await admin.from("integrations").update({ last_error: String(e?.message ?? e).slice(0, 500) }).eq("id", it.integration_id);
    }
  }
  return { sent, failed, waiting };
}
