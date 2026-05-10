// Push notification registration. Called once the user is signed in
// (see lib/auth.tsx). Requests permission, fetches the Expo push
// token, and upserts it into public.device_push_tokens so the
// server-side push sender knows where to deliver.
//
// Wrapped in tryRegisterPushToken so callers don't have to deal with
// permission / simulator / unsupported-device edge cases — every
// failure mode is silently swallowed (push is a best-effort layer
// on top of the in-app inbox).

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";

// Foreground behavior: show the banner + play sound even when the
// app is open. Without this the system suppresses the alert.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function tryRegisterPushToken(
  userId: string,
  app: "vendor" | "host",
): Promise<void> {
  try {
    if (!Device.isDevice) return; // Push tokens don't work in simulators.

    // Android: ensure the default notification channel exists.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return; // User declined.

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas
        ?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
    if (!projectId) return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenResponse.data;
    if (!token) return;

    const platform: "ios" | "android" | "web" =
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
          ? "android"
          : "web";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("device_push_tokens")
      .upsert(
        {
          token,
          user_id: userId,
          platform,
          app,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );
  } catch (err) {
    // Push is a best-effort layer — never crash the app over it.
    console.warn("push token registration failed", err);
  }
}
