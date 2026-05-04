import { supabase } from "@/integrations/supabase/client";

// Web Push subscribe / unsubscribe helpers. The flow:
//   1. Browser must support service workers + the Push API + Notification API.
//   2. We need the VAPID public key (set via VITE_VAPID_PUBLIC_KEY) so the
//      push service can verify the message comes from us.
//   3. PushManager.subscribe returns endpoint + p256dh + auth keys, which
//      we POST to the push_subscriptions table.
//
// Triggers in supabase/migrations/20260503430000_push_subscriptions.sql
// fan out notifications.* INSERTs to send-push, which delivers to every
// row in this table.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

export type PushPermissionState = "unsupported" | NotificationPermission;

export function getPushPermissionState(): PushPermissionState {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (getPushPermissionState() === "unsupported") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

// Subscribe + persist server-side. Returns true on success.
export async function enablePush(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (getPushPermissionState() === "unsupported") {
    return { ok: false, reason: "Your browser doesn't support push notifications" };
  }
  if (!VAPID_PUBLIC_KEY) {
    return {
      ok: false,
      reason:
        "Push isn't configured yet — VITE_VAPID_PUBLIC_KEY is missing. Generate keys with `npx web-push generate-vapid-keys` and set VITE_VAPID_PUBLIC_KEY in the frontend env + VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in Supabase secrets.",
    };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Push permission denied" };
  }

  const reg =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.ready);
  if (!reg) {
    return { ok: false, reason: "Service worker not registered" };
  }

  let sub: PushSubscription | null = null;
  try {
    sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Subscribe failed",
    };
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint!;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) {
    return { ok: false, reason: "Push subscription is missing encryption keys" };
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return { ok: false, reason: "Sign in to enable push notifications" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
      { onConflict: "user_id,endpoint" },
    );
  if (error) return { ok: false, reason: error.message };

  return { ok: true };
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
  }
}

// VAPID keys come as URL-safe base64 strings; the PushManager wants a
// Uint8Array of the raw bytes.
function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
