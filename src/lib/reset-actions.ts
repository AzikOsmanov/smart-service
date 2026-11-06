"use server";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/i18n-staff";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPortal } from "@/lib/i18n-portal";

// Public "Forgot password": always shows the same answer, so nobody can find out which emails are registered.
export async function forgotPasswordAction(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const sb = await supabaseServer();
    await sb.auth.resetPasswordForEmail(email);
  }
  redirect("/forgot?sent=1");
}

// Administrator sends a reset link to any staff or customer of the same tenant.
export async function adminSendResetAction(fd: FormData) {
  const back = String(fd.get("back") || "/customers");
  const sb = await supabaseServer();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) redirect(`${back}?error=${encodeURIComponent((await getStaff()).S.msgAdminOnly)}`);
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  const { data: target } = await sb.from("users").select("email").eq("id", String(fd.get("id"))).eq("tenant_id", me!.tenant_id).maybeSingle();
  if (!target?.email) redirect(`${back}?error=${encodeURIComponent((await getStaff()).S.msgUserNotFound)}`);
  const { error } = await supabaseAdmin().auth.resetPasswordForEmail(target.email);
  redirect(`${back}?${error ? "error" : "ok"}=${encodeURIComponent(error ? error.message : (await getStaff()).S.msgResetSent.replace("{what}", target.email))}`);
}

export async function setNewPasswordAction(fd: FormData) {
  const { L } = await getPortal();
  const pw = String(fd.get("password") ?? "");
  const again = String(fd.get("again") ?? "");
  if (pw.length < 10) redirect("/reset-password?error=" + encodeURIComponent(L.pwShort));
  if (pw !== again) redirect("/reset-password?error=" + encodeURIComponent(L.pwMismatch));
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login?error=" + encodeURIComponent(L.resetInvalid));
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) redirect("/reset-password?error=" + encodeURIComponent(error.message));
  await sb.auth.signOut();
  redirect("/login?error=" + encodeURIComponent(L.pwChanged));
}
