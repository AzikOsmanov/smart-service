"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { supabaseAdmin } from "@/lib/supabase-admin";

function back(fd: FormData, key: "error" | "ok", msg: string): never {
  const to = String(fd.get("back") || "/tickets");
  const safe = to.startsWith("/") && !to.startsWith("//") ? to : "/tickets";
  redirect(`${safe}${safe.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
}

type SL = Awaited<ReturnType<typeof getStaff>>["S"];
function friendly(S: SL, m: string) {
  if (m.startsWith("user_has_records")) return S.msgUserHasRecords.replace("{what}", m.replace("user_has_records: ", ""));
  if (m.startsWith("device_has_other_tickets")) return S.msgDeviceOtherTickets.replace("{what}", m.replace("device_has_other_tickets: ", ""));
  const f: Record<string, string> = { admin_only: S.msgAdminOnly, cannot_delete_yourself: S.msgDelSelf, cannot_delete_administrator: S.msgDelAdmin, reason_required: S.msgReasonReq, delete_not_allowed: S.msgDelNotAllowed, user_not_found: S.msgUserNotFound, ticket_not_found: S.msgTicketNotFound };
  return f[m] ?? m;
}

// Soft delete with a reason: the ticket moves to Trash.
export async function deleteTicketAction(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("delete_ticket", { p_ticket: String(fd.get("id")), p_reason: String(fd.get("reason") || "") });
  if (error) back(fd, "error", friendly((await getStaff()).S, error.message));
  revalidatePath("/tickets");
  redirect("/tickets");
}

// Permanent delete (administrator only, reason required).
export async function hardDeleteTicketAction(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("hard_delete_ticket", { p_ticket: String(fd.get("id")), p_reason: String(fd.get("reason") || "") });
  if (error) back(fd, "error", friendly((await getStaff()).S, error.message));
  revalidatePath("/tickets");
  revalidatePath("/admin/trash");
  redirect("/admin/trash?ok=" + encodeURIComponent((await getStaff()).S.msgTicketDeletedPerm));
}

export async function restoreTicketAction(fd: FormData) {
  const sb = await supabaseServer();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) back(fd, "error", friendly((await getStaff()).S, "admin_only"));
  const { error } = await supabaseAdmin().from("tickets").update({ deleted_at: null, delete_reason: null, deleted_by: null }).eq("id", String(fd.get("id")));
  if (error) back(fd, "error", error.message);
  revalidatePath("/admin/trash");
  back(fd, "ok", (await getStaff()).S.msgTicketRestored);
}

// Permanent delete of a user (administrator only, no approval step).
export async function hardDeleteUserAction(fd: FormData) {
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { error } = await sb.rpc("hard_delete_user", { p_user: id, p_with_records: fd.get("mode") === "all" });
  if (error) back(fd, "error", friendly((await getStaff()).S, error.message));
  const del = await supabaseAdmin().auth.admin.deleteUser(id);
  if (del.error) back(fd, "error", (await getStaff()).S.msgUserAuthFail.replace("{what}", del.error.message));
  revalidatePath("/admin/users");
  revalidatePath("/customers");
  back(fd, "ok", (await getStaff()).S.msgUserDeleted);
}
