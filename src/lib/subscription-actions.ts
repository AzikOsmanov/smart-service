"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isCompanyAdmin, loadPrices, ownerPeople, quote, seatsInUse, asCurrency, type Lic } from "@/lib/license";
import { sendMail } from "@/lib/mailer";

const num = (v: FormDataEntryValue | null, max = 100000) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));

// A company administrator asks to renew or to buy more seats. The owner sees the request, receives the payment and records it.
export async function requestPayment(fd: FormData): Promise<void> {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("tenant_id,email,first_name,last_name").eq("id", auth.user.id).maybeSingle();
  if (!u || !(await isCompanyAdmin(admin, auth.user.id, u.tenant_id))) redirect("/dashboard");
  const { data: l } = await admin.from("tenant_licenses").select("*").eq("tenant_id", u.tenant_id).maybeSingle();
  if (!l || l.exempt || l.state === "pending") redirect("/dashboard");
  const lic = l as Lic;
  const used = await seatsInUse(admin, u.tenant_id);
  const staff = Math.max(used.staff, num(fd.get("staff_seats"))), customers = Math.max(used.customers, num(fd.get("customer_seats")));
  const months = Math.min(24, Math.max(1, num(fd.get("months"), 24)));
  const prices = await loadPrices(admin);
  const amount = quote(prices[lic.currency], !lic.reg_fee_paid_at, staff, customers, months);
  const note = String(fd.get("note") ?? "").trim().slice(0, 300) || null;
  await admin.from("payment_requests").update({ status: "dismissed" }).eq("tenant_id", u.tenant_id).eq("status", "open");   // one open request at a time
  await admin.from("payment_requests").insert({ tenant_id: u.tenant_id, staff_seats: staff, customer_seats: customers, months, amount, currency: asCurrency(lic.currency), note, requested_by: auth.user.id });
  const { data: t } = await admin.from("tenants").select("name").eq("id", u.tenant_id).maybeSingle();
  const owners = await ownerPeople(admin);
  for (const o of owners) await sendMail(o.email, `Payment request: ${t?.name ?? ""}`, `${t?.name ?? ""} asks to pay for ${months} month(s): ${staff} staff and ${customers} customer seats, ${amount.toFixed(2)} ${lic.currency}. Requested by ${u.first_name ?? ""} ${u.last_name ?? ""} (${u.email}). Confirm it in Companies after the payment arrives.`);
  revalidatePath("/admin/subscription");
  redirect("/admin/subscription");
}
