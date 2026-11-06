import { useEffect } from "react";
import { Linking, Platform } from "react-native";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { registerPush } from "@/lib/push";
import { useAuth } from "@/lib/auth";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { AuthProvider } from "@/lib/auth";

// Opens the ticket (or the announcement link) when a push notification is tapped.
function openFromPush(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (typeof data.tutorial_id === "string" && data.tutorial_id) router.push(`/tutorials/${data.tutorial_id}`);
  else if (typeof data.qc_id === "string" && data.qc_id) router.push(`/qc/${data.qc_id}`);
  else if (typeof data.ticket_id === "string" && data.ticket_id) router.push(`/tickets/${data.ticket_id}`);
  else if (typeof data.link === "string" && /^https?:\/\//.test(data.link)) Linking.openURL(data.link);
  else router.push("/notifications");
}

function PushSetup() {
  const { session } = useAuth();
  const { lang } = usePrefs();
  useEffect(() => { if (session) registerPush(lang); }, [session?.user.id, lang]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.getLastNotificationResponseAsync().then((r) => { if (r) openFromPush(r.notification.request.content.data as Record<string, unknown>); }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openFromPush(r.notification.request.content.data as Record<string, unknown>));
    return () => sub.remove();
  }, []);
  return null;
}

function Nav() {
  const { c, t, theme } = usePrefs();
  return (
    <>
      <StatusBar style={theme === "light" ? "dark" : "light"} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.card }, headerTintColor: c.fg, contentStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.fg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="tickets/index" options={{ title: t("tickets") }} />
        <Stack.Screen name="tickets/new" options={{ title: t("newTicket") }} />
        <Stack.Screen name="tickets/[id]" options={{ title: "" }} />
        <Stack.Screen name="tickets/board" options={{ title: t("board") }} />
        <Stack.Screen name="tickets/password-reset" options={{ title: t("prButton") }} />
        <Stack.Screen name="tutorials/index" options={{ title: t("tutorials") }} />
        <Stack.Screen name="tutorials/[id]" options={{ title: "" }} />
        <Stack.Screen name="dashboard" options={{ title: t("dashboard") }} />
        <Stack.Screen name="materials/index" options={{ title: t("materials") }} />
        <Stack.Screen name="materials/[id]" options={{ title: "" }} />
        <Stack.Screen name="qc/index" options={{ title: t("qcTitle") }} />
        <Stack.Screen name="qc/new" options={{ title: t("newQc") }} />
        <Stack.Screen name="qc/[id]" options={{ title: "" }} />
        <Stack.Screen name="scan" options={{ title: t("scanTitle"), presentation: "modal" }} />
        <Stack.Screen name="notifications" options={{ title: t("notifications") }} />
        <Stack.Screen name="settings" options={{ title: t("settings") }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <AuthProvider>
          <PushSetup />
          <Nav />
        </AuthProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
