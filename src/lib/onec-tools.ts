import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadConnection, lookupDevice } from "@/lib/onec";

export type LookupResult = { code: "ok" | "not_found" | "off" | "denied" | "unavailable"; detail?: string };

// Reads the device data from 1C for the serial number of this ticket and stores it (staff only).
// A failure never blocks the ticket: staff can type the same data by hand.
export async function lookupForTicket(sb: SupabaseClient, ticketId: string): Promise<LookupResult> {
  const { data: t } = await sb.from("tickets").select("id,tenant_id,device_id").eq("id", ticketId).is("deleted_at", null).maybeSingle();
  if (!t) return { code: "denied" };
  const [{ data: can }, { data: auth }] = await Promise.all([sb.rpc("has_permission", { p_code: "tickets.external_info.edit" }), sb.auth.getUser()]);
  if (can !== true || !auth.user) return { code: "denied" };
  const conn = await loadConnection("device_lookup", t.tenant_id, { onlyEnabled: true });
  if (!conn) return { code: "off" };
  const { data: dev } = await sb.from("devices").select("serial_number").eq("id", t.device_id).maybeSingle();
  if (!dev) return { code: "denied" };
  try {
    const r = await lookupDevice(conn, dev.serial_number);
    if (!r.found) return { code: "not_found" };
    const admin = supabaseAdmin();
    const { error } = await admin.from("device_external_info").upsert({
      tenant_id: t.tenant_id, device_id: t.device_id, ticket_id: t.id, serial_number: dev.serial_number, status: "ok", source: "integration",
      model_name: r.model, warranty_until: r.warranty_until, sold_date: r.sold_date, customer_name: r.customer_name, raw_response: r.raw as object,
      error_message: null, fetched_by: auth.user.id, fetched_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,device_id" });
    if (error) return { code: "unavailable", detail: error.message };
    await admin.from("audit_logs").insert({ tenant_id: t.tenant_id, actor_id: auth.user.id, action: "external_info.lookup", entity_type: "device", entity_id: t.device_id, old_values: null, new_values: { serial: dev.serial_number, source: "integration" } });
    return { code: "ok" };
  } catch (e: any) {
    return { code: "unavailable", detail: String(e?.message ?? e).slice(0, 200) };
  }
}
