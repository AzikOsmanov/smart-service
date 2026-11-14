import { useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { sb, WEB_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { markFreshLogin, clearFreshLogin } from "@/lib/security";
import { usePrefs } from "@/lib/prefs";
import { Btn, Card, Choice, Err, Field, H1, Txt } from "@/components/ui";
import type { Lang } from "@/lib/i18n";

export default function Login() {
  const { session, mfaNeeded, secMsg, clearSecMsg } = useAuth();
  const { c, t, lang, setLang } = usePrefs();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  if (session && !mfaNeeded) return <Redirect href="/tickets" />;

  async function signIn() {
    setBusy(true); setErr(""); clearSecMsg();
    markFreshLogin();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) clearFreshLogin();
    if (error) setErr(error.message.toLowerCase().includes("invalid") ? t("badLogin") : error.message);
  }

  async function confirmCode() {
    setBusy(true); setErr("");
    const { data: f } = await sb.auth.mfa.listFactors();
    const factor = f?.totp?.[0];
    if (!factor) { setBusy(false); return; }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) setErr(t("mfaBad")); else setCode("");
  }
  async function cancelCode() { setCode(""); setErr(""); clearFreshLogin(); await sb.auth.signOut(); }

  if (session && mfaNeeded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: 20, gap: 16 }}>
          <Card>
            <H1>{t("mfaTitle")}</H1>
            <Txt>{t("mfaPrompt")}</Txt>
            <Field label={t("mfaCode")} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={7} onSubmitEditing={confirmCode} />
            <Err>{err}</Err>
            <Btn title={t("mfaConfirm")} onPress={confirmCode} busy={busy} disabled={code.replace(/\s/g, "").length < 6} />
            <Pressable onPress={cancelCode}><Txt color={c.accent}>{t("mfaCancel")}</Txt></Pressable>
          </Card>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: 20, gap: 16 }}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Image source={require("../../assets/logo.png")} style={{ width: 84, height: 84, marginBottom: 10 }} />
          <Text style={{ color: c.accent, fontSize: 30, fontWeight: "800" }}>Smart Service</Text>
        </View>
        <Card>
          <H1>{t("signIn")}</H1>
          <Field label={t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
          <Field label={t("password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={signIn} />
          <Err>{err || (secMsg === "ip" ? t("secIp") : secMsg === "expired" ? t("secExpired") : secMsg === "idle" ? t("secIdle") : secMsg === "mfa_setup" ? t("secMfaSetup") : "")}</Err>
          <Btn title={busy ? t("signingIn") : t("signIn")} onPress={signIn} busy={busy} disabled={!email || !password} />
          <Pressable onPress={() => Linking.openURL(`${WEB_URL}/register`)}><Txt color={c.accent}>{t("register")}</Txt></Pressable>
          <Pressable onPress={() => Linking.openURL(`${WEB_URL}/forgot`)}><Txt color={c.accent}>{t("forgot")}</Txt></Pressable>
        </Card>
        <Choice<Lang> value={lang} onChange={setLang} options={[{ value: "az", label: "AZ" }, { value: "ru", label: "RU" }, { value: "en", label: "EN" }]} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
