import { setNewPasswordAction } from "@/lib/reset-actions";
import { getPortal } from "@/lib/i18n-portal";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { L } = await getPortal();
  return (
    <form action={setNewPasswordAction} className="card">
      <h1>{L.newPwTitle}</h1>
      <label>{L.newPw}<input name="password" type="password" minLength={10} required /></label>
      <label>{L.repeatPw}<input name="again" type="password" minLength={10} required /></label>
      {error && <p className="err">{error}</p>}
      <button>{L.saveNewPw}</button>
    </form>
  );
}
