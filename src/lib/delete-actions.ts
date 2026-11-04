"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function back(fd: FormData, key: "error" | "ok", msg: string): never {
  const to = String(fd.get("back") || "/tickets");
  const safe = to.startsWith("/") && !to.startsWith("//") ? to : "/tickets";
  redirect(`${safe}${safe.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
}

const FRIENDLY: Record<string, string> = {
  admin_only: "Only the administrator can do this.",
  cannot_delete_yourself: "You cannot delete your own account.",
  cannot_delete_administrator: "The administrator account cannot be deleted.",
  reason_required: "Please write a reason (at least 5 characters).",
  delete_not_allowed: "You do not have permission to delete tickets.",
  user_not_found: "User not found.",
  ticket_not_found: "Ticket not found.",
};
function friendly(m: string) {
  if (m.startsWith("user_has_records")) return "This user still owns tickets or devices: " + m.replace("user_has_records: ", "") + ". Use \"Delete with tickets and devices\", or deactivate the user instead.";
  if (m.startsWith("device_has_other_tickets")) return "Device " + m.replace("device_has_other_tickets: ", "") + " has tickets from other customers, so it cannot be deleted. Delete or move those tickets first, or deactivate the user.";
  return FRIENDLY[m] ?? m;
}

// Soft delete with a reason: the ticket moves to Trash.
export async function deleteTicketAction(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("delete_ticket", { p_ticket: String(fd.get("id")), p_reason: String(fd.get("reason") || "") });
  if (error) back(fd, "error", friendly(error.message));
  revalidatePath("/tickets");
  redirect("/tickets");
}

// Permanent delete (administrator only, reason required).
export async function hardDeleteTicketAction(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("hard_delete_ticket", { p_ticket: String(fd.get("id")), p_reason: String(fd.get("reason") || "") });
  if (error) back(fd, "error", friendly(error.message));
  revalidatePath("/tickets");
  revalidatePath("/admin/trash");
  redirect("/admin/trash?ok=" + encodeURIComponent("Ticket permanently deleted"));
}

export async function restoreTicketAction(fd: FormData) {
  const sb = await supabaseServer();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) back(fd, "error", friendly("admin_only"));
  const { error } = await supabaseAdmin().from("tickets").update({ deleted_at: null, delete_reason: null, deleted_by: null }).eq("id", String(fd.get("id")));
  if (error) back(fd, "error", error.message);
  revalidatePath("/admin/trash");
  back(fd, "ok", "Ticket restored");
}

// Permanent delete of a user (administrator only, no approval step).
export async function hardDeleteUserAction(fd: FormData) {
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { error } = await sb.rpc("hard_delete_user", { p_user: id, p_with_records: fd.get("mode") === "all" });
  if (error) back(fd, "error", friendly(error.message));
  const del = await supabaseAdmin().auth.admin.deleteUser(id);
  if (del.error) back(fd, "error", "User removed from the system, but the sign-in account could not be removed: " + del.error.message);
  revalidatePath("/admin/users");
  revalidatePath("/customers");
  back(fd, "ok", "User permanently deleted");
}
