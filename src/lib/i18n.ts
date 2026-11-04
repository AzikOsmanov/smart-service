import { cookies } from "next/headers";

export const LANGS = ["en", "ru", "az"] as const;
export type Lang = (typeof LANGS)[number];

const dict = {
  en: {
    tickets: "Tickets", customers: "Customers", staffUsers: "Staff users", roles: "Roles", settings: "Settings", trash: "Trash", qc: "Quality Control", claims: "Ownership requests", devices: "Devices", newTicket: "New ticket",
    st_diagnose: "Diagnose", st_ready: "Ready", st_repair_not_possible: "Repair is not possible", st_pickup_new_device: "Pickup new device", st_received: "Received",
    chat: "Messages", chatPlaceholder: "Write a message…", send: "Send", internalNote: "Internal note (staff only)", fromCustomer: "Customer", fromStaff: "Service team", you: "You", noMessages: "No messages yet.", account: "Account",
    signOut: "Sign out", signIn: "Sign in", register: "Register", email: "Email", password: "Password",
    noAccount: "No account?", backToSignIn: "Back to sign in", createAccount: "Create account",
    iAm: "I am a", reseller: "Reseller", installer: "Installer", company: "Company",
    firstName: "First name", lastName: "Last name", phone: "Phone", companyName: "Company name", city: "City",
    no: "No", subject: "Subject", status: "Status", priority: "Priority", created: "Created", noTickets: "No tickets yet.",
    waitingTitle: "Waiting for approval", theme: "Theme", light: "Light", dark: "Dark", system: "System", language: "Language",
    name: "Name", contact: "Contact", companyCity: "Company / city", approve: "Approve", reject: "Reject", note: "Note",
    role: "Role", lastLogin: "Last login", never: "never", deactivate: "Deactivate", activate: "Activate",
    brandName: "Company name shown in the top bar", save: "Save", changePassword: "Change password", newPassword: "New password",
  },
  ru: {
    tickets: "Заявки", customers: "Клиенты", staffUsers: "Сотрудники", roles: "Роли", settings: "Настройки", trash: "Корзина", qc: "Контроль качества", claims: "Запросы на владение", devices: "Устройства", newTicket: "Новая заявка",
    st_diagnose: "Диагностика", st_ready: "Готово", st_repair_not_possible: "Ремонт невозможен", st_pickup_new_device: "Заберите новое устройство", st_received: "Принято",
    chat: "Сообщения", chatPlaceholder: "Напишите сообщение…", send: "Отправить", internalNote: "Внутренняя заметка (только сотрудники)", fromCustomer: "Клиент", fromStaff: "Сервисная служба", you: "Вы", noMessages: "Сообщений пока нет.", account: "Аккаунт",
    signOut: "Выйти", signIn: "Войти", register: "Регистрация", email: "Эл. почта", password: "Пароль",
    noAccount: "Нет аккаунта?", backToSignIn: "Назад ко входу", createAccount: "Создать аккаунт",
    iAm: "Я", reseller: "Реселлер", installer: "Установщик", company: "Компания",
    firstName: "Имя", lastName: "Фамилия", phone: "Телефон", companyName: "Название компании", city: "Город",
    no: "№", subject: "Тема", status: "Статус", priority: "Приоритет", created: "Создана", noTickets: "Заявок пока нет.",
    waitingTitle: "Ожидает подтверждения", theme: "Тема", light: "Светлая", dark: "Тёмная", system: "Системная", language: "Язык",
    name: "Имя", contact: "Контакты", companyCity: "Компания / город", approve: "Одобрить", reject: "Отклонить", note: "Заметка",
    role: "Роль", lastLogin: "Последний вход", never: "никогда", deactivate: "Отключить", activate: "Включить",
    brandName: "Название компании в верхней панели", save: "Сохранить", changePassword: "Сменить пароль", newPassword: "Новый пароль",
  },
  az: {
    tickets: "Sorğular", customers: "Müştərilər", staffUsers: "İşçilər", roles: "Rollar", settings: "Ayarlar", trash: "Zibil qutusu", qc: "Keyfiyyət nəzarəti", claims: "Sahiblik sorğuları", devices: "Cihazlar", newTicket: "Yeni sorğu",
    st_diagnose: "Diaqnostika", st_ready: "Hazırdır", st_repair_not_possible: "Təmir mümkün deyil", st_pickup_new_device: "Yeni cihazı götürün", st_received: "Qəbul edildi",
    chat: "Mesajlar", chatPlaceholder: "Mesaj yazın…", send: "Göndər", internalNote: "Daxili qeyd (yalnız işçilər)", fromCustomer: "Müştəri", fromStaff: "Servis komandası", you: "Siz", noMessages: "Hələ mesaj yoxdur.", account: "Hesab",
    signOut: "Çıxış", signIn: "Daxil ol", register: "Qeydiyyat", email: "E-poçt", password: "Şifrə",
    noAccount: "Hesabınız yoxdur?", backToSignIn: "Girişə qayıt", createAccount: "Hesab yarat",
    iAm: "Mən", reseller: "Reseller", installer: "Quraşdırıcı", company: "Şirkət",
    firstName: "Ad", lastName: "Soyad", phone: "Telefon", companyName: "Şirkətin adı", city: "Şəhər",
    no: "№", subject: "Mövzu", status: "Status", priority: "Prioritet", created: "Yaradılıb", noTickets: "Hələ sorğu yoxdur.",
    waitingTitle: "Təsdiq gözlənilir", theme: "Mövzu", light: "Açıq", dark: "Tünd", system: "Sistem", language: "Dil",
    name: "Ad", contact: "Əlaqə", companyCity: "Şirkət / şəhər", approve: "Təsdiqlə", reject: "Rədd et", note: "Qeyd",
    role: "Rol", lastLogin: "Son giriş", never: "heç vaxt", deactivate: "Deaktiv et", activate: "Aktiv et",
    brandName: "Üst paneldə göstərilən şirkət adı", save: "Yadda saxla", changePassword: "Şifrəni dəyiş", newPassword: "Yeni şifrə",
  },
} as const;

export type Key = keyof (typeof dict)["en"];

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return (LANGS as readonly string[]).includes(v ?? "") ? (v as Lang) : "en";
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: (k: Key) => dict[lang][k] ?? dict.en[k] };
}
