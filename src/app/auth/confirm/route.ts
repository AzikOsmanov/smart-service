import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";

// Target of the link in the verification email: /auth/confirm?token_hash=...&type=signup
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const to = (msg: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  if (!token_hash || !type) return to("The confirmation link is not valid.");
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ type, token_hash });
  if (error) return to("The confirmation link is invalid or expired. Please register again or ask the service center.");
  if (type === "recovery") return NextResponse.redirect(`${origin}/account`);
  await sb.auth.signOut();
  return to("Email confirmed. You can sign in now (new customers still need approval by the service center).");
}
