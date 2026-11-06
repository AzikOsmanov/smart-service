import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getLoginPolicy } from "@/lib/login-security";

export const dynamic = "force-dynamic";

// The open page calls this (at most once a minute) while the person is really working. The middleware refreshes the "last active"
// cookie on this request; here the current inactivity limit is written into its own cookie so a changed setting reaches open browsers.
export async function POST() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return new NextResponse(null, { status: 401 });
  const { data: u } = await sb.from("users").select("tenant_id").eq("id", data.user.id).maybeSingle();
  const res = new NextResponse(null, { status: 204 });
  if (u?.tenant_id) {
    const policy = await getLoginPolicy(u.tenant_id);
    const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 };
    if (policy.idle_minutes_web > 0) res.cookies.set("ss_idle", String(policy.idle_minutes_web), opts);
    else { res.cookies.delete("ss_idle"); res.cookies.delete("ss_act"); }
  }
  return res;
}
