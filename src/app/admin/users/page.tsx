import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { sb, tenantId: me!.tenant_id as string, myId: auth.user!.id };
}

async function createStaff(fd: FormData) {
  "use server";
  const { tenantId } = await requireAdmin();
  const email = String(fd.get("email")).trim().toLowerCase();
  const roleId = String(fd.get("role"));
  const admin = supabaseAdmin();
  const { data: role } = await admin.from("roles").select("id,is_admin").eq("id", roleId).eq("tenant_id", tenantId).maybeSingle();
  if (!role || role.is_admin) redirect("/admin/users?error=" + encodeURIComponent("Choose a valid non-admin role"));
  const created = await admin.auth.admin.createUser({ email, password: String(fd.get("password")), email_confirm: true });
  if (created.error || !created.data.user) redirect("/admin/users?error=" + encodeURIComponent(created.error?.message ?? "Could not create login"));
  const uid = created.data.user.id;
  const ins = await admin.from("users").insert({ id: uid, tenant_id: tenantId, kind: "staff", email, first_name: String(fd.get("first_name")), last_name: String(fd.get("last_name")), phone: String(fd.get("phone") || "") || null, registration: "approved", is_active: true, email_verified_at: new Date().toISOString() });
  if (!ins.error) {
    const r = await admin.from("user_roles").insert({ user_id: uid, role_id: roleId });
    if (r.error) ins.error = r.error;
  }
  if (ins.error) {
    await admin.from("users").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    redirect("/admin/users?error=" + encodeURIComponent(ins.error.message));
  }
  revalidatePath("/admin/users");
}

async function setActive(fd: FormData) {
  "use server";
  const { tenantId, myId } = await requireAdmin();
  const id = String(fd.get("id"));
  if (id === myId) redirect("/admin/users?error=" + encodeURIComponent("You cannot deactivate yourself"));
  await supabaseAdmin().from("users").update({ is_active: fd.get("active") === "1" }).eq("id", id).eq("tenant_id", tenantId);
  revalidatePath("/admin/users");
}

export default async function Users({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { sb } = await requireAdmin();
  const { data: roles } = await sb.from("roles").select("id,name,is_admin").is("deleted_at", null).order("name");
  const { data: staff } = await sb.from("users").select("id,first_name,last_name,email,is_active,last_login_at,user_roles(roles(name))").eq("kind", "staff").is("deleted_at", null).order("created_at");
  return (
    <div>
      <p><a href="/tickets">← Tickets</a></p>
      <h1>Staff users</h1>
      {error && <p className="err">{error}</p>}
      <div className="card">
        <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr></thead>
          <tbody>{(staff ?? []).map((u: any) => (
            <tr key={u.id}>
              <td>{u.first_name} {u.last_name}</td><td>{u.email}</td>
              <td>{u.user_roles?.map((r: any) => r.roles?.name).join(", ")}</td>
              <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "never"}</td>
              <td><form action={setActive}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="active" value={u.is_active ? "0" : "1"} /><button>{u.is_active ? "Deactivate" : "Activate"}</button></form></td>
            </tr>))}</tbody></table>
      </div>
      <form action={createStaff} className="card">
        <h2>Add staff user</h2>
        <label>First name<input name="first_name" required /></label>
        <label>Last name<input name="last_name" required /></label>
        <label>Phone<input name="phone" /></label>
        <label>Email<input name="email" type="email" required /></label>
        <label>Role<select name="role">{(roles ?? []).filter((r) => !r.is_admin).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Temporary password<input name="password" type="text" minLength={10} required /></label>
        <p>Give this password to the user. They should change it after the first sign-in (Account page).</p>
        <button>Create user</button>
      </form>
    </div>
  );
}
