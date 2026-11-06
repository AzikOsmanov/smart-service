import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";

// Second step of sign-in: the 6-digit code from the authenticator app.
async function verify(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: f } = await sb.auth.mfa.listFactors();
  const factor = f?.totp?.[0];
  if (!factor) redirect("/dashboard");
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) redirect("/mfa/verify?e=1");
  redirect("/dashboard");
}

async function cancel() {
  "use server";
  const sb = await supabaseServer();
  await sb.auth.signOut();
  const jar = await cookies();
  jar.delete("ss_act"); jar.delete("ss_idle"); jar.delete("ss_exp");
  redirect("/login");
}

export default async function Verify({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  const { S } = await getStaff();
  const sb = await supabaseServer();
  const { data: a } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (a?.currentLevel === "aal2" || a?.nextLevel !== "aal2") redirect("/dashboard");
  return (
    <>
      <form action={verify} className="card">
        <h1>{S.mfaTitle}</h1>
        <p>{S.mfaVerifyTitle}</p>
        <label>{S.mfaCode}<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus required /></label>
        {sp.e && <p className="err">{S.mfaBadCode}</p>}
        <button>{S.mfaConfirm}</button>
      </form>
      <form action={cancel} style={{ marginTop: 12 }}><button className="link" style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer" }}>{S.mfaCancel}</button></form>
    </>
  );
}
