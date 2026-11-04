import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

async function signUp(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({
    email: String(fd.get("email")),
    password: String(fd.get("password")),
    options: { data: {
      tenant_slug: "default",
      account_type: String(fd.get("account_type")),
      first_name: String(fd.get("first_name")),
      last_name: String(fd.get("last_name")),
      phone: String(fd.get("phone")),
      company_name: String(fd.get("company_name")),
      city: String(fd.get("city")),
    } },
  });
  if (error) redirect("/register?error=" + encodeURIComponent(error.message));
  redirect("/login?error=" + encodeURIComponent("Registered. Confirm your email if asked, then wait for approval by the service center."));
}

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={signUp} className="card">
      <h1>Register</h1>
      <label>I am a<select name="account_type"><option value="reseller">Reseller</option><option value="installer">Installer</option><option value="company">Company</option></select></label>
      <label>First name<input name="first_name" required /></label>
      <label>Last name<input name="last_name" required /></label>
      <label>Phone<input name="phone" required /></label>
      <label>Company name<input name="company_name" required /></label>
      <label>City<input name="city" required /></label>
      <label>Email<input name="email" type="email" required /></label>
      <label>Password<input name="password" type="password" minLength={8} required /></label>
      {error && <p className="err">{error}</p>}
      <button>Create account</button>
      <p><a href="/login">Back to sign in</a></p>
    </form>
  );
}
