import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

async function save(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id") || "");
  const name = String(fd.get("name") || "").trim();
  if (name.length < 2) redirect("/devices/models?error=" + encodeURIComponent("Enter the model name."));
  const row = { name, sku: String(fd.get("sku") || "").trim() || null, category: String(fd.get("category") || "").trim() || null };
  let error;
  if (id) ({ error } = await sb.from("device_models").update(row).eq("id", id));
  else {
    const { data: auth } = await sb.auth.getUser();
    const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
    ({ error } = await sb.from("device_models").insert({ ...row, tenant_id: me!.tenant_id }));
  }
  if (error) redirect("/devices/models?error=" + encodeURIComponent(error.message));
  revalidatePath("/devices/models");
  redirect("/devices/models?ok=" + encodeURIComponent("Saved."));
}

export default async function Models({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error: msgErr, ok } = await searchParams;
  const sb = await supabaseServer();
  const [{ data: canView }, { data: canEdit }] = await Promise.all([
    sb.rpc("has_permission", { p_code: "devices.models.view" }), sb.rpc("has_permission", { p_code: "devices.models.edit" }),
  ]);
  if (canView !== true) redirect("/devices");
  const { data: models, error } = await sb.from("device_models").select("id,name,sku,category,created_at").is("deleted_at", null).order("name");
  return (
    <div>
      <p><Link href="/devices">← Devices</Link></p>
      <h1>Device models</h1>
      {msgErr && <p className="err">{msgErr}</p>}
      {error && <p className="err">{error.message}</p>}
      {ok && <p>{ok}</p>}
      <div className="card">
        <table><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th></th></tr></thead><tbody>
          {(models ?? []).map((m) => (
            <tr key={m.id}>
              {canEdit === true ? (
                <td colSpan={4}>
                  <form action={save} className="row">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="name" defaultValue={m.name} required />
                    <input name="sku" defaultValue={m.sku ?? ""} placeholder="SKU" />
                    <input name="category" defaultValue={m.category ?? ""} placeholder="Category" />
                    <button>Save</button>
                  </form>
                </td>
              ) : (<><td>{m.name}</td><td>{m.sku}</td><td>{m.category}</td><td></td></>)}
            </tr>
          ))}
          {(models ?? []).length === 0 && <tr><td colSpan={4}>No models yet.</td></tr>}
        </tbody></table>
      </div>
      {canEdit === true && (
        <form action={save} className="card row">
          <h2 style={{ width: "100%" }}>Add a model</h2>
          <input name="name" placeholder="Model name" required />
          <input name="sku" placeholder="SKU" />
          <input name="category" placeholder="Category" />
          <button>Add model</button>
        </form>
      )}
    </div>
  );
}
