import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import HashAuth from "@/components/HashAuth";

async function signIn(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/tickets");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { t } = await getT();
  return (
    <form action={signIn} className="card">
      <h1>{t("signIn")}</h1>
      <HashAuth />
      <label>{t("email")}<input name="email" type="email" required /></label>
      <label>{t("password")}<input name="password" type="password" required /></label>
      {error && <p className="err">{error}</p>}
      <button>{t("signIn")}</button>
      <p><a href="/forgot">Forgot password?</a></p>
      <p>{t("noAccount")} <a href="/register">{t("register")}</a></p>
    </form>
  );
}
