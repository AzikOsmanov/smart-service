import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getPortal } from "@/lib/i18n-portal";
import PasswordResetForm from "@/components/PasswordResetForm";

export default async function PasswordReset() {
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const { data: me } = await sb.from("users").select("kind,registration,tenant_id,company_id").eq("id", uid).single();
  if (!me || me.kind !== "customer" || me.registration !== "approved") redirect("/tickets");
  const { L } = await getPortal();
  return <PasswordResetForm tenantId={me.tenant_id} companyId={me.company_id} userId={uid} L={L} />;
}
