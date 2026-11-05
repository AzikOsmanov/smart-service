import { forgotPasswordAction } from "@/lib/reset-actions";
import { getPortal } from "@/lib/i18n-portal";
import { getT } from "@/lib/i18n";

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  const { L } = await getPortal();
  const { t } = await getT();
  return (
    <form action={forgotPasswordAction} className="card">
      <h1>{L.forgotTitle}</h1>
      {sent ? <p>{L.forgotSent}</p> : (
        <>
          <p>{L.forgotText}</p>
          <label>{t("email")}<input name="email" type="email" required /></label>
          <button>{L.sendLink}</button>
        </>
      )}
      <p><a href="/login">{t("backToSignIn")}</a></p>
    </form>
  );
}
