import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ConfirmButton from "@/components/ConfirmButton";
import { restoreTicketAction, hardDeleteTicketAction } from "@/lib/delete-actions";

export default async function Trash({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const sb = await supabaseServer();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  const admin = supabaseAdmin();
  const { data: tickets } = await admin.from("tickets").select("id,ticket_no,subject,deleted_at,delete_reason,deleted_by").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  const ids = Array.from(new Set((tickets ?? []).map((t) => t.deleted_by).filter(Boolean))) as string[];
  const { data: who } = ids.length ? await admin.from("users").select("id,first_name,last_name,email").in("id", ids) : { data: [] as any[] };
  const name = new Map((who ?? []).map((u: any) => [u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email]));
  return (
    <div>
      <h1>Trash</h1>
      {error && <p className="err">{error}</p>}
      {ok && <p>{ok}</p>}
      <div className="card">
        <table><thead><tr><th>No</th><th>Subject</th><th>Deleted</th><th>By</th><th>Reason</th><th></th></tr></thead><tbody>
          {(tickets ?? []).map((t) => (
            <tr key={t.id}>
              <td>{t.ticket_no}</td><td>{t.subject}</td>
              <td>{t.deleted_at ? new Date(t.deleted_at).toLocaleString() : ""}</td>
              <td>{t.deleted_by ? name.get(t.deleted_by) ?? "—" : "—"}</td>
              <td>{t.delete_reason ?? "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <form action={restoreTicketAction} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value="/admin/trash" />
                  <button className="btn ghost">Restore</button>
                </form>
                <form action={hardDeleteTicketAction} style={{ display: "inline", marginLeft: 8 }}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value="/admin/trash" />
                  <input name="reason" placeholder="Reason" required minLength={5} style={{ width: 160, display: "inline-block", margin: "0 8px 0 0" }} />
                  <ConfirmButton className="btn danger" message="Permanently delete this ticket? This cannot be undone.">Delete permanently</ConfirmButton>
                </form>
              </td>
            </tr>))}
        </tbody></table>
        {!tickets?.length && <p>Trash is empty.</p>}
      </div>
    </div>
  );
}
