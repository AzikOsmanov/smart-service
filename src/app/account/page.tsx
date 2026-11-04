import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

async function changePassword(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password: String(fd.get("password")) });
  redirect("/account?msg=" + encodeURIComponent(error ? error.message : "Password changed"));
}

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  return (
    <div>
      <p><a href="/tickets">← Tickets</a></p>
      <form action={changePassword} className="card">
        <h1>Account</h1>
        <label>New password<input name="password" type="password" minLength={10} required /></label>
        {msg && <p>{msg}</p>}
        <button>Change password</button>
      </form>
    </div>
  );
}
