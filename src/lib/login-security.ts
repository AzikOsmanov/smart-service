import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LoginPolicy = { max_failed_attempts: number; lockout_minutes: number };
const DEFAULTS: LoginPolicy = { max_failed_attempts: 5, lockout_minutes: 15 };

export async function getLoginPolicy(tenantId: string): Promise<LoginPolicy> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("tenant_id", tenantId).eq("key", "login_security").maybeSingle();
  const v = (data?.value ?? {}) as Partial<LoginPolicy>;
  return {
    max_failed_attempts: Number.isFinite(v.max_failed_attempts) ? Math.max(1, Number(v.max_failed_attempts)) : DEFAULTS.max_failed_attempts,
    lockout_minutes: Number.isFinite(v.lockout_minutes) ? Math.max(1, Number(v.lockout_minutes)) : DEFAULTS.lockout_minutes,
  };
}

export async function clientInfo() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for") ?? "";
  const ip = (fwd.split(",")[0] || h.get("x-real-ip") || "").trim() || null;
  return { ip, ua: (h.get("user-agent") ?? "").slice(0, 300) || null };
}

type Ev = "login_success" | "login_failed" | "account_locked" | "account_unlocked";
export async function logLoginEvent(o: { tenantId: string; userId?: string | null; email: string; event: Ev; reason?: string | null }) {
  const { ip, ua } = await clientInfo();
  await supabaseAdmin().from("login_events").insert({
    tenant_id: o.tenantId, user_id: o.userId ?? null, email_attempted: o.email, event: o.event,
    client: "web", ip_address: ip, user_agent: ua, failure_reason: o.reason ?? null,
  });
}
