"use server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Called every minute by the open page. Marks the signed-in user as online.
export async function heartbeat() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  await supabaseAdmin().from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", data.user.id);
}
