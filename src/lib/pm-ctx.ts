import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

// Who is asking: the signed-in person, their tenant, whether staff, and the Project Management / catalog permissions.
export async function pmCtx() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await sb.from("users").select("tenant_id,kind,registration").eq("id", auth.user.id).single();
  const staff = me?.kind === "staff";
  const perm = async (code: string) => ((await sb.rpc("has_permission", { p_code: code })).data === true);
  const [pv, pe, pd, cv, ce, cd] = await Promise.all(["projects.view", "projects.edit", "projects.delete", "catalog.view", "catalog.edit", "catalog.delete"].map(perm));
  const customerOk = !staff && me?.registration === "approved";
  return { sb, uid: auth.user.id, tenantId: me!.tenant_id as string, staff, customerOk, canProjects: staff ? pv : customerOk, canEditProjects: staff ? pe : customerOk, canDeleteProjects: staff ? pd : customerOk, canCatalog: staff && cv, canEditCatalog: staff && ce, canDeleteCatalog: staff && cd };
}
