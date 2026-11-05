"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";
import { checkBaseUrl } from "@/lib/onec";
import { loadIeo, lookupDevice, testReach, type IeoMap, type IeoMode } from "@/lib/ieo";

const BACK = "/admin/integrations";
type Kind = "ieo_device_lookup" | "ieo_service_sync";
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
const isKind = (k: string): k is Kind => k === "ieo_device_lookup" || k === "ieo_service_sync";

export async function saveIeoAction(fd: FormData) {
  const { S } = await getStaff();
  const { tenantId, uid } = await admin();
  const kind = f(fd, "kind");
  if (!isKind(kind)) redirect(BACK);
  const db = supabaseAdmin();
  const { data: cur } = await db.from("integrations").select("id,secret_ref,is_enabled,base_url").eq("tenant_id", tenantId).eq("kind", kind).maybeSingle();
  const base = f(fd, "base_url");
  const enable = fd.get("enabled") === "on";
  if (base) { const bad = checkBaseUrl(base); if (bad) done(kind, "error", bad); }
  const mode = (["rest", "odata", "webhook"].includes(f(fd, "mode")) ? f(fd, "mode") : "rest") as IeoMode;
  const auth = ["api_key", "bearer", "basic"].includes(f(fd, "auth_type")) ? f(fd, "auth_type") : "api_key";

  const fm: IeoMap = { mode, auth_header: f(fd, "auth_header") };
  if (kind === "ieo_device_lookup") {
    fm.lookup = { entity: f(fd, "entity"), path: f(fd, "path"), serial_field: f(fd, "serial_field"), result_path: f(fd, "result_path"), model_field: f(fd, "model_field"), warranty_field: f(fd, "warranty_field"), sold_field: f(fd, "sold_field"), customer_field: f(fd, "customer_field") };
  } else {
    let extra: Record<string, unknown> = {};
    if (f(fd, "extra")) { try { extra = JSON.parse(f(fd, "extra")); if (typeof extra !== "object" || Array.isArray(extra)) throw 0; } catch { done(kind, "error", S.errBadJson); } }
    fm.ticket = {
      entity: f(fd, "entity"), create_path: f(fd, "create_path"), create_method: f(fd, "create_method"), update_path: f(fd, "update_path"), update_method: f(fd, "update_method"),
      ticket_no_field: f(fd, "ticket_no_field"), serial_field: f(fd, "serial_field"), subject_field: f(fd, "subject_field"), description_field: f(fd, "description_field"),
      customer_field: f(fd, "customer_field"), status_field: f(fd, "status_field"), id_field: f(fd, "id_field"), number_field: f(fd, "number_field"), extra,
    };
    fm.status_map = { in_progress: f(fd, "st_in_progress"), done: f(fd, "st_done"), rma: f(fd, "st_rma"), repair_not_possible: f(fd, "st_repair_not_possible") };
  }
  const up = await db.from("integrations").upsert({
    tenant_id: tenantId, kind, provider: "ieo", auth_type: auth, name: kind === "ieo_device_lookup" ? "IEO device lookup" : "IEO ticket sync",
    base_url: base, field_map: fm, is_enabled: false, updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,kind" }).select("id").single();
  if (up.error) done(kind, "error", up.error.message);
  const id = up.data!.id as string;

  // credentials: a blank field keeps what is saved
  const { data: s } = await db.rpc("integration_read_secret", { p_integration: id });
  let sec: Record<string, string> = {};
  try { sec = JSON.parse(String(s ?? "{}")); } catch { /* none */ }
  const put = (k: string, v: string) => { if (v) sec[k] = v; };
  put("t", f(fd, "token")); put("u", f(fd, "username")); put("p", String(fd.get("password") ?? "")); put("w", f(fd, "webhook_secret"));
  const r = await db.rpc("integration_store_secret", { p_integration: id, p_secret: JSON.stringify(sec) });
  if (r.error) done(kind, "error", r.error.message);

  if (enable) {
    if (!base) done(kind, "error", S.errBaseUrlNeeded);
    const haveKey = auth === "basic" ? !!sec.u && !!sec.p : !!sec.t;
    if (!haveKey && mode !== "webhook") done(kind, "error", S.errNeedKey);
    await db.from("integrations").update({ is_enabled: true }).eq("id", id);
  }
  await db.from("audit_logs").insert({ tenant_id: tenantId, actor_id: uid, action: "integration.save", entity_type: "integration", entity_id: id, old_values: cur ? { enabled: cur.is_enabled, base_url: cur.base_url } : null, new_values: { kind, enabled: enable, base_url: base, mode } });
  revalidatePath(BACK);
  done(kind, "ok", S.savedOk);
}

export async function testIeoAction(fd: FormData) {
  const { S } = await getStaff();
  const { tenantId } = await admin();
  const kind = f(fd, "kind");
  if (!isKind(kind)) redirect(BACK);
  const conn = await loadIeo(kind as Kind, tenantId);
  if (!conn) done(kind, "error", S.errSaveFirst);
  try {
    if (kind === "ieo_device_lookup" && f(fd, "serial")) {
      const r = await lookupDevice(conn!, f(fd, "serial"));
      done(kind, "ok", r.found ? fmt(S.testFound, { model: r.model ?? "—", warranty: r.warranty_until ?? "—", sold: r.sold_date ?? "—", customer: r.customer_name ?? "—" }) : S.testNotFound);
    }
    done(kind, "ok", await testReach(conn!));
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    done(kind, "error", String(e?.message ?? e).slice(0, 300));
  }
}
