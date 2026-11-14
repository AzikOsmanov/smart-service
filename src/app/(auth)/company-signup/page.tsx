import { redirect } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseServer } from "@/lib/supabase-server";
import { getLang } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";
import { RESERVED_SLUGS, provisionTenant, slugFromName } from "@/lib/tenant-admin";

// Public: a company registers its own service center. It becomes a separate company (tenant) with its own administrator.
async function signUpCompany(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const lang = await getLang();
  const fail = (m: string) => redirect("/company-signup?error=" + encodeURIComponent(m));
  if (String(fd.get("website") ?? "") !== "") return fail(S.suErrFailed);   // hidden field: only bots fill it in
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const first = String(fd.get("first_name") ?? "").trim().slice(0, 60), last = String(fd.get("last_name") ?? "").trim().slice(0, 60);
  const phone = String(fd.get("phone") ?? "").trim().slice(0, 40);
  const password = String(fd.get("password") ?? "");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !first || !last || password.length < 8) return fail(S.tnErrFields);
  const admin = supabaseAdmin();
  const { count } = await admin.from("tenants").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if ((count ?? 0) >= 20) return fail(S.suErrLimit);
  let slug = slugFromName(name);
  if (RESERVED_SLUGS.includes(slug)) slug = `${slug}-co`;
  let res = await provisionTenant(admin, { name, slug, lang, email, password, first, last, phone });
  for (let i = 0; i < 4 && !res.ok && res.error === "slug_taken"; i++) res = await provisionTenant(admin, { name, slug: `${slug.slice(0, 26)}-${Math.random().toString(36).slice(2, 6)}`, lang, email, password, first, last, phone });
  if (!res.ok) return fail(res.error === "email_taken" ? S.suErrEmail : S.suErrFailed);
  const sb = await supabaseServer();
  await sb.auth.signOut();   // whoever was signed in on this browser (e.g. the platform owner) is replaced by the new company's administrator
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) redirect("/login");
  redirect("/dashboard");   // an administrator is asked to set up two-step login first
}

export default async function CompanySignup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { S } = await getStaff();
  return (
    <form action={signUpCompany} className="card">
      <h1>{S.suTitle}</h1>
      <p>{S.suIntro}</p>
      <label>{S.tnName}<input name="name" required maxLength={80} /></label>
      <label>{S.tnFirst}<input name="first_name" required maxLength={60} /></label>
      <label>{S.tnLast}<input name="last_name" required maxLength={60} /></label>
      <label>{S.phone}<input name="phone" type="tel" maxLength={40} /></label>
      <label>{S.tnAdminEmail}<input name="email" type="email" required /></label>
      <label>{S.tnPassword}<PasswordInput name="password" autoComplete="new-password" minLength={8} required /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {error && <p className="err">{error}</p>}
      <button>{S.suCreate}</button>
      <p><a href="/login">{S.suBack}</a></p>
    </form>
  );
}
