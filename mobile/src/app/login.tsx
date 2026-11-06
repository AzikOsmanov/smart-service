import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { sb, WEB_URL } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { markFreshLogin, clearFreshLogin } from "@/lib/security";
import { usePrefs } from "@/lib/prefs";
import { Btn, Card, Choice, Err, Field, H1, Txt } from "@/components/ui";
import type { Lang } from "@/lib/i18n";

export default function Login() {
  const { session, secMsg, clearSecMsg } = useAuth();
  const { c, t, lang, setLang } = usePrefs();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (session) return <Redirect href="/tickets" />;

  async function signIn() {
    setBusy(true); setErr(""); clearSecMsg();
    markFreshLogin();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) clearFreshLogin();
    if (error) setErr(error.message.toLowerCase().includes("invalid") ? t("badLogin") : error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: 20, gap: 16 }}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ color: c.accent, fontSize: 30, fontWeight: "800" }}>Smart Service</Text>
        </View>
        <Card>
          <H1>{t("signIn")}</H1>
          <Field label={t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
          <Field label={t("password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={signIn} />
          <Err>{err || (secMsg === "ip" ? t("secIp") : secMsg === "expired" ? t("secExpired") : secMsg === "idle" ? t("secIdle") : "")}</Err>
          <Btn title={busy ? t("signingIn") : t("signIn")} onPress={signIn} busy={busy} disabled={!email || !password} />
          <Pressable onPress={() => Linking.openURL(`${WEB_URL}/register`)}><Txt color={c.accent}>{t("register")}</Txt></Pressable>
          <Pressable onPress={() => Linking.openURL(`${WEB_URL}/forgot`)}><Txt color={c.accent}>{t("forgot")}</Txt></Pressable>
        </Card>
        <Choice<Lang> value={lang} onChange={setLang} options={[{ value: "az", label: "AZ" }, { value: "ru", label: "RU" }, { value: "en", label: "EN" }]} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
