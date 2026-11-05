import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

// Public values (same as the website's browser client). Data access is protected by row-level security.
export const SUPABASE_URL = "https://ihzmgayisuovnmxrftop.supabase.co";
export const WEB_URL = "https://service.infraneuro.com";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imloem1nYXlpc3Vvdm5teHJmdG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTc4MTEsImV4cCI6MjEwOTE3MzgxMX0.ygw-NPQW5zrxjZz3ThpUfcpAdKLwl10NWl623UQdmRI";

export const sb = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Refresh the session only while the app is in the foreground.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (s) => { if (s === "active") sb.auth.startAutoRefresh(); else sb.auth.stopAutoRefresh(); });
}

// Work that needs the server (1C / IEP queue, device lookup): the website does it for the signed-in user.
export async function serverAfter(ticketId: string, action: "apply" | "status" | "lookup" | "fee"): Promise<{ lookup?: string; detail?: string } | null> {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const r = await fetch(`${WEB_URL}/api/mobile/after`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ticket_id: ticketId, action }),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
