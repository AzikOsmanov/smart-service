"use server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logLoginEvent } from "@/lib/login-security";

// The page was idle for too long: record it and end the session.
export async function idleSignOut() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (data.user) {
    const admin = supabaseAdmin();
    const { data: u } = await admin.from("users").select("tenant_id,email").eq("id", data.user.id).maybeSingle();
    if (u) {
      await admin.from("users").update({ last_seen_at: null }).eq("id", data.user.id);
      await logLoginEvent({ tenantId: u.tenant_id, userId: data.user.id, email: u.email, event: "logout", reason: "inactivity" });
    }
  }
  await sb.auth.signOut();
  const jar = await cookies();
  jar.delete("ss_act"); jar.delete("ss_idle"); jar.delete("ss_exp");
}
