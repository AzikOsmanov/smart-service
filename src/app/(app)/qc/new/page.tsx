import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import QcForm from "@/components/QcForm";
import { getPortal } from "@/lib/i18n-portal";
import { getStaff } from "@/lib/i18n-staff";

export default async function NewQc({ searchParams }: { searchParams: Promise<{ sn?: string; ticket?: string }> }) {
  const { sn, ticket } = await searchParams;
  const sb = await supabaseServer();
  const { data: canEdit } = await sb.rpc("has_permission", { p_code: "qc.edit" });
  if (canEdit !== true) redirect("/qc");
  const { data: sess } = await sb.auth.getSession();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", sess.session!.user.id).maybeSingle();
  return (
    <div className="card">
      <h1>{(await getStaff()).S.newQcTitle}</h1>
      <QcForm tenantId={me!.tenant_id} initialSn={sn ?? ""} ticketId={ticket ?? null} L={(await getPortal()).L} S={(await getStaff()).S} />
    </div>
  );
}
