import { Linking } from "react-native";
import { router } from "expo-router";
import { sb, WEB_URL } from "@/lib/supabase";
import { unregisterPush } from "@/lib/push";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { useAppLock } from "@/lib/applock";
import { Btn, Card, Choice, H2, Screen, Txt } from "@/components/ui";
import type { Lang } from "@/lib/i18n";
import type { ThemeName } from "@/lib/theme";

export default function Settings() {
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const { profile } = useAuth();
  const { closeApp } = useAppLock();
  return (
    <Screen>
      <Card>
        <H2>{t("account")}</H2>
        <Txt>{`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "—"}</Txt>
        <Txt muted>{profile?.email ?? ""}</Txt>
      </Card>
      <Card>
        <H2>{t("language")}</H2>
        <Choice<Lang> value={lang} onChange={setLang} options={[{ value: "az", label: "Azərbaycan" }, { value: "ru", label: "Русский" }, { value: "en", label: "English" }]} />
      </Card>
      <Card>
        <H2>{t("theme")}</H2>
        <Choice<ThemeName> value={theme} onChange={setTheme} options={[{ value: "navy", label: t("themeNavy") }, { value: "dark", label: t("themeDark") }, { value: "light", label: t("themeLight") }]} />
      </Card>
      <Btn kind="ghost" title={t("openWeb")} onPress={() => Linking.openURL(WEB_URL)} />
      <Btn kind="danger" title={t("closeApp")} onPress={closeApp} />
      <Btn kind="ghost" title={t("signOutChange")} onPress={async () => { await unregisterPush(); await sb.auth.signOut(); router.replace("/login"); }} />
    </Screen>
  );
}
