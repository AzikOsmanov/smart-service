import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;
export const RESERVED_SLUGS = ["default", "demo", "admin", "api", "www", "app", "mail", "support", "login", "register", "download", "auth", "static", "test"];

export function slugFromName(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return s.length >= 2 ? s : `company-${Math.random().toString(36).slice(2, 6)}`;
}

async function dropEmptyTenant(admin: Admin, id: string) {
  const { data: roles } = await admin.from("roles").select("id").eq("tenant_id", id);
  const ids = (roles ?? []).map((r) => r.id as string);
  if (ids.length) await admin.from("role_permissions").delete().in("role_id", ids);
  await admin.from("roles").delete().eq("tenant_id", id);
  await admin.from("settings").delete().eq("tenant_id", id);
  await admin.from("tenants").delete().eq("id", id);
}

export type Provision = { name: string; slug: string; lang?: string; email: string; password: string; first: string; last: string; phone?: string };
export type ProvisionResult = { ok: true; tenantId: string; userId: string } | { ok: false; error: "slug_taken" | "email_taken" | "failed"; message?: string };

// New company: roles and settings are copied from the default company, the first administrator is created, nothing is left behind on failure.
export async function provisionTenant(admin: Admin, p: Provision): Promise<ProvisionResult> {
  if ((await admin.from("tenants").select("id").eq("slug", p.slug).maybeSingle()).data) return { ok: false, error: "slug_taken" };
  const made = await admin.rpc("create_tenant", { p_name: p.name, p_slug: p.slug, p_lang: p.lang ?? "en" });
  if (made.error || !made.data) return { ok: false, error: "failed", message: made.error?.message };
  const tenantId = made.data as string;
  const created = await admin.auth.admin.createUser({ email: p.email, password: p.password, email_confirm: true });
  if (created.error || !created.data.user) {
    await dropEmptyTenant(admin, tenantId);
    return { ok: false, error: /already|registered|exists/i.test(created.error?.message ?? "") ? "email_taken" : "failed", message: created.error?.message };
  }
  const uid = created.data.user.id;
  const { data: role } = await admin.from("roles").select("id").eq("tenant_id", tenantId).eq("is_admin", true).maybeSingle();
  let failure: string | null = null;
  if (!role) failure = "no administrator role";
  else {
    const ins = await admin.from("users").insert({ id: uid, tenant_id: tenantId, kind: "staff", email: p.email, first_name: p.first, last_name: p.last, phone: p.phone || null, language: p.lang ?? "en", registration: "approved", is_active: true, email_verified_at: new Date().toISOString() });
    if (ins.error) failure = ins.error.message;
    else { const r = await admin.from("user_roles").insert({ user_id: uid, role_id: role.id }); if (r.error) failure = r.error.message; }
  }
  if (failure) {
    await admin.from("users").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    await dropEmptyTenant(admin, tenantId);
    return { ok: false, error: "failed", message: failure };
  }
  return { ok: true, tenantId, userId: uid };
}
