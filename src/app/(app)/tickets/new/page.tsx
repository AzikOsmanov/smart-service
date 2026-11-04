import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import NewTicketForm from "@/components/NewTicketForm";

export default async function NewTicket() {
  const sb = await supabaseServer();
  const { t } = await getT();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const [{ data: devices }, { data: me }] = await Promise.all([
    sb.from("devices").select("id,serial_number,device_models(name)").eq("owner_id", uid).is("deleted_at", null).order("created_at", { ascending: false }),
    sb.from("users").select("tenant_id,company_id").eq("id", uid).single(),
  ]);
  return (
    <div>
      <h1>{t("newTicket")}</h1>
      <NewTicketForm tenantId={me!.tenant_id} companyId={me!.company_id} userId={uid}
        devices={(devices ?? []).map((d) => ({ id: d.id, serial_number: d.serial_number, model: (d as { device_models?: { name?: string } | null }).device_models?.name ?? null }))} />
    </div>
  );
}
