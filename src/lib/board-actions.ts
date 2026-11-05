"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

export type BoardTarget = "new" | "diagnose" | "ready" | "pickup_new_device" | "repair_not_possible";
const SERVICE: Record<Exclude<BoardTarget, "new">, string> = {
  diagnose: "in_progress", ready: "done", pickup_new_device: "rma", repair_not_possible: "repair_not_possible",
};

// Moving a card = the same actions as on the ticket page (take the ticket, change the device service status).
// The database enforces permissions, "own" scope and the freeze rule; this only adds clear messages.
export async function moveTicketAction(ticketId: string, target: BoardTarget): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { data: can } = await sb.rpc("has_permission", { p_code: "tickets.board.edit" });
  if (can !== true) return { error: "You do not have permission to move tickets on the board." };
  if (target === "new") return { error: "A ticket cannot be moved back to New." };
  const { data: auth } = await sb.auth.getUser();
  const { data: t } = await sb.from("tickets").select("id,assigned_to").eq("id", ticketId).is("deleted_at", null).maybeSingle();
  if (!t || !auth.user) return { error: "Ticket not found." };

  if (!t.assigned_to) {
    const { data: taken, error } = await sb.from("tickets").update({ assigned_to: auth.user.id, status: "assigned" })
      .eq("id", ticketId).is("assigned_to", null).select("id");
    if (error) return { error: error.message };
    if (!taken || taken.length === 0) return { error: "Someone else already took this ticket. Refresh the board." };
    if (target === "diagnose") { revalidatePath("/tickets/board"); return {}; }
  }
  const { error } = await sb.rpc("set_device_service_status", { p_ticket: ticketId, p_status: SERVICE[target], p_comment: "Moved on the board" });
  if (error) {
    return { error: error.message.includes("ticket_frozen") ? "This ticket is closed. Only the administrator can reopen it." : error.message };
  }
  revalidatePath("/tickets/board");
  return {};
}
