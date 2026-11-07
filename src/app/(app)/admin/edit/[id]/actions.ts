"use server";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

// Administrator only: edit a staff user or a customer (profile, company, email, role).
async function requireAdmin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { sb, tenantId: me!.tenant_id as string, myId: auth.user!.id };
}

export async function resetMfa(fd: FormData) {
  const { S } = await getStaff();
  const { tenantId, myId } = await requireAdmin();
  const id = String(fd.get("id"));
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (u) {
    const { data: fl } = await admin.auth.admin.mfa.listFactors({ userId: id });
    for (const f of fl?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
    await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: myId, action: "user.mfa_reset", entity_type: "user", entity_id: id });
  }
  redirect(`/admin/edit/${id}?ok=${encodeURIComponent(S.mfaAdminResetDone)}`);
}

export async function save(fd: FormData) {
  const { S } = await getStaff();
  const { tenantId, myId } = await requireAdmin();
  const id = String(fd.get("id"));
  const back = (k: "error" | "ok", m: string): never => redirect(`/admin/edit/${id}?${k}=${encodeURIComponent(m)}`);
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("*").eq("id", id).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  if (!u) back("error", S.errUserNotFound);
  const first = String(fd.get("first_name") || "").trim();
  const last = String(fd.get("last_name") || "").trim();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (!first || !last) back("error", S.errNamesRequired);
  if (!/^\S+@\S+\.\S+$/.test(email)) back("error", S.errValidEmail);
  const phone = String(fd.get("phone") || "").trim() || null;
  const before: Record<string, unknown> = { first_name: u!.first_name, last_name: u!.last_name, phone: u!.phone, email: u!.email };
  const after: Record<string, unknown> = { first_name: first, last_name: last, phone, email };

  if (email !== u!.email) {
    const r = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (r.error) back("error", /already|registered|exists/i.test(r.error.message) ? fmt(S.errEmailUsed, { email }) : r.error.message);
  }
  const upd: Record<string, unknown> = { first_name: first, last_name: last, phone, email };

  if (u!.kind === "customer") {
    const type = String(fd.get("customer_type") || "");
    if (["reseller", "installer", "company"].includes(type)) { upd.customer_type = type; before.customer_type = u!.customer_type; after.customer_type = type; }
    const cname = String(fd.get("company_name") || "").trim();
    const city = String(fd.get("city") || "").trim();
    if (!cname || !city) back("error", S.errCompanyCity);
    if (u!.company_id) {
      const { data: c } = await admin.from("companies").select("name,city,address,tax_id").eq("id", u!.company_id).maybeSingle();
      before.company = c;
      const cu = { name: cname, city, address: String(fd.get("address") || "").trim() || null, tax_id: String(fd.get("tax_id") || "").trim() || null };
      after.company = cu;
      const r = await admin.from("companies").update(cu).eq("id", u!.company_id).eq("tenant_id", tenantId);
      if (r.error) back("error", r.error.message);
    }
  }
  const ru = await admin.from("users").update(upd).eq("id", id).eq("tenant_id", tenantId);
  if (ru.error) back("error", ru.error.message);

  if (u!.kind === "staff") {
    const roleId = String(fd.get("role") || "");
    const { data: cur } = await admin.from("user_roles").select("role_id,roles(is_admin,name)").eq("user_id", id);
    const isAdminUser = (cur ?? []).some((x: any) => x.roles?.is_admin);
    if (roleId && !isAdminUser && id !== myId && !(cur ?? []).some((x) => x.role_id === roleId)) {
      const { data: role } = await admin.from("roles").select("id,is_admin,name").eq("id", roleId).eq("tenant_id", tenantId).maybeSingle();
      if (!role || role.is_admin) back("error", S.errValidNonAdminRole);
      await admin.from("user_roles").delete().eq("user_id", id);
      const r = await admin.from("user_roles").insert({ user_id: id, role_id: roleId, assigned_by: myId });
      if (r.error) back("error", r.error.message);
      before.role = (cur ?? []).map((x: any) => x.roles?.name).join(", ");
      after.role = role!.name;
    }
  }
  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: myId, action: "user.edit", entity_type: "user", entity_id: id, old_values: before, new_values: after });
  revalidatePath("/customers"); revalidatePath("/admin/users");
  back("ok", S.savedOk);
}

