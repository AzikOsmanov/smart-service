import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ACTIONS = ["view", "edit", "delete"] as const;

async function requireAdmin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { sb, tenantId: me!.tenant_id as string };
}

async function createRole(fd: FormData) {
  "use server";
  const { tenantId } = await requireAdmin();
  const name = String(fd.get("name")).trim();
  const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!code) redirect("/admin/roles?error=" + encodeURIComponent("Enter a role name"));
  const { data, error } = await supabaseAdmin().from("roles").insert({ tenant_id: tenantId, code, name, description: String(fd.get("description") || "") || null, is_system: false, is_admin: false }).select("id").single();
  if (error) redirect("/admin/roles?error=" + encodeURIComponent(/duplicate|unique/i.test(error.message) ? "A role with this name already exists" : error.message));
  redirect(`/admin/roles?role=${data.id}&ok=${encodeURIComponent("Role created. Now choose its permissions.")}`);
}

async function savePermissions(fd: FormData) {
  "use server";
  const { tenantId } = await requireAdmin();
  const roleId = String(fd.get("role"));
  const admin = supabaseAdmin();
  const { data: role } = await admin.from("roles").select("id,is_admin").eq("id", roleId).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  if (!role || role.is_admin) redirect("/admin/roles?error=" + encodeURIComponent("This role cannot be edited"));
  const { data: perms } = await admin.from("permissions").select("id,code,resource,action");
  const { data: menus } = await admin.from("menus").select("key,admin_only");
  const adminOnly = new Set((menus ?? []).filter((m) => m.admin_only).map((m) => m.key));
  const rows: { role_id: string; permission_id: string; data_scope: string }[] = [];
  for (const p of perms ?? []) {
    if (adminOnly.has(p.resource)) continue;
    // delete implies edit implies view
    const has = (a: string) => fd.get(`p:${p.resource}.${a}`) === "on";
    const on = p.action === "view" ? has("view") || has("edit") || has("delete") : p.action === "edit" ? has("edit") || has("delete") : has("delete");
    if (!on) continue;
    const scope = String(fd.get(`scope:${p.resource}`)) === "own" ? "own" : "all";
    rows.push({ role_id: roleId, permission_id: p.id, data_scope: scope });
  }
  const del = await admin.from("role_permissions").delete().eq("role_id", roleId);
  if (del.error) redirect(`/admin/roles?role=${roleId}&error=${encodeURIComponent(del.error.message)}`);
  if (rows.length) {
    const ins = await admin.from("role_permissions").insert(rows);
    if (ins.error) redirect(`/admin/roles?role=${roleId}&error=${encodeURIComponent(ins.error.message)}`);
  }
  revalidatePath("/admin/roles");
  redirect(`/admin/roles?role=${roleId}&ok=${encodeURIComponent("Permissions saved")}`);
}

async function deleteRole(fd: FormData) {
  "use server";
  const { tenantId } = await requireAdmin();
  const roleId = String(fd.get("role"));
  const admin = supabaseAdmin();
  const { data: role } = await admin.from("roles").select("id,is_admin,is_system").eq("id", roleId).eq("tenant_id", tenantId).maybeSingle();
  if (!role || role.is_admin || role.is_system) redirect("/admin/roles?error=" + encodeURIComponent("Built-in roles cannot be deleted"));
  const { count } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role_id", roleId);
  if ((count ?? 0) > 0) redirect(`/admin/roles?role=${roleId}&error=${encodeURIComponent("Users still have this role. Move them first.")}`);
  await admin.from("roles").update({ deleted_at: new Date().toISOString() }).eq("id", roleId);
  redirect("/admin/roles?ok=" + encodeURIComponent("Role deleted (kept in Trash)"));
}

export default async function Roles({ searchParams }: { searchParams: Promise<{ role?: string; error?: string; ok?: string }> }) {
  const { role: roleId, error, ok } = await searchParams;
  const { sb } = await requireAdmin();
  const { data: roles } = await sb.from("roles").select("id,name,description,is_admin,is_system").is("deleted_at", null).order("name");
  const current = (roles ?? []).find((r) => r.id === roleId);
  let menus: any[] = [], granted = new Map<string, string>();
  if (current && !current.is_admin) {
    const { data: m } = await sb.from("menus").select("key,name,app,admin_only,parent_id,sort_order").eq("admin_only", false).order("app").order("sort_order");
    menus = m ?? [];
    const { data: rp } = await sb.from("role_permissions").select("data_scope,permissions(code)").eq("role_id", current.id);
    (rp ?? []).forEach((r: any) => r.permissions?.code && granted.set(r.permissions.code, r.data_scope));
  }
  return (
    <div>
      <p><a href="/tickets">← Tickets</a></p>
      <h1>Roles and permissions</h1>
      {error && <p className="err">{error}</p>}
      {ok && <p>{ok}</p>}
      <div className="card">
        <table><thead><tr><th>Role</th><th>Description</th><th></th></tr></thead><tbody>
          {(roles ?? []).map((r) => (
            <tr key={r.id}><td>{r.name}{r.is_admin ? " (fixed, all permissions)" : ""}</td><td>{r.description}</td>
              <td>{!r.is_admin && <a href={`/admin/roles?role=${r.id}`}>Edit permissions</a>}</td></tr>))}
        </tbody></table>
      </div>
      {current && !current.is_admin && (
        <>
          <form action={savePermissions} className="card">
            <h2>{current.name}</h2>
            <input type="hidden" name="role" value={current.id} />
            <p>Every menu has View, Edit and Delete. Edit includes View, and Delete includes Edit. &quot;Own&quot; limits the role to records it created or is assigned to.</p>
            <table><thead><tr><th>Menu</th><th>View</th><th>Edit</th><th>Delete</th><th>Data</th></tr></thead><tbody>
              {menus.map((m) => {
                const scope = granted.get(`${m.key}.view`) ?? granted.get(`${m.key}.edit`) ?? granted.get(`${m.key}.delete`) ?? "all";
                return (
                  <tr key={m.key}>
                    <td style={{ paddingLeft: m.parent_id ? 28 : 8 }}>{m.name} <small>({m.app})</small></td>
                    {ACTIONS.map((a) => <td key={a}><input type="checkbox" style={{ width: "auto", margin: 0 }} name={`p:${m.key}.${a}`} defaultChecked={granted.has(`${m.key}.${a}`)} /></td>)}
                    <td><select name={`scope:${m.key}`} defaultValue={scope} style={{ margin: 0 }}><option value="all">All</option><option value="own">Own</option></select></td>
                  </tr>);
              })}
            </tbody></table>
            <p><button>Save permissions</button></p>
          </form>
          {!current.is_system && (
            <form action={deleteRole} className="card"><input type="hidden" name="role" value={current.id} /><button>Delete this role</button></form>
          )}
        </>
      )}
      <form action={createRole} className="card">
        <h2>New role</h2>
        <label>Name<input name="name" required /></label>
        <label>Description<input name="description" /></label>
        <button>Create role</button>
      </form>
    </div>
  );
}
