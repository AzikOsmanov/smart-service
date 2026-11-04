import { forgotPasswordAction } from "@/lib/reset-actions";

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <form action={forgotPasswordAction} className="card">
      <h1>Forgot password</h1>
      {sent ? <p>If this email is registered, we sent a link to create a new password. Check your inbox (and spam).</p> : (
        <>
          <p>Enter your email. We will send you a link to create a new password.</p>
          <label>Email<input name="email" type="email" required /></label>
          <button>Send reset link</button>
        </>
      )}
      <p><a href="/login">Back to sign in</a></p>
    </form>
  );
}
