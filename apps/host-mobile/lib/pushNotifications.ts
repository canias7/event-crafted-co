// Push notification registration. Called once the user is signed in
// (see lib/auth.tsx). Requests permission, fetches the Expo push
// token, and upserts it into public.device_push_tokens so the
// server-side push sender knows where to deliver.
//
// Wrapped in tryRegisterPushToken so callers don't have to deal with
// permission / simulator / unsupported-device edge cases — every
// failure mode is silently swallowed (push is a best-effort layer
// on top of the in-app inbox).
//
// tryUnregisterPushToken is the sign-out counterpart: it removes the
// device_push_tokens row for the current device so push notifications
// for the just-signed-out account don't keep landing on this phone.

import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter, type Router } from "expo-router";
import { supabase } from "@/lib/supabase";

// Foreground behavior: show the banner + play sound even when the
// app is open. Without this the system suppresses the alert.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
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

// Parse the link string carried in a notification's data payload into a
// route inside this app. Push payloads come from the server-side
// notify_* triggers which use web-style links (e.g.
// "/customer/messages?thread=<uuid>" or "/vendor/inbox/<inquiry_id>").
// We map them to the matching mobile routes:
//   - any link containing /thread/<uuid> or ?thread=<uuid>  → /(host)/thread/<uuid>
//   - any /inquir(y|ies)/ link                              → /(host)/inbox
//   - everything else                                       → /(host)/inbox
function routeFromLink(link: string | null | undefined): string | null {
  if (!link) return "/(host)/inbox";
  let m = link.match(/\/thread\/([0-9a-f-]{36})/i);
  if (m) return `/(host)/thread/${m[1]}`;
  m = link.match(/[?&]thread=([0-9a-f-]{36})/i);
  if (m) return `/(host)/thread/${m[1]}`;
  if (/\/inquir(y|ies)\//i.test(link)) return "/(host)/inbox";
  return "/(host)/inbox";
}

function navigateFromNotification(router: Router, response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as {
    link?: string;
  } | null;
  const route = routeFromLink(data?.link ?? null);
  if (!route) return;
  router.push(route as never);
}

// Hook that wires up notification-tap → route navigation. Call it once
// after the user is signed in (e.g. from the (host) tab layout) so the
// router is mounted by the time a tap fires.
//
// Handles both:
//   1) Cold start — getLastNotificationResponseAsync() for taps that
//      launched the app from a killed state.
//   2) Warm taps — addNotificationResponseReceivedListener() for taps
//      that happened while the app was already running.
export function usePushNotificationTapHandler(): void {
  const router = useRouter();
  useEffect(() => {
    let handledColdStart = false;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (handledColdStart || !response) return;
      handledColdStart = true;
      navigateFromNotification(router, response);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => navigateFromNotification(router, response),
    );
    return () => sub.remove();
  }, [router]);
}

export async function tryUnregisterPushToken(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas
        ?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
    if (!projectId) return;
    let token: string | null = null;
    try {
      const r = await Notifications.getExpoPushTokenAsync({ projectId });
      token = r.data;
    } catch {
      // Permission revoked / simulator / unsupported — nothing to clean up.
      return;
    }
    if (!token) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("device_push_tokens")
      .delete()
      .eq("token", token)
      .eq("user_id", userId);
  } catch (err) {
    console.warn("push token cleanup failed", err);
  }
}
