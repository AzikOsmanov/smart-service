import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// The administrator's network allow-list does not include this address: end the session and say why.
export async function GET(req: Request) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  const msg = "Access is not allowed from this network address. Use the company network or contact the administrator.";
  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent(msg), req.url));
}
