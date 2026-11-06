import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { parseLoginPolicy } from "@/lib/login-security";

async function confirm(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const factorId = String(fd.get("factorId") ?? "");
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) redirect("/mfa/setup?start=1&e=1");
  redirect("/mfa/setup?done=1");
}

async function turnOff(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: shell } = await sb.rpc("app_shell");
  const sh = (shell ?? {}) as { kind?: string; login_security?: unknown };
  if (sh.kind === "staff" && parseLoginPolicy(sh.login_security).require_2fa_staff) redirect("/mfa/setup");   // required: cannot be turned off
  await sb.auth.mfa.unenroll({ factorId: String(fd.get("factorId") ?? "") });
  redirect("/mfa/setup?off=1");
}

export default async function Setup({ searchParams }: { searchParams: Promise<{ start?: string; e?: string; done?: string; off?: string; required?: string }> }) {
  const sp = await searchParams;
  const { S } = await getStaff();
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: shell } = await sb.rpc("app_shell");
  const sh = (shell ?? {}) as { kind?: string; login_security?: unknown };
  const required = sh.kind === "staff" && parseLoginPolicy(sh.login_security).require_2fa_staff;
  const { data: f } = await sb.auth.mfa.listFactors();
  const verified = f?.totp?.[0];

  if (verified) {
    return (
      <div className="card">
        <h1>{S.mfaTitle}</h1>
        <p>{sp.done ? S.mfaDoneMsg : S.mfaOn}</p>
        {required
          ? <p><small>{S.mfaReqNoOff}</small></p>
          : <form action={turnOff}><input type="hidden" name="factorId" value={verified.id} /><button>{S.mfaTurnOff}</button></form>}
        <p><a href="/dashboard">←</a></p>
      </div>
    );
  }

  if (sp.start) {
    // A half-finished earlier attempt would block a new one: remove it first.
    for (const x of f?.all ?? []) if (x.status === "unverified") await sb.auth.mfa.unenroll({ factorId: x.id });
    const { data: en, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator " + new Date().toISOString().slice(0, 16) });
    if (error || !en) return <div className="card"><h1>{S.mfaTitle}</h1><p className="err">{error?.message}</p></div>;
    return (
      <form action={confirm} className="card">
        <h1>{S.mfaTitle}</h1>
        <p>{S.mfaStep1}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={en.totp.qr_code} alt="QR" width={200} height={200} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
        <p><small>{S.mfaManualKey}<br /><code style={{ userSelect: "all", wordBreak: "break-all" }}>{en.totp.secret}</code></small></p>
        <p>{S.mfaStep2}</p>
        <input type="hidden" name="factorId" value={en.id} />
        <label>{S.mfaCode}<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required /></label>
        {sp.e && <p className="err">{S.mfaBadCode}</p>}
        <button>{S.mfaConfirm}</button>
      </form>
    );
  }

  return (
    <div className="card">
      <h1>{S.mfaTitle}</h1>
      {sp.off && <p>{S.mfaOffMsg}</p>}
      <p>{sp.required || required ? S.mfaRequired : S.mfaOff}</p>
      <p><a href="/mfa/setup?start=1"><button type="button">{S.mfaTurnOn}</button></a></p>
      {!required && <p><a href="/dashboard">←</a></p>}
    </div>
  );
}
