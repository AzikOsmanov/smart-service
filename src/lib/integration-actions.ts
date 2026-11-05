"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";
import { checkBaseUrl, loadConnection, lookupDevice, testReach, type FieldMap } from "@/lib/onec";
import { processOutbox } from "@/lib/outbox";

const BACK = "/admin/integrations";
async function admin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) redirect("/tickets");
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { tenantId: me!.tenant_id as string, uid: auth.user!.id };
}
const f = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (kind: string, type: "ok" | "error", msg: string): never => redirect(`${BACK}?${type}=${encodeURIComponent(msg)}&k=${kind}`);

export async function saveIntegrationAction(fd: FormData) {
  const { S } = await getStaff();
  const { tenantId, uid } = await admin();
  const kind = f(fd, "kind");
  if (kind !== "device_lookup" && kind !== "service_sync") redirect(BACK);
  const db = supabaseAdmin();
  const { data: cur } = await db.from("integrations").select("id,field_map,secret_ref,is_enabled,base_url").eq("tenant_id", tenantId).eq("kind", kind).maybeSingle();
  const base = f(fd, "base_url");
  const enable = fd.get("enabled") === "on";
  if (base) { const bad = checkBaseUrl(base); if (bad) done(kind, "error", bad); }

  const fm: FieldMap = { ...((cur?.field_map as FieldMap) ?? {}) };
  if (kind === "device_lookup") {
    fm.lookup = { entity: f(fd, "entity"), serial_field: f(fd, "serial_field"), model_field: f(fd, "model_field"), warranty_field: f(fd, "warranty_field"), sold_field: f(fd, "sold_field"), customer_field: f(fd, "customer_field") };
  } else {
    let extra: Record<string, unknown> = {};
    if (f(fd, "extra")) { try { extra = JSON.parse(f(fd, "extra")); if (typeof extra !== "object" || Array.isArray(extra)) throw 0; } catch { done(kind, "error", S.errBadJson); } }
    fm.ticket = { entity: f(fd, "entity"), ticket_no_field: f(fd, "ticket_no_field"), serial_field: f(fd, "serial_field"), subject_field: f(fd, "subject_field"), description_field: f(fd, "description_field"), customer_field: f(fd, "customer_field"), status_field: f(fd, "status_field"), id_field: f(fd, "id_field"), number_field: f(fd, "number_field"), extra };
    fm.status_map = { in_progress: f(fd, "st_in_progress"), done: f(fd, "st_done"), rma: f(fd, "st_rma"), repair_not_possible: f(fd, "st_repair_not_possible") };
  }
  const row = {
    tenant_id: tenantId, kind, provider: "1c_odata", auth_type: "basic",
    name: kind === "device_lookup" ? "1C device lookup" : "1C ticket sync", base_url: base, field_map: fm, is_enabled: false, updated_at: new Date().toISOString(),
  };
  const up = await db.from("integrations").upsert(row, { onConflict: "tenant_id,kind" }).select("id").single();
  if (up.error) done(kind, "error", up.error.message);
  const id = up.data!.id as string;

  const user = f(fd, "username"), pass = String(fd.get("password") ?? "");
  if (user || pass) {
    let oldP = "";
    if (!pass) { const { data: s } = await db.rpc("integration_read_secret", { p_integration: id }); try { oldP = JSON.parse(String(s ?? "{}")).p ?? ""; } catch { /* none */ } }
    const r = await db.rpc("integration_store_secret", { p_integration: id, p_secret: JSON.stringify({ u: user, p: pass || oldP }) });
    if (r.error) done(kind, "error", r.error.message);
  }
  if (enable) {
    const { data: s } = await db.rpc("integration_read_secret", { p_integration: id });
    let ok = false; try { const j = JSON.parse(String(s ?? "{}")); ok = !!j.u && !!j.p; } catch { /* none */ }
    if (!base) done(kind, "error", S.errBaseUrlNeeded);
    if (!ok) done(kind, "error", S.errNeedLogin);
    await db.from("integrations").update({ is_enabled: true }).eq("id", id);
  }
  await db.from("audit_logs").insert({ tenant_id: tenantId, actor_id: uid, action: "integration.save", entity_type: "integration", entity_id: id, old_values: cur ? { enabled: cur.is_enabled, base_url: cur.base_url } : null, new_values: { kind, enabled: enable, base_url: base } });
  revalidatePath(BACK);
  done(kind, "ok", S.savedOk);
}

export async function testIntegrationAction(fd: FormData) {
  const { S } = await getStaff();
  const { tenantId } = await admin();
  const kind = f(fd, "kind") as "device_lookup" | "service_sync";
  const conn = await loadConnection(kind, tenantId);
  if (!conn) done(kind, "error", S.errSaveFirst);
  try {
    if (kind === "device_lookup") {
      const sn = f(fd, "serial");
      if (!sn) done(kind, "error", S.errTestSerial);
      const r = await lookupDevice(conn!, sn);
      done(kind, "ok", r.found ? fmt(S.testFound, { model: r.model ?? "—", warranty: r.warranty_until ?? "—", sold: r.sold_date ?? "—", customer: r.customer_name ?? "—" }) : S.testNotFound);
    }
    done(kind, "ok", fmt(S.testReached, { entity: conn!.fm.ticket?.entity ?? "" }) + " " + await testReach(conn!, conn!.fm.ticket?.entity));
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    done(kind, "error", String(e?.message ?? e).slice(0, 300));
  }
}

export async function retryOutboxAction(fd: FormData) {
  const { tenantId } = await admin();
  await supabaseAdmin().from("integration_outbox").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null })
    .eq("id", f(fd, "id")).eq("tenant_id", tenantId);
  await processOutbox();
  revalidatePath(BACK);
  redirect(BACK);
}
export async function runQueueAction() {
  const { S } = await getStaff();
  await admin();
  const r = await processOutbox(50);
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${encodeURIComponent(fmt(S.queueResult, { sent: String(r.sent), failed: String(r.failed), waiting: String(r.waiting) }))}`);
}
