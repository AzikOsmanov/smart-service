import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { sb } from "@/lib/supabase";
import { runSecurityCheck } from "@/lib/security";

export type Profile = { id: string; kind: "staff" | "customer"; tenant_id: string; company_id: string | null; registration: string | null; first_name: string | null; last_name: string | null; email: string | null };
type Auth = { ready: boolean; session: Session | null; profile: Profile | null; staff: boolean; isAdmin: boolean; reload: () => Promise<void>; secMsg: "" | "ip" | "expired"; clearSecMsg: () => void };
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [secMsg, setSecMsg] = useState<"" | "ip" | "expired">("");
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
    sb.auth.getSession().then(async ({ data }) => { setSession(data.session); await loadProfile(data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); loadProfile(s); });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Server-side login rules (network allow-list, session length, new-device alert): on sign-in and when the app returns to the foreground.
  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (!uid) return;
    const check = async () => {
      lastCheck.current = Date.now();
      const r = await runSecurityCheck();
      if (!r.ok) { setSecMsg(r.reason); await sb.auth.signOut(); }
    };
    check();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active" && Date.now() - lastCheck.current > 10 * 60 * 1000) check(); });
    return () => sub.remove();
  }, [uid]);

  const reload = useCallback(() => loadProfile(session), [loadProfile, session]);
  return <Ctx.Provider value={{ ready, session, profile, staff: profile?.kind === "staff", isAdmin, reload, secMsg, clearSecMsg: () => setSecMsg("") }}>{children}</Ctx.Provider>;
}
export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
