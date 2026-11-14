import PasswordInput from "@/components/PasswordInput";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { getPortal } from "@/lib/i18n-portal";
import { getStaff } from "@/lib/i18n-staff";

async function signUp(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { L } = await getPortal();
  const { error } = await sb.auth.signUp({
    email: String(fd.get("email")),
    password: String(fd.get("password")),
    options: { data: {
      tenant_slug: String(fd.get("tenant") || "default").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 31) || "default",
      account_type: String(fd.get("account_type")),
      first_name: String(fd.get("first_name")),
      last_name: String(fd.get("last_name")),
      phone: String(fd.get("phone")),
      company_name: String(fd.get("company_name")),
      city: String(fd.get("city")),
    } },
  });
  if (error) redirect("/register?error=" + encodeURIComponent(error.message));
  redirect("/login?error=" + encodeURIComponent(L.registeredMsg));
}

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string; t?: string }> }) {
  const { error, t: tenantSlug } = await searchParams;
  const { t } = await getT();
  const { S } = await getStaff();
  return (
    <form action={signUp} className="card">
      <input type="hidden" name="tenant" value={tenantSlug ?? ""} />
      <h1>{t("register")}</h1>
      <p style={{ margin: "0 0 8px" }}><small>{S.suCustNote}</small></p>
      <div className="card" style={{ marginBottom: 12 }}><small>{S.suRegLine}</small><br /><a href="/company-signup"><strong>{S.suLink}</strong></a></div>
      <label>{t("iAm")}<select name="account_type"><option value="reseller">{t("reseller")}</option><option value="installer">{t("installer")}</option><option value="company">{t("company")}</option></select></label>
      <label>{t("firstName")}<input name="first_name" required /></label>
      <label>{t("lastName")}<input name="last_name" required /></label>
      <label>{t("phone")}<input name="phone" required /></label>
      <label>{t("companyName")}<input name="company_name" required /></label>
      <label>{t("city")}<input name="city" required /></label>
      <label>{t("email")}<input name="email" type="email" required /></label>
      <label>{t("password")}<PasswordInput name="password" autoComplete="new-password" minLength={8} required /></label>
      {error && <p className="err">{error}</p>}
      <button>{t("createAccount")}</button>
      <p><a href="/login">{t("backToSignIn")}</a></p>
    </form>
  );
}
