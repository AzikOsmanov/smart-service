import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";

async function changePassword(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password: String(fd.get("password")) });
  redirect("/account?msg=" + encodeURIComponent(error ? error.message : "Password changed"));
}

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const { t } = await getT();
  const { S } = await getStaff();
  const sb = await supabaseServer();
  const { data: f } = await sb.auth.mfa.listFactors();
  const on = (f?.totp?.length ?? 0) > 0;
  return (
    <div>
      <form action={changePassword} className="card">
        <h1>{t("account")}</h1>
        <label>{t("newPassword")}<input name="password" type="password" minLength={10} required /></label>
        {msg && <p>{msg}</p>}
        <button>{t("changePassword")}</button>
      </form>
      <div className="card"><h2>{S.mfaTitle}</h2><p>{on ? S.mfaOn : S.mfaOff}</p><p><a href="/mfa/setup"><button type="button">{on ? S.mfaTitle : S.mfaTurnOn}</button></a></p></div>
    </div>
  );
}
