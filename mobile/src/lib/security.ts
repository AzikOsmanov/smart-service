import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import { sb, WEB_URL } from "@/lib/supabase";

// Login security on the phone: the server decides (network allow-list, new-device alert, session length).
let fresh = false;
let loginAt = 0;

const rand = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => { const r = (Math.random() * 16) | 0; return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16); });
async function get(k: string): Promise<string | null> { try { return Platform.OS === "web" ? null : await SecureStore.getItemAsync(k); } catch { return null; } }
async function set(k: string, v: string) { try { if (Platform.OS !== "web") await SecureStore.setItemAsync(k, v); } catch { /* storage not available */ } }

async function deviceId(): Promise<string> {
  let id = await get("ss_device_id");
  if (!id) { id = rand(); await set("ss_device_id", id); }
  return id;
}

// Call right before signing in, so the check that follows knows this is a new sign-in.
export function markFreshLogin() { fresh = true; loginAt = Date.now(); }
export function clearFreshLogin() { fresh = false; loginAt = 0; }

// Inactivity limit (minutes, 0 = off) from the last server check; the app lock reads it.
let idleMinutes = 0;
export const getIdleMinutes = () => idleMinutes;

export type Check = { ok: true } | { ok: false; reason: "ip" | "expired" };

export async function runSecurityCheck(): Promise<Check> {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: true };
  const first = fresh;
  if (first) { await set("ss_login_at", String(loginAt || Date.now())); fresh = false; }
  try {
    const r = await fetch(`${WEB_URL}/api/mobile/session-check`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ device_id: await deviceId(), device_name: [Device.brand, Device.modelName].filter(Boolean).join(" ") || "Mobile app", first }),
    });
    if (!r.ok) return { ok: true };   // no connection to the server must not lock people out
    const j = await r.json();
    if (j.ok === false) return { ok: false, reason: "ip" };
    idleMinutes = Math.max(0, Number(j.idle_minutes ?? 0)) || 0;
    const hours = Number(j.session_hours ?? 0);
    if (hours > 0) {
      let at = Number(await get("ss_login_at"));
      if (!at) { at = Date.now(); await set("ss_login_at", String(at)); }
      if (Date.now() - at > hours * 3600 * 1000) return { ok: false, reason: "expired" };
    }
  } catch { /* offline: keep working */ }
  return { ok: true };
}
