import { setNewPasswordAction } from "@/lib/reset-actions";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={setNewPasswordAction} className="card">
      <h1>Create new password</h1>
      <label>New password<input name="password" type="password" minLength={10} required /></label>
      <label>Repeat new password<input name="again" type="password" minLength={10} required /></label>
      {error && <p className="err">{error}</p>}
      <button>Save new password</button>
    </form>
  );
}
