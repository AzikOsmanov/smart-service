import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, BackHandler, Platform, StyleSheet, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { sb } from "@/lib/supabase";
import { unregisterPush } from "@/lib/push";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { hashPin } from "@/lib/sha256";
import { getIdleMinutes } from "@/lib/security";
import { Btn, Card, Err, Field, H1, Txt } from "@/components/ui";

// App lock: the phone's own screen lock (fingerprint / face / pattern / PIN) opens the app. A phone with no screen lock gets an app PIN instead.
// The account password is only asked on the first sign-in on a phone, after "sign out", after 5 wrong PINs, or when the server ends the session.
const LOCK_AFTER_MS = 2 * 60 * 1000;
const MAX_TRIES = 5;

async function get(k: string): Promise<string | null> { try { return await SecureStore.getItemAsync(k); } catch { return null; } }
async function set(k: string, v: string) { try { await SecureStore.setItemAsync(k, v); } catch { /* not available */ } }
async function del(k: string) { try { await SecureStore.deleteItemAsync(k); } catch { /* not available */ } }
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

type Ctx = { closeApp: () => void };
const LockCtx = createContext<Ctx>({ closeApp: () => {} });
export const useAppLock = () => useContext(LockCtx);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { ready, session, endSession } = useAuth();
  const { c, t } = usePrefs();
  const uid = session?.user.id ?? null;
  const native = Platform.OS !== "web";
  const [locked, setLocked] = useState(true);
  const [deviceSecure, setDeviceSecure] = useState<boolean | null>(null);   // null = still checking
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");
  const bgAt = useRef(0);
  const authBusy = useRef(false);
  const prompted = useRef(false);
  const started = useRef(false);
  const lastTouch = useRef(Date.now());
  const idling = useRef(false);

  // Inactivity sign-out (set by the administrator): too long without touching the app, or too long in the background, ends the sign-in.
  const idleOut = useCallback(async () => {
    if (idling.current) return;
    idling.current = true;
    const id = session?.user.id;
    await unregisterPush().catch(() => {});
    if (id) { await del("ss_pin_" + id); await del("ss_pin_tries_" + id); }
    await endSession("idle");
    setLocked(true); setHasPin(null);
    router.replace("/login");
    setTimeout(() => { idling.current = false; }, 1500);
  }, [session, endSession]);

  const checkSecure = useCallback(async () => {
    try { setDeviceSecure((await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE); }
    catch { setDeviceSecure(false); }
  }, []);
  useEffect(() => { if (native) checkSecure(); }, [native, checkSecure]);
  useEffect(() => { if (uid && native) get("ss_pin_" + uid).then((v) => setHasPin(!!v)); else setHasPin(null); }, [uid, native]);

  // Cold start with a saved sign-in = locked. A sign-in done by typing the password in this run = already unlocked.
  useEffect(() => {
    if (!ready) return;
    if (!started.current) { started.current = true; setLocked(!!uid); return; }
    if (uid) setLocked(false);
  }, [ready, uid]);

  // Back from the background after more than 2 minutes: lock again.
  useEffect(() => {
    if (!native) return;
    const sub = AppState.addEventListener("change", (st) => {
      if (authBusy.current) return;
      if (st === "background") bgAt.current = Date.now();
      else if (st === "active") {
        const im = getIdleMinutes();
        if (bgAt.current && im > 0 && Date.now() - bgAt.current > im * 60000) { bgAt.current = 0; idleOut(); return; }
        lastTouch.current = Date.now();
        if (bgAt.current && Date.now() - bgAt.current > LOCK_AFTER_MS) { prompted.current = false; setLocked(true); }
        bgAt.current = 0; checkSecure();
      }
    });
    return () => sub.remove();
  }, [native, checkSecure, idleOut]);

  useEffect(() => {
    if (!native || !uid) return;
    lastTouch.current = Date.now();
    const iv = setInterval(() => {
      const im = getIdleMinutes();
      if (im > 0 && AppState.currentState === "active" && Date.now() - lastTouch.current > im * 60000) idleOut();
    }, 15000);
    return () => clearInterval(iv);
  }, [native, uid, idleOut]);

  const askDevice = useCallback(async () => {
    authBusy.current = true;
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: t("unlockPrompt"), cancelLabel: t("cancel"), disableDeviceFallback: false });
      if (r.success) { setLocked(false); setErr(""); }
    } catch { /* cancelled */ }
    finally { setTimeout(() => { authBusy.current = false; }, 800); }
  }, [t]);

  const active = native && !!uid && ready;
  const mode: "device" | "pin" | "newpin" | null = !active || deviceSecure === null || hasPin === null ? null : deviceSecure ? "device" : hasPin ? "pin" : "newpin";
  const visible = mode !== null && (mode === "newpin" || locked);

  useEffect(() => {
    if (visible && mode === "device" && !prompted.current) { prompted.current = true; askDevice(); }
    if (!visible) prompted.current = false;
  }, [visible, mode, askDevice]);

  async function savePin() {
    if (!/^\d{4,6}$/.test(pin)) { setErr(t("pinTooShort")); return; }
    if (pin !== pin2) { setErr(t("pinMismatch")); return; }
    const salt = rnd();
    await set("ss_pin_" + uid, salt + ":" + hashPin(pin, salt));
    await del("ss_pin_tries_" + uid);
    setHasPin(true); setLocked(false); setPin(""); setPin2(""); setErr("");
  }
  async function checkPin() {
    const stored = (await get("ss_pin_" + uid)) ?? "";
    const [salt, h] = stored.split(":");
    if (salt && h && hashPin(pin, salt) === h) { await del("ss_pin_tries_" + uid); setLocked(false); setPin(""); setErr(""); return; }
    const tries = Number((await get("ss_pin_tries_" + uid)) ?? "0") + 1;
    setPin("");
    if (tries >= MAX_TRIES) { await passwordInstead(); return; }
    await set("ss_pin_tries_" + uid, String(tries));
    setErr(t("pinWrong", { n: MAX_TRIES - tries }));
  }
  async function passwordInstead() {
    const id = uid;
    await unregisterPush().catch(() => {});
    if (id) { await del("ss_pin_" + id); await del("ss_pin_tries_" + id); }
    setHasPin(null); setPin(""); setPin2(""); setErr("");
    await sb.auth.signOut({ scope: "local" });
    router.replace("/login");
  }

  const closeApp = useCallback(() => {
    setLocked(true);
    if (Platform.OS === "android") BackHandler.exitApp();   // iPhone does not allow an app to close itself: it locks instead
  }, []);

  return (
    <LockCtx.Provider value={{ closeApp }}>
      <View style={{ flex: 1 }} onTouchStartCapture={() => { lastTouch.current = Date.now(); }}>{children}</View>
      {visible && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, zIndex: 1000, elevation: 1000 }]}>
          <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 20, gap: 16 }}>
            <Txt bold color={c.accent}>Smart Service</Txt>
            <Card>
              {mode === "device" && (<>
                <H1>{t("lockTitle")}</H1>
                <Btn title={t("unlock")} onPress={askDevice} />
              </>)}
              {mode === "pin" && (<>
                <H1>{t("lockTitle")}</H1>
                <Field label={t("pinEnter")} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} onSubmitEditing={checkPin} autoFocus />
                <Err>{err}</Err>
                <Btn title={t("unlock")} onPress={checkPin} disabled={pin.length < 4} />
              </>)}
              {mode === "newpin" && (<>
                <H1>{t("pinCreate")}</H1>
                <Txt muted small>{t("pinNoDeviceLock")}</Txt>
                <Field label={t("pinNew")} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} />
                <Field label={t("pinRepeat")} value={pin2} onChangeText={(v) => setPin2(v.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} onSubmitEditing={savePin} />
                <Err>{err}</Err>
                <Btn title={t("pinSave")} onPress={savePin} disabled={pin.length < 4 || pin2.length < 4} />
              </>)}
              <Btn kind="ghost" title={t("passwordInstead")} onPress={passwordInstead} />
            </Card>
          </SafeAreaView>
        </View>
      )}
    </LockCtx.Provider>
  );
}
