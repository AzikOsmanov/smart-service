import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "@/lib/mailer";

type Admin = SupabaseClient;
export const TRIAL_DAYS = 15;     // free trial after the owner approves a company
export const GRACE_DAYS = 10;     // after the license ends the company is frozen; its data is deleted this many days later
const DAY = 86400000;

export type Currency = "AZN" | "USD" | "EUR";
export const CURRENCIES: Currency[] = ["AZN", "USD", "EUR"];
export const asCurrency = (v: unknown): Currency => (CURRENCIES.includes(v as Currency) ? (v as Currency) : "USD");

export type Lic = {
  tenant_id: string; state: "pending" | "trial" | "active"; exempt: boolean; currency: Currency;
  approved_at: string | null; trial_ends_at: string | null; reg_fee_paid_at: string | null; paid_until: string | null;
  staff_seats: number; customer_seats: number; notes: string | null; notified: Record<string, boolean>;
};

export function expiryOf(l: Pick<Lic, "state" | "trial_ends_at" | "paid_until">): Date | null {
  const v = l.state === "trial" ? l.trial_ends_at : l.state === "active" ? l.paid_until : null;
  return v ? new Date(v) : null;
}

// ---- who gets mail -------------------------------------------------------------------------------------------------
type Person = { email: string; lang: string };

export async function companyAdmins(admin: Admin, tenantId: string): Promise<Person[]> {
  const { data: roles } = await admin.from("roles").select("id").eq("tenant_id", tenantId).eq("is_admin", true);
  const ids = (roles ?? []).map((r) => r.id as string);
  if (!ids.length) return [];
  const { data: ur } = await admin.from("user_roles").select("user_id").in("role_id", ids);
  const uids = (ur ?? []).map((r) => r.user_id as string);
  if (!uids.length) return [];
  const { data: us } = await admin.from("users").select("email,language").eq("tenant_id", tenantId).eq("is_active", true).is("deleted_at", null).in("id", uids);
  return (us ?? []).map((u) => ({ email: u.email as string, lang: (u.language as string) ?? "en" }));
}

export async function ownerPeople(admin: Admin): Promise<Person[]> {
  const { data: po } = await admin.from("platform_owners").select("user_id");
  const ids = (po ?? []).map((r) => r.user_id as string);
  if (!ids.length) return [];
  const { data: us } = await admin.from("users").select("email,language").in("id", ids);
  return (us ?? []).map((u) => ({ email: u.email as string, lang: (u.language as string) ?? "en" }));
}

export async function vendorContact(admin: Admin): Promise<string> {
  const { data: def } = await admin.from("tenants").select("id").eq("slug", "default").maybeSingle();
  if (!def) return "";
  const { data } = await admin.from("settings").select("value").eq("tenant_id", def.id).eq("key", "vendor_contact").maybeSingle();
  return typeof data?.value === "string" ? data.value : "";
}

// ---- texts ---------------------------------------------------------------------------------------------------------
export type Kind = "t5" | "t1" | "f0" | "d5" | "d1" | "payend" | "approved" | "rejected" | "received" | "newcompany";
type V = { name: string; date: string; del: string; contact: string; email?: string };
type Tx = (v: V) => [string, string];
const tail = (c: string) => (c ? `\n\n${c}` : "");

const TEXT: Record<"en" | "ru" | "az", Record<Kind, Tx>> = {
  en: {
    t5: (v) => [`Trial of ${v.name} ends in 5 days`, `The free trial of ${v.name} ends on ${v.date}. To keep working without a break, please arrange the license payment before that date.${tail(v.contact)}`],
    t1: (v) => [`Trial of ${v.name} ends tomorrow`, `The free trial of ${v.name} ends tomorrow (${v.date}). After that the system is frozen until the license is paid.${tail(v.contact)}`],
    f0: (v) => [`${v.name} is frozen: license not paid`, `The license of ${v.name} ended on ${v.date}, so access is frozen. Pay the license and everything comes back exactly as it was. If it is not paid by ${v.del}, ALL data of the company will be deleted permanently.${tail(v.contact)}`],
    d5: (v) => [`${v.name}: data will be deleted in 5 days`, `The license of ${v.name} is still not paid. On ${v.del} all data of the company (users, tickets, devices, files) will be deleted permanently.${tail(v.contact)}`],
    d1: (v) => [`${v.name}: data will be deleted tomorrow`, `Last warning: tomorrow (${v.del}) all data of ${v.name} will be deleted permanently unless the license is paid today.${tail(v.contact)}`],
    payend: (v) => [`Payment period of ${v.name} has ended`, `The paid period of ${v.name} ended on ${v.date}. Please pay for the next period to keep working. If it is not paid, access is frozen and all data of the company is deleted permanently on ${v.del}.${tail(v.contact)}`],
    approved: (v) => [`${v.name} is approved`, `Your service center ${v.name} is approved. You can sign in now. The free trial lasts 15 days, until ${v.date}.${tail(v.contact)}`],
    rejected: (v) => [`Registration of ${v.name} was declined`, `Your registration of ${v.name} was not approved.${tail(v.contact)}`],
    received: (v) => [`We received your registration of ${v.name}`, `Thank you. Your service center ${v.name} is waiting for approval. We will email you as soon as it is approved.${tail(v.contact)}`],
    newcompany: (v) => [`New company waiting for approval: ${v.name}`, `${v.name} (${v.email ?? ""}) registered and waits for your approval in Companies.`],
  },
  ru: {
    t5: (v) => [`Пробный период ${v.name} заканчивается через 5 дней`, `Бесплатный период ${v.name} заканчивается ${v.date}. Чтобы работать без перерыва, оплатите лицензию до этой даты.${tail(v.contact)}`],
    t1: (v) => [`Пробный период ${v.name} заканчивается завтра`, `Бесплатный период ${v.name} заканчивается завтра (${v.date}). Затем система будет заморожена до оплаты лицензии.${tail(v.contact)}`],
    f0: (v) => [`${v.name} заморожена: лицензия не оплачена`, `Лицензия ${v.name} закончилась ${v.date}, доступ заморожен. После оплаты всё вернётся как было. Если лицензия не будет оплачена до ${v.del}, ВСЕ данные компании будут удалены без возможности восстановления.${tail(v.contact)}`],
    d5: (v) => [`${v.name}: данные будут удалены через 5 дней`, `Лицензия ${v.name} всё ещё не оплачена. ${v.del} все данные компании (пользователи, заявки, устройства, файлы) будут удалены безвозвратно.${tail(v.contact)}`],
    d1: (v) => [`${v.name}: данные будут удалены завтра`, `Последнее предупреждение: завтра (${v.del}) все данные ${v.name} будут удалены безвозвратно, если лицензия не будет оплачена сегодня.${tail(v.contact)}`],
    payend: (v) => [`Оплаченный период ${v.name} закончился`, `Оплаченный период ${v.name} закончился ${v.date}. Оплатите следующий период, чтобы продолжить работу. Если оплаты не будет, доступ заморозят, а все данные компании будут безвозвратно удалены ${v.del}.${tail(v.contact)}`],
    approved: (v) => [`${v.name} одобрена`, `Ваш сервисный центр ${v.name} одобрен. Теперь можно войти. Бесплатный период — 15 дней, до ${v.date}.${tail(v.contact)}`],
    rejected: (v) => [`Регистрация ${v.name} отклонена`, `Регистрация ${v.name} не была одобрена.${tail(v.contact)}`],
    received: (v) => [`Мы получили регистрацию ${v.name}`, `Спасибо. Сервисный центр ${v.name} ожидает одобрения. Мы напишем вам сразу после одобрения.${tail(v.contact)}`],
    newcompany: (v) => [`Новая компания ждёт одобрения: ${v.name}`, `${v.name} (${v.email ?? ""}) зарегистрировалась и ждёт вашего одобрения в разделе «Компании».`],
  },
  az: {
    t5: (v) => [`${v.name} üçün sınaq müddəti 5 gün sonra bitir`, `${v.name} üçün pulsuz sınaq müddəti ${v.date} tarixində bitir. Fasiləsiz işləmək üçün lisenziyanı həmin tarixə qədər ödəyin.${tail(v.contact)}`],
    t1: (v) => [`${v.name} üçün sınaq müddəti sabah bitir`, `${v.name} üçün pulsuz sınaq müddəti sabah (${v.date}) bitir. Sonra lisenziya ödənilənə qədər sistem dondurulacaq.${tail(v.contact)}`],
    f0: (v) => [`${v.name} dondurulub: lisenziya ödənilməyib`, `${v.name} lisenziyası ${v.date} tarixində bitdi, giriş dondurulub. Ödəniş edilən kimi hər şey əvvəlki kimi qayıdacaq. ${v.del} tarixinə qədər ödənilməsə, şirkətin BÜTÜN məlumatları həmişəlik silinəcək.${tail(v.contact)}`],
    d5: (v) => [`${v.name}: məlumatlar 5 gün sonra silinəcək`, `${v.name} lisenziyası hələ də ödənilməyib. ${v.del} tarixində şirkətin bütün məlumatları (istifadəçilər, sorğular, cihazlar, fayllar) həmişəlik silinəcək.${tail(v.contact)}`],
    d1: (v) => [`${v.name}: məlumatlar sabah silinəcək`, `Son xəbərdarlıq: lisenziya bu gün ödənilməsə, sabah (${v.del}) ${v.name} şirkətinin bütün məlumatları həmişəlik silinəcək.${tail(v.contact)}`],
    payend: (v) => [`${v.name} üçün ödənilmiş dövr bitdi`, `${v.name} üçün ödənilmiş dövr ${v.date} tarixində bitdi. İşi davam etdirmək üçün növbəti dövrü ödəyin. Ödənilməsə, giriş dondurulacaq və şirkətin bütün məlumatları ${v.del} tarixində həmişəlik silinəcək.${tail(v.contact)}`],
    approved: (v) => [`${v.name} təsdiqləndi`, `${v.name} servis mərkəziniz təsdiqləndi. İndi daxil ola bilərsiniz. Pulsuz sınaq müddəti 15 gündür, ${v.date} tarixinədək.${tail(v.contact)}`],
    rejected: (v) => [`${v.name} qeydiyyatı rədd edildi`, `${v.name} qeydiyyatı təsdiqlənmədi.${tail(v.contact)}`],
    received: (v) => [`${v.name} qeydiyyatını aldıq`, `Təşəkkür edirik. ${v.name} servis mərkəzi təsdiq gözləyir. Təsdiqlənən kimi sizə yazacağıq.${tail(v.contact)}`],
    newcompany: (v) => [`Təsdiq gözləyən yeni şirkət: ${v.name}`, `${v.name} (${v.email ?? ""}) qeydiyyatdan keçdi və «Şirkətlər» bölməsində təsdiqinizi gözləyir.`],
  },
};

const ymd = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export async function mailPeople(people: Person[], kind: Kind, v: V): Promise<number> {
  let n = 0;
  for (const p of people) {
    const lang = (["en", "ru", "az"].includes(p.lang) ? p.lang : "en") as "en" | "ru" | "az";
    const [subject, body] = TEXT[lang][kind](v);
    if (await sendMail(p.email, subject, body)) n++;
  }
  return n;
}

// ---- actions -------------------------------------------------------------------------------------------------------
export async function approveTenant(admin: Admin, tenantId: string, currency: Currency, notify = true): Promise<void> {
  const now = new Date(), end = new Date(now.getTime() + TRIAL_DAYS * DAY);
  await admin.from("tenant_licenses").update({ state: "trial", currency, approved_at: now.toISOString(), trial_ends_at: end.toISOString(), notified: {}, updated_at: now.toISOString() }).eq("tenant_id", tenantId);
  if (notify) {
    const { data: t } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    await mailPeople(await companyAdmins(admin, tenantId), "approved", { name: t?.name ?? "", date: ymd(end), del: "", contact: await vendorContact(admin) });
  }
}

// Deletes a company completely (a copy of its data is kept for 30 days) and removes its sign-in accounts.
export async function purgeTenantFully(admin: Admin, tenantId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: us } = await admin.from("users").select("id").eq("tenant_id", tenantId);
  const ids = (us ?? []).map((u) => u.id as string);
  const { error } = await admin.rpc("purge_tenant", { p_tenant: tenantId });
  if (error) return { ok: false, message: error.message };
  for (const id of ids) await admin.auth.admin.deleteUser(id);
  return { ok: true };
}

export async function rejectTenant(admin: Admin, tenantId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: t } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const people = await companyAdmins(admin, tenantId);
  const r = await purgeTenantFully(admin, tenantId);
  if (r.ok) await mailPeople(people, "rejected", { name: t?.name ?? "", date: "", del: "", contact: await vendorContact(admin) });
  return r;
}

// Daily: warnings before and after the license ends, and the final deletion.
export async function runLicenseCron(admin: Admin): Promise<{ warned: number; deleted: number; failed: string[] }> {
  const now = Date.now();
  const res = { warned: 0, deleted: 0, failed: [] as string[] };
  const contact = await vendorContact(admin);
  const { data: rows } = await admin.from("tenant_licenses").select("*").eq("exempt", false).in("state", ["trial", "active"]);
  for (const l of (rows ?? []) as Lic[]) {
    const exp = expiryOf(l);
    if (!exp || isNaN(exp.getTime())) continue;
    const E = exp.getTime();
    const { data: t } = await admin.from("tenants").select("name,is_demo").eq("id", l.tenant_id).maybeSingle();
    const name = t?.name ?? "";
    if (now > E + GRACE_DAYS * DAY) {
      const owners = await ownerPeople(admin);
      const r = await purgeTenantFully(admin, l.tenant_id);
      if (r.ok) {
        res.deleted++;
        for (const o of owners) await sendMail(o.email, `Company deleted: ${name}`, `The license of ${name} was not paid, so its data was deleted. A copy is kept for 30 days.`);
      } else res.failed.push(`${name}: ${r.message}`);
      continue;
    }
    const tag = ymd(exp);
    const steps: [Kind, number][] = [["t5", E - 5 * DAY], ["t1", E - DAY], ["f0", E], ["d5", E + 5 * DAY], ["d1", E + (GRACE_DAYS - 1) * DAY]];
    const sent = l.notified ?? {};
    const due = steps.filter(([k, at]) => now >= at && !sent[`${k}@${tag}`]);
    if (!due.length) continue;
    let last = due[due.length - 1][0];   // only the latest warning is mailed, the earlier ones are marked as done
    if (last === "f0" && l.state === "active") last = "payend";   // a paid period ended (not a trial)
    const n = await mailPeople(await companyAdmins(admin, l.tenant_id), last, { name, date: tag, del: ymd(new Date(E + GRACE_DAYS * DAY)), contact });
    res.warned += n;
    const mark = { ...sent };
    for (const [k] of due) mark[`${k}@${tag}`] = true;
    await admin.from("tenant_licenses").update({ notified: mark }).eq("tenant_id", l.tenant_id);
  }
  await admin.from("tenant_backups").delete().lt("expires_at", new Date().toISOString());
  return res;
}
