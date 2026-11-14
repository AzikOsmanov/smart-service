import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { fmtDT } from "@/lib/fmt-time";
import { fmt } from "@/lib/fmt";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";
import PopupButton from "@/components/PopupButton";
import PasswordInput from "@/components/PasswordInput";
import { provisionTenant } from "@/lib/tenant-admin";
import { sendMail, sendMailChecked } from "@/lib/mailer";
import ConfirmButton from "@/components/ConfirmButton";
import { CURRENCIES, GRACE_DAYS, TRIAL_DAYS, approveTenant, companyAdmins, mailPeople, vendorContact, type Kind, asCurrency, expiryOf, rejectTenant, type Currency, type Lic } from "@/lib/license";

// Platform owner only: companies (tenants) of this system.
async function requireOwner() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_platform_owner");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { tenantId: me!.tenant_id as string };
}

async function createTenant(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireOwner();
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const first = String(fd.get("first_name") ?? "").trim(), last = String(fd.get("last_name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const back = (k: "error" | "ok", m: string) => redirect(`/admin/tenants?${k}=` + encodeURIComponent(m));
  if (!name || !email || !first || !last || password.length < 8) back("error", S.tnErrFields);
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) back("error", S.tnErrSlug);
  const res = await provisionTenant(supabaseAdmin(), { name, slug, email, password, first, last });
  if (!res.ok) back("error", res.error === "slug_taken" ? S.tnErrSlugTaken : res.message ?? S.tnErrFields);
  else await approveTenant(supabaseAdmin(), res.tenantId, asCurrency(fd.get("currency")), false);   // created by the owner = approved
  const h = await headers();
  const link = `https://${h.get("x-forwarded-host") ?? h.get("host")}/register?t=${slug}`;
  revalidatePath("/admin/tenants");
  back("ok", fmt(S.tnCreated, { name, email, link }));
}

async function setStatus(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId } = await requireOwner();
  const id = String(fd.get("id"));
  if (id === tenantId) redirect("/admin/tenants?error=" + encodeURIComponent(S.tnSuspendSelf));
  await supabaseAdmin().from("tenants").update({ status: fd.get("status") === "suspended" ? "suspended" : "active" }).eq("id", id);
  revalidatePath("/admin/tenants");
}

async function saveApk(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId } = await requireOwner();
  const url = String(fd.get("url") ?? "").trim();
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) redirect("/admin/tenants?error=" + encodeURIComponent(S.apkErr));
  const admin = supabaseAdmin();
  const { data: def } = await admin.from("tenants").select("id").eq("slug", "default").maybeSingle();
  const tid = def?.id ?? tenantId;
  if (url) await admin.from("settings").upsert({ tenant_id: tid, key: "apk_url", value: url }, { onConflict: "tenant_id,key" });
  else await admin.from("settings").delete().eq("tenant_id", tid).eq("key", "apk_url");
  revalidatePath("/download");
  redirect("/admin/tenants?ok=" + encodeURIComponent(S.apkSaved));
}

async function approveAction(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireOwner();
  const id = String(fd.get("id"));
  const admin = supabaseAdmin();
  const { data: l } = await admin.from("tenant_licenses").select("state").eq("tenant_id", id).maybeSingle();
  if (l?.state !== "pending") redirect("/admin/tenants");
  await approveTenant(admin, id, asCurrency(fd.get("currency")));
  const { data: t } = await admin.from("tenants").select("name").eq("id", id).maybeSingle();
  revalidatePath("/admin/tenants");
  redirect("/admin/tenants?ok=" + encodeURIComponent(fmt(S.tnApproved, { name: t?.name ?? "", date: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString().slice(0, 10) })));
}

async function rejectAction(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId } = await requireOwner();
  const id = String(fd.get("id"));
  if (id === tenantId) redirect("/admin/tenants");
  const admin = supabaseAdmin();
  const { data: l } = await admin.from("tenant_licenses").select("state,exempt").eq("tenant_id", id).maybeSingle();
  if (l?.state !== "pending" || l.exempt) redirect("/admin/tenants");
  const r = await rejectTenant(admin, id);
  revalidatePath("/admin/tenants");
  redirect("/admin/tenants?" + (r.ok ? "ok=" + encodeURIComponent(S.tnRejected) : "error=" + encodeURIComponent(r.message)));
}

async function messageCompany(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireOwner();
  const id = String(fd.get("id"));
  const tpl = String(fd.get("template") ?? "custom");
  const admin = supabaseAdmin();
  const { data: t } = await admin.from("tenants").select("name").eq("id", id).maybeSingle();
  if (!t) redirect("/admin/tenants");
  const people = await companyAdmins(admin, id);
  const contact = await vendorContact(admin);
  let n = 0;
  if (tpl === "custom") {
    const subject = String(fd.get("subject") ?? "").trim().slice(0, 150), body = String(fd.get("body") ?? "").trim().slice(0, 3000);
    if (!subject || !body) redirect("/admin/tenants?error=" + encodeURIComponent(S.tnErrFields));
    for (const p of people) if (await sendMail(p.email, subject, contact ? `${body}\n\n${contact}` : body)) n++;
  } else {
    const kinds: Kind[] = ["payend", "t5", "t1", "f0", "d5", "d1"];
    if (!kinds.includes(tpl as Kind)) redirect("/admin/tenants");
    const { data: l } = await admin.from("tenant_licenses").select("*").eq("tenant_id", id).maybeSingle();
    const e = l ? expiryOf(l as Lic) : null;
    const date = e ? e.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const del = new Date((e ? e.getTime() : Date.now()) + GRACE_DAYS * 86400000).toISOString().slice(0, 10);
    n = await mailPeople(people, tpl as Kind, { name: t.name, date, del, contact });
  }
  redirect("/admin/tenants?" + (n > 0 ? "ok=" + encodeURIComponent(fmt(S.msgSent, { n: String(n), name: t.name })) : "error=" + encodeURIComponent(S.msgNone)));
}

async function recordPayment(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireOwner();
  const id = String(fd.get("id"));
  const admin = supabaseAdmin();
  const { data: l } = await admin.from("tenant_licenses").select("*").eq("tenant_id", id).maybeSingle();
  if (!l || l.exempt || l.state === "pending") redirect("/admin/tenants");
  const lic = l as Lic;
  const now = Date.now();
  const months = num(fd.get("months"), 60);
  const amount = Math.round(Math.max(0, Number(String(fd.get("amount") ?? "0").replace(",", ".")) || 0) * 100) / 100;
  const staff = num(fd.get("staff_seats")), cust = num(fd.get("customer_seats"));
  const regPaid = fd.get("reg_paid") === "on";
  const upd: Record<string, unknown> = { staff_seats: staff, customer_seats: cust, updated_at: new Date(now).toISOString(), notified: {} };
  if (regPaid && !lic.reg_fee_paid_at) upd.reg_fee_paid_at = new Date(now).toISOString();
  let until: string | null = lic.state === "active" ? lic.paid_until : null;
  if (months > 0) {
    const cur = lic.state === "active" && lic.paid_until ? new Date(lic.paid_until).getTime() : 0;
    const d = new Date(Math.max(now, cur));
    d.setUTCMonth(d.getUTCMonth() + months);
    until = d.toISOString();
    upd.paid_until = until;
    upd.state = "active";
  }
  await admin.from("tenant_licenses").update(upd).eq("tenant_id", id);
  await admin.from("license_payments").insert({ tenant_id: id, amount, currency: lic.currency, method: String(fd.get("method") ?? "").trim().slice(0, 80) || null, months, staff_seats: staff, customer_seats: cust, reg_fee: regPaid, paid_until: until, note: String(fd.get("note") ?? "").trim().slice(0, 300) || null });
  const rid = String(fd.get("request_id") ?? "");
  if (rid) await admin.from("payment_requests").update({ status: "done" }).eq("id", rid).eq("tenant_id", id);
  const { data: t } = await admin.from("tenants").select("name").eq("id", id).maybeSingle();
  if (months > 0 && until) await mailPeople(await companyAdmins(admin, id), "paid", { name: t?.name ?? "", date: until.slice(0, 10), del: "", contact: await vendorContact(admin) });
  revalidatePath("/admin/tenants");
  redirect("/admin/tenants?ok=" + encodeURIComponent(fmt(S.payRecorded, { name: t?.name ?? "", date: (until ?? "").slice(0, 10) || "—" })));
}

async function dismissRequest(fd: FormData) {
  "use server";
  await requireOwner();
  await supabaseAdmin().from("payment_requests").update({ status: "dismissed" }).eq("id", String(fd.get("id")));
  revalidatePath("/admin/tenants");
}

async function addMethod(fd: FormData) {
  "use server";
  await requireOwner();
  const name = String(fd.get("name") ?? "").trim().slice(0, 80), instructions = String(fd.get("instructions") ?? "").trim().slice(0, 2000);
  if (name) await supabaseAdmin().from("payment_methods").insert({ name, instructions });
  revalidatePath("/admin/tenants");
}

async function toggleMethod(fd: FormData) {
  "use server";
  await requireOwner();
  await supabaseAdmin().from("payment_methods").update({ enabled: fd.get("enabled") === "1" }).eq("id", String(fd.get("id")));
  revalidatePath("/admin/tenants");
}

async function deleteMethod(fd: FormData) {
  "use server";
  await requireOwner();
  await supabaseAdmin().from("payment_methods").delete().eq("id", String(fd.get("id")));
  revalidatePath("/admin/tenants");
}

async function testMail() {
  "use server";
  await requireOwner();
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const to = auth.user?.email ?? "";
  const r = await sendMailChecked(to, "Smart Service: test email", "This is a test email from Smart Service. If you can read it, license warnings and approval emails will reach people.");
  redirect("/admin/tenants?" + (r.ok ? "ok=" + encodeURIComponent(`Test email sent to ${to}.`) : "error=" + encodeURIComponent(`Test email failed: ${r.error}`)));
}

const num = (v: FormDataEntryValue | null, max = 100000) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));

async function saveLicense(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireOwner();
  const id = String(fd.get("id"));
  const admin = supabaseAdmin();
  const { data: l } = await admin.from("tenant_licenses").select("*").eq("tenant_id", id).maybeSingle();
  if (!l || l.exempt || l.state === "pending") redirect("/admin/tenants");
  const lic = l as Lic;
  const now = Date.now();
  const upd: Record<string, unknown> = { currency: asCurrency(fd.get("currency")), staff_seats: num(fd.get("staff_seats")), customer_seats: num(fd.get("customer_seats")), notes: String(fd.get("notes") ?? "").slice(0, 500) || null, updated_at: new Date(now).toISOString() };
  upd.reg_fee_paid_at = fd.get("reg_paid") === "on" ? (lic.reg_fee_paid_at ?? new Date(now).toISOString()) : null;
  const ext = num(fd.get("extend_days"), 365), months = num(fd.get("add_months"), 60);
  if (ext > 0 && lic.state === "trial") {
    const base = Math.max(now, lic.trial_ends_at ? new Date(lic.trial_ends_at).getTime() : now);
    upd.trial_ends_at = new Date(base + ext * 86400000).toISOString();
    upd.notified = {};
  }
  const pu = String(fd.get("paid_until") ?? "");
  const curDay = lic.state === "active" && lic.paid_until ? new Date(lic.paid_until).toISOString().slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(pu) && pu !== curDay) {
    // an exact end date typed by the owner wins over "add months"
    upd.paid_until = `${pu}T23:59:59Z`;
    upd.state = "active";
    upd.notified = {};
  } else if (months > 0) {
    const cur = lic.state === "active" && lic.paid_until ? new Date(lic.paid_until).getTime() : 0;
    const d = new Date(Math.max(now, cur));
    d.setUTCMonth(d.getUTCMonth() + months);
    upd.paid_until = d.toISOString();
    upd.state = "active";
    upd.notified = {};
  }
  await admin.from("tenant_licenses").update(upd).eq("tenant_id", id);
  revalidatePath("/admin/tenants");
  redirect("/admin/tenants?ok=" + encodeURIComponent(S.licSaved));
}

async function savePrices(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  await requireOwner();
  const rows: { currency: string; kind: string; amount: number }[] = [];
  for (const c of CURRENCIES) for (const k of ["reg_fee", "staff_seat", "customer_seat"]) rows.push({ currency: c, kind: k, amount: Math.round(Math.max(0, Number(String(fd.get(`${c}_${k}`) ?? "0").replace(",", ".")) || 0) * 100) / 100 });
  await supabaseAdmin().from("license_prices").upsert(rows, { onConflict: "currency,kind" });
  revalidatePath("/admin/tenants");
  redirect("/admin/tenants?ok=" + encodeURIComponent(S.licSaved));
}

async function saveContact(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId } = await requireOwner();
  const admin = supabaseAdmin();
  const { data: def } = await admin.from("tenants").select("id").eq("slug", "default").maybeSingle();
  const tid = def?.id ?? tenantId;
  const v = String(fd.get("contact") ?? "").trim().slice(0, 600);
  if (v) await admin.from("settings").upsert({ tenant_id: tid, key: "vendor_contact", value: v }, { onConflict: "tenant_id,key" });
  else await admin.from("settings").delete().eq("tenant_id", tid).eq("key", "vendor_contact");
  redirect("/admin/tenants?ok=" + encodeURIComponent(S.licSaved));
}

export default async function Tenants({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { tenantId } = await requireOwner();
  const { t } = await getT();
  const { S } = await getStaff();
  const admin = supabaseAdmin();
  const { data: rows } = await admin.from("tenants").select("id,name,slug,status,is_demo,created_at").is("deleted_at", null).order("created_at");
  const { data: lics } = await admin.from("tenant_licenses").select("*");
  const licOf = new Map((lics ?? []).map((l) => [l.tenant_id as string, l as Lic]));
  const { data: priceRows } = await admin.from("license_prices").select("currency,kind,amount");
  const price = (c: string, k: string) => Number((priceRows ?? []).find((r) => r.currency === c && r.kind === k)?.amount ?? 0);
  const counts = new Map<string, number>(), staffUsed = new Map<string, number>(), custUsed = new Map<string, number>(), adminMail = new Map<string, string>();
  await Promise.all((rows ?? []).map(async (r) => {
    const { count } = await admin.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", r.id).is("deleted_at", null);
    counts.set(r.id, count ?? 0);
    const st = await admin.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", r.id).eq("kind", "staff").eq("is_active", true).is("deleted_at", null);
    staffUsed.set(r.id, st.count ?? 0);
    const cu = await admin.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", r.id).eq("kind", "customer").eq("registration", "approved").eq("is_active", true).is("deleted_at", null);
    custUsed.set(r.id, cu.count ?? 0);
    if (licOf.get(r.id)?.state === "pending") {
      const { data: u } = await admin.from("users").select("email,first_name,last_name").eq("tenant_id", r.id).eq("kind", "staff").order("created_at").limit(1).maybeSingle();
      if (u) adminMail.set(r.id, `${u.first_name ?? ""} ${u.last_name ?? ""} · ${u.email}`.trim());
    }
  }));
  const day = (v: Date | string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "—");
  const licLabel = (l: Lic | undefined) => {
    if (!l) return "—";
    if (l.exempt) return S.licStExempt;
    if (l.state === "pending") return S.licStPending;
    const e = expiryOf(l);
    if (!e || e.getTime() <= Date.now()) return fmt(S.licStFrozen, { date: day(e ? new Date(e.getTime() + GRACE_DAYS * 86400000) : null) });
    if (l.state === "trial") return fmt(S.licStTrial, { n: String(Math.ceil((e.getTime() - Date.now()) / 86400000)) });
    return fmt(S.licStActive, { date: day(e) });
  };
  const due = (l: Lic) => {
    const amt = (l.reg_fee_paid_at ? 0 : price(l.currency, "reg_fee")) + l.staff_seats * price(l.currency, "staff_seat") + l.customer_seats * price(l.currency, "customer_seat");
    return `${amt.toFixed(2)} ${l.currency}`;
  };
  const { data: methodRows } = await admin.from("payment_methods").select("id,name,instructions,enabled").order("sort").order("created_at");
  const { data: reqRows } = await admin.from("payment_requests").select("*").eq("status", "open").order("created_at");
  const { data: payRows } = await admin.from("license_payments").select("id,tenant_id,created_at,amount,currency,method,months,paid_until").order("created_at", { ascending: false }).limit(25);
  const nameOf = new Map((rows ?? []).map((r) => [r.id as string, r.name as string]));
  const payForm = (tid: string, l: Lic, req?: { id: string; staff_seats: number; customer_seats: number; months: number; amount: number }) => (
    <form action={recordPayment}>
      <input type="hidden" name="id" value={tid} />
      {req && <input type="hidden" name="request_id" value={req.id} />}
      <label>{S.payAmount} ({l.currency})<input name="amount" type="number" min={0} step="0.01" defaultValue={req ? Number(req.amount) : 0} /></label>
      <label>{S.payMethod}<select name="method">{(methodRows ?? []).map((m) => <option key={m.id as string} value={m.name as string}>{m.name as string}</option>)}<option value="">{S.payOther}</option></select></label>
      <label>{S.payMonths}<input name="months" type="number" min={0} max={60} defaultValue={req ? req.months : 1} /></label>
      <label>{S.licStaffSeats}<input name="staff_seats" type="number" min={0} defaultValue={req ? req.staff_seats : l.staff_seats} /></label>
      <label>{S.licCustSeats}<input name="customer_seats" type="number" min={0} defaultValue={req ? req.customer_seats : l.customer_seats} /></label>
      <label><input type="checkbox" name="reg_paid" defaultChecked={!l.reg_fee_paid_at} /> {S.payInclReg}</label>
      <label>{S.payNote}<input name="note" maxLength={300} /></label>
      <button>{S.paySave}</button>
    </form>
  );
  const pending = (rows ?? []).filter((r) => licOf.get(r.id)?.state === "pending");
  const { data: def } = await admin.from("tenants").select("id").eq("slug", "default").maybeSingle();
  const { data: apk } = def ? await admin.from("settings").select("value").eq("tenant_id", def.id).eq("key", "apk_url").maybeSingle() : { data: null };
  const { data: contactRow } = def ? await admin.from("settings").select("value").eq("tenant_id", def.id).eq("key", "vendor_contact").maybeSingle() : { data: null };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{t("tenants")}</h1>
        <span><PopupButton label={S.tnCreate} title={S.tnCreate}>
          <form action={createTenant}>
            <label>{S.tnName}<input name="name" required /></label>
            <label>{S.tnSlug}<input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,30}" /></label>
            <label>{S.tnFirst}<input name="first_name" required /></label>
            <label>{S.tnLast}<input name="last_name" required /></label>
            <label>{S.tnAdminEmail}<input name="email" type="email" required /></label>
            <label>{S.tnPassword}<PasswordInput name="password" autoComplete="new-password" minLength={8} required /></label>
            <label>{S.tnCurrency}<select name="currency">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <button>{S.tnCreate}</button>
          </form>
        </PopupButton></span>
      </div>
      <p>{S.tnIntro}</p>
      {error && <p className="err">{error}</p>}
      {ok && <p style={{ wordBreak: "break-all" }}>{ok}</p>}
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>{S.tnPending} ({pending.length})</h2>
          <table><tbody>{pending.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.name}</strong><br /><small>{adminMail.get(r.id) ?? ""}</small></td>
              <td>{fmtDT(r.created_at)}</td>
              <td>
                <form action={approveAction} className="row">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="currency" aria-label={S.tnCurrency}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  <button>{S.tnApprove}</button>
                  <ConfirmButton formAction={rejectAction} message={S.tnRejectConfirm}>{S.tnReject}</ConfirmButton>
                </form>
              </td>
            </tr>))}</tbody></table>
        </div>
      )}
      {(reqRows ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>{S.payReqTitle} ({(reqRows ?? []).length})</h2>
          <table><tbody>{(reqRows ?? []).map((q) => {
            const lq = licOf.get(q.tenant_id as string);
            return (
              <tr key={q.id as string}>
                <td><strong>{nameOf.get(q.tenant_id as string) ?? ""}</strong><br /><small>{fmtDT(q.created_at as string)}{q.note ? ` · ${q.note}` : ""}</small></td>
                <td>{q.months as number} · {q.staff_seats as number}/{q.customer_seats as number}</td>
                <td>{Number(q.amount).toFixed(2)} {q.currency as string}</td>
                <td><div className="row">
                  {lq && <PopupButton label={S.payRecord} title={`${S.payRecord} · ${nameOf.get(q.tenant_id as string) ?? ""}`}>{payForm(q.tenant_id as string, lq, { id: q.id as string, staff_seats: q.staff_seats as number, customer_seats: q.customer_seats as number, months: q.months as number, amount: Number(q.amount) })}</PopupButton>}
                  <form action={dismissRequest}><input type="hidden" name="id" value={q.id as string} /><button>{S.payDismiss}</button></form>
                </div></td>
              </tr>);
          })}</tbody></table>
        </div>
      )}
      <div className="card">
        <table><thead><tr><th>{S.tnName}</th><th>{S.tnSlug.split(" (")[0]}</th><th>{S.tnUsers}</th><th>{S.tnStatus}</th><th>{S.tnLicense}</th><th>{S.licSeatsCol}</th><th>{S.licDue}</th><th>{S.tnRegLink}</th><th>{t("created")}</th><th></th></tr></thead>
          <tbody>{(rows ?? []).filter((r) => licOf.get(r.id)?.state !== "pending").map((r) => {
            const l = licOf.get(r.id);
            return (
            <tr key={r.id}>
              <td>{r.name}{r.is_demo ? ` · ${S.tnDemoTag}` : ""}</td><td>{r.slug}</td><td>{counts.get(r.id) ?? 0}</td>
              <td>{r.status === "active" ? S.tnActive : S.tnSuspended}</td>
              <td>{licLabel(l)}</td>
              <td>{l && !l.exempt ? `${staffUsed.get(r.id) ?? 0}/${l.staff_seats} · ${custUsed.get(r.id) ?? 0}/${l.customer_seats}` : "—"}</td>
              <td>{l && !l.exempt ? due(l) : "—"}</td>
              <td>{r.is_demo ? "—" : <small>{`https://${host}/register${r.slug === "default" ? "" : `?t=${r.slug}`}`}</small>}</td>
              <td>{fmtDT(r.created_at)}</td>
              <td>
                <div className="row">
                  {l && !l.exempt && <PopupButton label={S.payRecord} title={`${S.payRecord} · ${r.name}`}>{payForm(r.id, l)}</PopupButton>}
                  {l && !l.exempt && <PopupButton label={S.tnLicense} title={`${S.tnLicense} · ${r.name}`}>
                    <form action={saveLicense}>
                      <input type="hidden" name="id" value={r.id} />
                      <label>{S.tnCurrency}<select name="currency" defaultValue={l.currency}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
                      <label>{S.licStaffSeats}<input name="staff_seats" type="number" min={0} defaultValue={l.staff_seats} /></label>
                      <label>{S.licCustSeats}<input name="customer_seats" type="number" min={0} defaultValue={l.customer_seats} /></label>
                      <label><input type="checkbox" name="reg_paid" defaultChecked={!!l.reg_fee_paid_at} /> {S.licRegPaid}</label>
                      <label>{S.licPaidUntil}<input name="paid_until" type="date" defaultValue={l.state === "active" && l.paid_until ? new Date(l.paid_until).toISOString().slice(0, 10) : ""} /></label>
                      <label>{S.licAddMonths}<input name="add_months" type="number" min={0} max={60} defaultValue={0} /></label>
                      {l.state === "trial" && <label>{S.licExtendTrial}<input name="extend_days" type="number" min={0} max={365} defaultValue={0} /></label>}
                      <label>{S.licNotes}<input name="notes" defaultValue={l.notes ?? ""} maxLength={500} /></label>
                      <button>{S.licSave}</button>
                    </form>
                  </PopupButton>}
                  <PopupButton label={S.msgSend} title={`${S.msgSend} · ${r.name}`}>
                    <form action={messageCompany}>
                      <input type="hidden" name="id" value={r.id} />
                      <label>{S.msgTemplate}<select name="template" defaultValue="custom">
                        <option value="custom">{S.msgTplCustom}</option>
                        <option value="payend">{S.msgTplPayEnd}</option>
                        <option value="t5">{S.msgTplT5}</option>
                        <option value="t1">{S.msgTplT1}</option>
                        <option value="f0">{S.msgTplF0}</option>
                        <option value="d5">{S.msgTplD5}</option>
                        <option value="d1">{S.msgTplD1}</option>
                      </select></label>
                      <label>{S.msgSubject}<input name="subject" maxLength={150} /></label>
                      <label>{S.msgBody}<textarea name="body" rows={4} maxLength={3000} /></label>
                      <small>{S.msgHelp}</small>
                      <button>{S.msgSendBtn}</button>
                    </form>
                  </PopupButton>
                  {r.id !== tenantId && <form action={setStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "active" ? "suspended" : "active"} /><button>{r.status === "active" ? S.tnSuspend : S.tnActivate}</button></form>}
                </div>
              </td>
            </tr>);
          })}</tbody></table>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>{S.licPrices}</h2>
        <p>{S.licPricesHelp}</p>
        <form action={savePrices}>
          <table><thead><tr><th>{S.tnCurrency}</th><th>{S.licRegFee}</th><th>{S.licStaffPrice}</th><th>{S.licCustPrice}</th></tr></thead>
            <tbody>{CURRENCIES.map((c: Currency) => (
              <tr key={c}><td>{c}</td>
                {["reg_fee", "staff_seat", "customer_seat"].map((k) => <td key={k}><input name={`${c}_${k}`} type="number" min={0} step="0.01" defaultValue={price(c, k)} style={{ width: 120 }} /></td>)}
              </tr>))}</tbody></table>
          <button style={{ marginTop: 8 }}>{S.licPricesSave}</button>
        </form>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>{S.mthTitle}</h2>
        <p>{S.pmHelp}</p>
        {(methodRows ?? []).map((m) => (
          <div key={m.id as string} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div><strong>{m.name as string}</strong>{m.enabled ? "" : " (—)"}<div style={{ whiteSpace: "pre-wrap" }}><small>{m.instructions as string}</small></div></div>
            <div className="row">
              <form action={toggleMethod}><input type="hidden" name="id" value={m.id as string} /><input type="hidden" name="enabled" value={m.enabled ? "0" : "1"} /><button>{m.enabled ? S.pmHide : S.pmShow}</button></form>
              <form action={deleteMethod}><input type="hidden" name="id" value={m.id as string} /><ConfirmButton message={S.pmDelete + "?"}>{S.pmDelete}</ConfirmButton></form>
            </div>
          </div>))}
        <form action={addMethod}>
          <label>{S.mthName}<input name="name" required maxLength={80} /></label>
          <label>{S.pmText}<textarea name="instructions" rows={3} maxLength={2000} style={{ width: "100%" }} /></label>
          <button>{S.pmAdd}</button>
        </form>
      </div>
      {(payRows ?? []).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>{S.payHistory}</h2>
          <table><thead><tr><th>{S.subDate}</th><th>{S.tnName}</th><th>{S.subAmount}</th><th>{S.subMethod}</th><th>{S.payMonths}</th><th>{S.subPaidUntil}</th></tr></thead>
            <tbody>{(payRows ?? []).map((r) => (
              <tr key={r.id as string}><td>{fmtDT(r.created_at as string)}</td><td>{nameOf.get(r.tenant_id as string) ?? "—"}</td><td>{Number(r.amount).toFixed(2)} {r.currency as string}</td><td>{(r.method as string) ?? "—"}</td><td>{r.months as number}</td><td>{day(r.paid_until as string | null)}</td></tr>))}</tbody></table>
        </div>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <form action={testMail}><button>Send test email to me</button></form>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>{S.licContactTitle}</h2>
        <p>{S.licContactHelp}</p>
        <form action={saveContact}>
          <textarea name="contact" rows={3} defaultValue={typeof contactRow?.value === "string" ? contactRow.value : ""} maxLength={600} style={{ width: "100%" }} />
          <button style={{ marginTop: 8 }}>{S.licContactSave}</button>
        </form>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>{S.apkTitle}</h2>
        <p>{S.apkHelp}</p>
        <form action={saveApk} className="row">
          <input name="url" type="url" defaultValue={typeof apk?.value === "string" ? apk.value : ""} placeholder="https://" style={{ flex: 1, minWidth: 240 }} />
          <button>{S.apkSave}</button>
        </form>
      </div>
    </div>
  );
}
