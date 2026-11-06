import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/i18n-staff";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";

// Target of the link in the verification email: /auth/confirm?token_hash=...&type=signup
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const to = (msg: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  if (!token_hash || !type) return to((await getStaff()).S.msgConfirmBad);
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ type, token_hash });
  if (error) return to((await getStaff()).S.msgConfirmExpired);
  if (type === "recovery") return NextResponse.redirect(`${origin}/reset-password`);
  await sb.auth.signOut();
  return to((await getStaff()).S.msgConfirmed);
}
