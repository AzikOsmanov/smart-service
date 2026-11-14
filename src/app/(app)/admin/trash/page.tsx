import { notFound, redirect } from "next/navigation";
import { fmtDT } from "@/lib/fmt-time";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ConfirmButton from "@/components/ConfirmButton";
import { restoreTicketAction, hardDeleteTicketAction } from "@/lib/delete-actions";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

async function restoreQc(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const sb = await supabaseServer();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const admin = supabaseAdmin();
  const id = String(fd.get("id"));
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  const { error } = await admin.from("qc_checks").update({ deleted_at: null }).eq("id", id).eq("tenant_id", me!.tenant_id);
  if (error) redirect("/admin/trash?error=" + encodeURIComponent(error.message));
  await admin.from("audit_logs").insert({ tenant_id: me!.tenant_id, actor_id: auth.user!.id, action: "qc.restore", entity_type: "qc_check", entity_id: id, old_values: null, new_values: null });
  revalidatePath("/admin/trash");
  redirect("/admin/trash?ok=" + encodeURIComponent(S.okQcRestored));
}

export default async function Trash({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  const admin = supabaseAdmin();
  const { data: sess } = await sb.auth.getUser();
  const { data: meT } = await sb.from("users").select("tenant_id").eq("id", sess.user!.id).single();
  const tenantId = meT!.tenant_id as string;
  const { data: tickets } = await admin.from("tickets").select("id,ticket_no,subject,deleted_at,delete_reason,deleted_by").eq("tenant_id", tenantId).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  const { data: qcDeleted } = await admin.from("qc_checks").select("id,serial_number,status,comment,deleted_at,performed_by").eq("tenant_id", tenantId).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  const ids = Array.from(new Set((tickets ?? []).map((t) => t.deleted_by).filter(Boolean))) as string[];
  const { data: who } = ids.length ? await admin.from("users").select("id,first_name,last_name,email").in("id", ids) : { data: [] as any[] };
  const name = new Map((who ?? []).map((u: any) => [u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email]));
  return (
    <div>
      <h1>{S.trashTitle}</h1>
      <h2>{fmt(S.ticketsCount, { n: String((tickets ?? []).length) })}</h2>
      {error && <p className="err">{error}</p>}
      {ok && <p>{ok}</p>}
      <div className="card">
        <table><thead><tr><th>{S.noWord}</th><th>{S.subjectWord}</th><th>{S.deletedWord}</th><th>{S.byWord}</th><th>{S.reasonWord}</th><th></th></tr></thead><tbody>
          {(tickets ?? []).map((t) => (
            <tr key={t.id}>
              <td>{t.ticket_no}</td><td>{t.subject}</td>
              <td>{t.deleted_at ? fmtDT(t.deleted_at) : ""}</td>
              <td>{t.deleted_by ? name.get(t.deleted_by) ?? "—" : "—"}</td>
              <td>{t.delete_reason ?? "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <form action={restoreTicketAction} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value="/admin/trash" />
                  <button className="btn ghost">{S.restore}</button>
                </form>
                <form action={hardDeleteTicketAction} style={{ display: "inline", marginLeft: 8 }}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value="/admin/trash" />
                  <input name="reason" placeholder={S.reasonWord} required minLength={5} style={{ width: 160, display: "inline-block", margin: "0 8px 0 0" }} />
                  <ConfirmButton className="btn danger" message={S.deletePermQ}>{S.deletePerm}</ConfirmButton>
                </form>
              </td>
            </tr>))}
        </tbody></table>
        {!tickets?.length && <p>{S.noDeletedTickets}</p>}
      </div>
      <h2>{fmt(S.qcChecksCount, { n: String((qcDeleted ?? []).length) })}</h2>
      <div className="card">
        <table><thead><tr><th>{S.serialNumber}</th><th>{S.qcStatusCol}</th><th>{S.comment}</th><th>{S.deletedWord}</th><th></th></tr></thead><tbody>
          {(qcDeleted ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.serial_number}</td><td>{c.status}</td><td>{(c.comment ?? "").slice(0, 80)}</td>
              <td>{c.deleted_at ? fmtDT(c.deleted_at) : ""}</td>
              <td><form action={restoreQc}><input type="hidden" name="id" value={c.id} /><button className="btn ghost">{S.restore}</button></form></td>
            </tr>))}
        </tbody></table>
        {!qcDeleted?.length && <p>{S.noDeletedQc}</p>}
      </div>
    </div>
  );
}
