import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

async function signIn(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/tickets");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={signIn} className="card">
      <h1>Smart Service</h1>
      <label>Email<input name="email" type="email" required /></label>
      <label>Password<input name="password" type="password" required /></label>
      {error && <p className="err">{error}</p>}
      <button>Sign in</button>
      <p>No account? <a href="/register">Register</a></p>
    </form>
  );
}
