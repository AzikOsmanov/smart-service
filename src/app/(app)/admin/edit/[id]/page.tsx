import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Administrator only: edit a staff user or a customer (profile, company, email, role).
async function requireAdmin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { sb, tenantId: me!.tenant_id as string, myId: auth.user!.id };
}

async function save(fd: FormData) {
  "use server";
  const { tenantId, myId } = await requireAdmin();
  const id = String(fd.get("id"));
  const back = (k: "error" | "ok", m: string): never => redirect(`/admin/edit/${id}?${k}=${encodeURIComponent(m)}`);
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("*").eq("id", id).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  if (!u) back("error", "User not found.");
  const first = String(fd.get("first_name") || "").trim();
  const last = String(fd.get("last_name") || "").trim();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (!first || !last) back("error", "First and last name are required.");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("error", "Enter a valid email address.");
  const phone = String(fd.get("phone") || "").trim() || null;
  const before: Record<string, unknown> = { first_name: u!.first_name, last_name: u!.last_name, phone: u!.phone, email: u!.email };
  const after: Record<string, unknown> = { first_name: first, last_name: last, phone, email };

  if (email !== u!.email) {
    const r = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (r.error) back("error", /already|registered|exists/i.test(r.error.message) ? `${email} is already used by another account.` : r.error.message);
  }
  const upd: Record<string, unknown> = { first_name: first, last_name: last, phone, email };

  if (u!.kind === "customer") {
    const type = String(fd.get("customer_type") || "");
    if (["reseller", "installer", "company"].includes(type)) { upd.customer_type = type; before.customer_type = u!.customer_type; after.customer_type = type; }
    const cname = String(fd.get("company_name") || "").trim();
    const city = String(fd.get("city") || "").trim();
    if (!cname || !city) back("error", "Company name and city are required.");
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
      if (!role || role.is_admin) back("error", "Choose a valid non-administrator role.");
      await admin.from("user_roles").delete().eq("user_id", id);
      const r = await admin.from("user_roles").insert({ user_id: id, role_id: roleId, assigned_by: myId });
      if (r.error) back("error", r.error.message);
      before.role = (cur ?? []).map((x: any) => x.roles?.name).join(", ");
      after.role = role!.name;
    }
  }
  await admin.from("audit_logs").insert({ tenant_id: tenantId, actor_id: myId, action: "user.edit", entity_type: "user", entity_id: id, old_values: before, new_values: after });
  revalidatePath("/customers"); revalidatePath("/admin/users");
  back("ok", "Saved.");
}

export default async function EditPerson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { sb, tenantId, myId } = await requireAdmin();
  const { data: u } = await sb.from("users").select("*").eq("id", id).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  if (!u) notFound();
  const customer = u.kind === "customer";
  const [{ data: company }, { data: roles }, { data: cur }] = await Promise.all([
    customer && u.company_id ? sb.from("companies").select("name,city,address,tax_id").eq("id", u.company_id).maybeSingle() : Promise.resolve({ data: null }),
    !customer ? sb.from("roles").select("id,name,is_admin").is("deleted_at", null).order("name") : Promise.resolve({ data: [] }),
    !customer ? sb.from("user_roles").select("role_id,roles(is_admin)").eq("user_id", id) : Promise.resolve({ data: [] }),
  ]);
  const isAdminUser = (cur ?? []).some((x: any) => x.roles?.is_admin);
  const curRole = (cur ?? [])[0]?.role_id ?? "";
  const back = customer ? "/customers" : "/admin/users";
  return (
    <div>
      <p><Link href={back}>← {customer ? "Customers" : "Staff users"}</Link></p>
      <form action={save} className="card" style={{ maxWidth: 620 }}>
        <h1>Edit {customer ? "customer" : "staff user"}</h1>
        <input type="hidden" name="id" value={id} />
        {error && <p className="err">{error}</p>}
        {ok && <p>{ok}</p>}
        <label>First name<input name="first_name" defaultValue={u.first_name ?? ""} required /></label>
        <label>Last name<input name="last_name" defaultValue={u.last_name ?? ""} required /></label>
        <label>Phone<input name="phone" defaultValue={u.phone ?? ""} /></label>
        <label>Email (login)<input name="email" type="email" defaultValue={u.email} required /></label>
        {customer && (
          <>
            <label>Customer type
              <select name="customer_type" defaultValue={u.customer_type ?? "company"}>
                <option value="reseller">Reseller</option><option value="installer">Installer</option><option value="company">Company</option>
              </select></label>
            <label>Company name<input name="company_name" defaultValue={company?.name ?? ""} required /></label>
            <label>City<input name="city" defaultValue={company?.city ?? ""} required /></label>
            <label>Address<input name="address" defaultValue={company?.address ?? ""} /></label>
            <label>Tax ID<input name="tax_id" defaultValue={company?.tax_id ?? ""} /></label>
          </>
        )}
        {!customer && (isAdminUser || id === myId ? (
          <p><small>The role of an administrator, or of your own account, cannot be changed here.</small></p>
        ) : (
          <label>Role
            <select name="role" defaultValue={curRole}>
              {(roles ?? []).filter((r) => !r.is_admin).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
        ))}
        <button>Save changes</button>
        <p><small>Changes are written to the audit log. To change a password, use "Send password reset" on the list.</small></p>
      </form>
    </div>
  );
}
