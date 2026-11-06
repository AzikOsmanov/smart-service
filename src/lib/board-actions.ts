"use server";
import { revalidatePath } from "next/cache";
import { getStaff } from "@/lib/i18n-staff";
import { after } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { processOutbox } from "@/lib/outbox";

export type BoardTarget = "new" | "diagnose" | "ready" | "pickup_new_device" | "repair_not_possible";
const SERVICE: Record<Exclude<BoardTarget, "new">, string> = {
  diagnose: "in_progress", ready: "done", pickup_new_device: "rma", repair_not_possible: "repair_not_possible",
};

// Moving a card = the same actions as on the ticket page (take the ticket, change the device service status).
// The database enforces permissions, "own" scope and the freeze rule; this only adds clear messages.
export async function moveTicketAction(ticketId: string, target: BoardTarget): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { data: can } = await sb.rpc("has_permission", { p_code: "tickets.board.edit" });
  if (can !== true) return { error: (await getStaff()).S.msgBoardNoPerm };
  if (target === "new") return { error: (await getStaff()).S.msgBoardNotNew };
  const { data: auth } = await sb.auth.getUser();
  const { data: t } = await sb.from("tickets").select("id,assigned_to").eq("id", ticketId).is("deleted_at", null).maybeSingle();
  if (!t || !auth.user) return { error: (await getStaff()).S.msgTicketNotFound };

  if (!t.assigned_to) {
    const { data: taken, error } = await sb.from("tickets").update({ assigned_to: auth.user.id, status: "assigned" })
      .eq("id", ticketId).is("assigned_to", null).select("id");
    if (error) return { error: error.message };
    if (!taken || taken.length === 0) return { error: (await getStaff()).S.msgBoardTaken };
    after(() => processOutbox());
    if (target === "diagnose") { revalidatePath("/tickets/board"); return {}; }
  }
  const { error } = await sb.rpc("set_device_service_status", { p_ticket: ticketId, p_status: SERVICE[target], p_comment: "Moved on the board" });
  if (error) {
    return { error: error.message.includes("ticket_frozen") ? (await getStaff()).S.msgBoardFrozen : error.message };
  }
  after(() => processOutbox());
  revalidatePath("/tickets/board");
  return {};
}
