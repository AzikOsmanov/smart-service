import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { sb } from "@/lib/supabase";

// Show pushes as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

let current: string | null = null;

// Asks for permission, gets this phone's Expo push token and saves it for the signed-in user.
export async function registerPush(lang: string): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Smart Service", importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await sb.rpc("register_push_token", { p_token: token, p_platform: Platform.OS, p_lang: lang });
    current = token;
    return token;
  } catch {
    return null;   // no push on this device (no permission, no network, or push not configured yet)
  }
}

// On sign-out: this phone stops receiving the user's pushes.
export async function unregisterPush(): Promise<void> {
  if (!current) return;
  try { await sb.from("push_tokens").delete().eq("token", current); } catch { /* ignore */ }
  current = null;
}

export async function setBadge(n: number) {
  if (Platform.OS === "web") return;
  try { await Notifications.setBadgeCountAsync(n); } catch { /* ignore */ }
}
