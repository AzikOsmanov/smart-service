import "server-only";

// Transactional email through Resend. Needs RESEND_API_KEY and MAIL_FROM (e.g. "Smart Service <no-reply@infraneuro.com>") in the environment.
// Without them nothing is sent and the caller carries on (the in-app banners still show).
export function mailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
}

export async function sendMail(to: string | string[], subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!key || !from || !list.length) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: list, subject, text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
