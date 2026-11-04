import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import QcForm from "@/components/QcForm";

export default async function NewQc({ searchParams }: { searchParams: Promise<{ sn?: string; ticket?: string }> }) {
  const { sn, ticket } = await searchParams;
  const sb = await supabaseServer();
  const { data: canEdit } = await sb.rpc("has_permission", { p_code: "qc.edit" });
  if (canEdit !== true) redirect("/qc");
  const { data: sess } = await sb.auth.getSession();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", sess.session!.user.id).maybeSingle();
  return (
    <div className="card">
      <h1>New QC check</h1>
      <QcForm tenantId={me!.tenant_id} initialSn={sn ?? ""} ticketId={ticket ?? null} />
    </div>
  );
}
