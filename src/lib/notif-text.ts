// Notification texts (EN/RU/AZ). Pure module: safe for client components.
type L = "en" | "ru" | "az";
export type Notif = { id: string; kind: string; ticket_id: string | null; data: Record<string, unknown>; created_at: string; read_at: string | null };

const STATUS: Record<L, Record<string, string>> = {
  en: { diagnose: "Diagnose", ready: "Done", repair_not_possible: "Repair isn't possible", pickup_new_device: "Replaced new device" },
  ru: { diagnose: "Диагностика", ready: "Готово", repair_not_possible: "Ремонт невозможен", pickup_new_device: "Заменено на новое устройство" },
  az: { diagnose: "Diaqnostika", ready: "Tamamlandı", repair_not_possible: "Təmir mümkün deyil", pickup_new_device: "Yeni cihazla əvəz edildi" },
};
const T: Record<L, Record<string, string>> = {
  en: {
    title: "Notifications", empty: "No notifications.", markAll: "Mark all as read",
    ticket_new: "New ticket #{no}: {subject}", reset_new: "New password reset request #{no}", registration_new: "New customer registration: {name} {email}",
    customer_message: "New message from the customer in ticket #{no}", ticket_assigned: "Ticket #{no} was assigned to you",
    ticket_status: "Ticket #{no}: status is now “{status}”", ticket_message: "New message from the service team in ticket #{no}",
    ticket_fee: "Ticket #{no}: service fee {amount} {currency}", ticket_file: "New files in ticket #{no}", tutorial_new: "New tutorial", qc_recorded: "QC check: {serial} — {qcs}", qc_done: "Done", qc_broken: "Broken", qc_hardware_issue: "Hardware issue", login_new_device: "Security: your account was just used from a new device: {device} ({ip}). If this was not you, tell the administrator.", login_new_device_admin: "Security: {name} signed in from a new device: {device} ({ip})",
  },
  ru: {
    title: "Уведомления", empty: "Нет уведомлений.", markAll: "Отметить все как прочитанные",
    ticket_new: "Новая заявка №{no}: {subject}", reset_new: "Новый запрос на сброс пароля №{no}", registration_new: "Новая регистрация клиента: {name} {email}",
    customer_message: "Новое сообщение от клиента в заявке №{no}", ticket_assigned: "Заявка №{no} назначена вам",
    ticket_status: "Заявка №{no}: статус «{status}»", ticket_message: "Новое сообщение от сервисной команды в заявке №{no}",
    ticket_fee: "Заявка №{no}: стоимость услуги {amount} {currency}", ticket_file: "Новые файлы в заявке №{no}", tutorial_new: "Новое обучающее видео", qc_recorded: "Проверка QC: {serial} — {qcs}", qc_done: "Готово", qc_broken: "Неисправно", qc_hardware_issue: "Проблема с оборудованием", login_new_device: "Безопасность: в ваш аккаунт только что вошли с нового устройства: {device} ({ip}). Если это были не вы, сообщите администратору.", login_new_device_admin: "Безопасность: {name} вошёл(ла) с нового устройства: {device} ({ip})",
  },
  az: {
    title: "Bildirişlər", empty: "Bildiriş yoxdur.", markAll: "Hamısını oxunmuş et",
    ticket_new: "Yeni sorğu №{no}: {subject}", reset_new: "Yeni şifrə sıfırlama sorğusu №{no}", registration_new: "Yeni müştəri qeydiyyatı: {name} {email}",
    customer_message: "№{no} sorğuda müştəridən yeni mesaj", ticket_assigned: "№{no} sorğu sizə təyin edildi",
    ticket_status: "№{no} sorğu: status “{status}”", ticket_message: "№{no} sorğuda servis komandasından yeni mesaj",
    ticket_fee: "№{no} sorğu: xidmət haqqı {amount} {currency}", ticket_file: "№{no} sorğuda yeni fayllar", tutorial_new: "Yeni təlim videosu", qc_recorded: "QC yoxlaması: {serial} — {qcs}", qc_done: "Hazırdır", qc_broken: "Nasazdır", qc_hardware_issue: "Avadanlıq problemi", login_new_device: "Təhlükəsizlik: hesabınıza yeni cihazdan daxil olundu: {device} ({ip}). Bu siz deyildinizsə, administratora bildirin.", login_new_device_admin: "Təhlükəsizlik: {name} yeni cihazdan daxil oldu: {device} ({ip})",
  },
};

export function notifLabels(lang: string) { const l = (lang in T ? lang : "en") as L; return { title: T[l].title, empty: T[l].empty, markAll: T[l].markAll }; }

export function notifText(lang: string, n: Pick<Notif, "kind" | "data">): string {
  const l = (lang in T ? lang : "en") as L;
  const d = n.data ?? {};
  if (n.kind === "announcement" && d.tutorial_id) return [T[l].tutorial_new, d.body].filter((x) => typeof x === "string" && x).join(": ");
  if (n.kind === "announcement") return [d.title, d.body].filter((x) => typeof x === "string" && x).join(" — ");
  const tpl = T[l][n.kind] ?? n.kind;
  const status = typeof d.status === "string" ? STATUS[l][d.status] ?? d.status : "";
  const amount = typeof d.amount === "number" ? d.amount.toFixed(2) : String(d.amount ?? "");
  return tpl
    .replace("{no}", String(d.ticket_no ?? "")).replace("{subject}", String(d.subject ?? "")).replace("{status}", status)
    .replace("{device}", String(d.device ?? "")).replace("{ip}", String(d.ip ?? "")).replace("{amount}", amount).replace("{currency}", String(d.currency ?? "")).replace("{serial}", String(d.serial ?? "")).replace("{qcs}", T[l]["qc_" + String(d.qc_status ?? "")] ?? String(d.qc_status ?? "")).replace("{name}", String(d.name ?? "")).replace("{email}", String(d.email ?? ""))
    .trim();
}
export function tutorialTitle(lang: string): string { return T[(lang in T ? lang : "en") as L].tutorial_new; }
export function notifHref(n: Pick<Notif, "kind" | "ticket_id"> & { data?: Record<string, unknown> }): string {
  if (n.kind === "announcement" && typeof n.data?.link === "string" && /^(https?:\/\/|\/)/.test(n.data.link)) return n.data.link;
  if (n.kind === "announcement" && typeof n.data?.tutorial_id === "string" && /^[0-9a-f-]{36}$/i.test(n.data.tutorial_id)) return `/tutorials/${n.data.tutorial_id}`;
  if (n.kind === "qc_recorded" && typeof n.data?.qc_id === "string" && /^[0-9a-f-]{36}$/i.test(n.data.qc_id)) return `/qc/${n.data.qc_id}`;
  if (n.ticket_id) return `/tickets/${n.ticket_id}`;
  if (n.kind === "registration_new") return "/customers";
  return "/tickets";
}
