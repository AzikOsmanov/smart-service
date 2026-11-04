"use server";
import { supabaseServer } from "@/lib/supabase-server";

export type ChatMessage = { id: string; sender_kind: "staff" | "customer"; body: string; is_internal: boolean; created_at: string };

export async function postMessage(ticketId: string, body: string, internal: boolean): Promise<{ error?: string; message?: ChatMessage }> {
  const text = body.trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > 4000) return { error: "Message is too long (4000 characters max)." };
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { error: "Please sign in again." };
  const uid = sess.session.user.id;
  const { data: me } = await sb.from("users").select("tenant_id,kind").eq("id", uid).single();
  if (!me) return { error: "Account not found." };
  const staff = me.kind === "staff";
  const { data, error } = await sb.from("ticket_messages")
    .insert({ tenant_id: me.tenant_id, ticket_id: ticketId, sender_id: uid, sender_kind: staff ? "staff" : "customer", body: text, is_internal: staff && internal })
    .select("id,sender_kind,body,is_internal,created_at").single();
  if (error) return { error: error.message };
  return { message: data as ChatMessage };
}
