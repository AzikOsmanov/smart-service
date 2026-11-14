"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { VISITOR_PREFIX, createVisitor, demoTenantId, seedDemo } from "@/lib/demo";

// "Try the demo" on the login page: a fresh staff account in the demo company, signed in at once.
export async function startDemo() {
  const { S } = await getStaff();
  const fail = (m: string) => redirect("/login?error=" + encodeURIComponent(m));
  const admin = supabaseAdmin();
  const tid = await demoTenantId(admin);
  if (!tid) return fail(S.demoErr);
  const { count: recent } = await admin.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", tid).like("email", `${VISITOR_PREFIX}%`).gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if ((recent ?? 0) >= 60) return fail(S.demoBusy);
  let creds: { email: string; password: string } | null = null;
  try {
    const { count: tickets } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("tenant_id", tid);
    if (!tickets) await seedDemo(admin, tid);
    creds = await createVisitor(admin, tid);
  } catch { creds = null; }
  if (!creds) return fail(S.demoErr);
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword(creds);
  if (error) return fail(S.demoErr);
  const jar = await cookies();
  jar.delete("ss_exp"); jar.delete("ss_idle"); jar.delete("ss_act");
  redirect("/dashboard");
}
