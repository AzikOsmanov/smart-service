import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { sb } from "@/lib/supabase";
import { runSecurityCheck } from "@/lib/security";

export type Profile = { id: string; kind: "staff" | "customer"; tenant_id: string; company_id: string | null; registration: string | null; first_name: string | null; last_name: string | null; email: string | null };
type Auth = { ready: boolean; session: Session | null; profile: Profile | null; staff: boolean; isAdmin: boolean; reload: () => Promise<void>; mfaNeeded: boolean; secMsg: "" | "ip" | "expired" | "idle" | "mfa_setup"; clearSecMsg: () => void; endSession: (reason: "idle") => Promise<void> };
const Ctx = createContext<Auth | null>(null);

// Two-step login: the person has an authenticator code set up but this session has not passed the code check yet (assurance level aal1).
function needsCode(s: Session | null): boolean {
  if (!s) return false;
  const has = (s.user.factors ?? []).some((f) => f.status === "verified" && f.factor_type === "totp");
  if (!has) return false;
  try {
    const b = s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? atob(b + "=".repeat((4 - (b.length % 4)) % 4)) : "{}";
    return (JSON.parse(json).aal ?? "aal1") !== "aal2";
  } catch { return true; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [secMsg, setSecMsg] = useState<"" | "ip" | "expired" | "idle" | "mfa_setup">("");
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const lastCheck = useRef(0);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setIsAdmin(false); return; }
    const [{ data }, { data: adm }] = await Promise.all([
      sb.from("users").select("id,kind,tenant_id,company_id,registration,first_name,last_name,email").eq("id", s.user.id).maybeSingle(),
      sb.rpc("is_tenant_admin"),
    ]);
    setProfile((data as Profile) ?? null);
    setIsAdmin(adm === true);
  }, []);

  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => { setMfaNeeded(needsCode(data.session)); setSession(data.session); await loadProfile(data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { setMfaNeeded(needsCode(s)); setSession(s); loadProfile(s); });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Server-side login rules (network allow-list, session length, new-device alert): on sign-in and when the app returns to the foreground.
  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (!uid || mfaNeeded) return;
    const check = async () => {
      lastCheck.current = Date.now();
      const r = await runSecurityCheck();
      if (!r.ok) { setSecMsg(r.reason); await sb.auth.signOut(); }
    };
    check();
    // "Online" status: the phone reports presence every minute while the app is open.
    const ping = () => { if (AppState.currentState === "active") sb.rpc("touch_presence", { p_client: "mobile" }).then(() => {}, () => {}); };
    ping();
    const timer = setInterval(ping, 60000);
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") { ping(); if (Date.now() - lastCheck.current > 10 * 60 * 1000) check(); } });
    return () => { sub.remove(); clearInterval(timer); };
  }, [uid, mfaNeeded]);

  const endSession = useCallback(async (reason: "idle") => { setSecMsg(reason); await sb.auth.signOut({ scope: "local" }); }, []);
  const reload = useCallback(() => loadProfile(session), [loadProfile, session]);
  return <Ctx.Provider value={{ ready, session, mfaNeeded, profile, staff: profile?.kind === "staff", isAdmin, reload, secMsg, clearSecMsg: () => setSecMsg(""), endSession }}>{children}</Ctx.Provider>;
}
export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
