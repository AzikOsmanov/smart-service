import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { AuthProvider } from "@/lib/auth";

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
          <Nav />
        </AuthProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
