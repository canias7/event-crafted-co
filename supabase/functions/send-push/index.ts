// send-push: POST { user_id, title, body, link, tag } and we deliver
// the notification to every mobile device registered for that user.
//
// Fired automatically by the fanout_notification_to_push() trigger on
// every insert into public.notifications.
//
// Web push (VAPID) used to be delivered here too, but the web app was
// mirrored to mobile and the subscription UI was removed — so we only
// fan out to Expo now. push_subscriptions table is dropped.
//
// Required env (Supabase project secrets):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// Tokens come from public.device_push_tokens, populated by the
// vendor-mobile / host-mobile apps after sign-in.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  user_id: string;
  title: string;
  body?: string | null;
  link?: string | null;
  tag?: string | null;
  notification_id?: string | null;
}

type PushEventStatus =
  | "sent"
  | "failed"
  | "invalid_token"
  | "rate_limited"
  | "unknown";

interface PushEventRow {
  notification_id: string | null;
  user_id: string;
  token_preview: string;
  token_kind: "expo";
  status: PushEventStatus;
  expo_ticket_id?: string | null;
  error?: string | null;
}

async function logEvents(sb: any, rows: PushEventRow[]) {
  if (rows.length === 0) return;
  try {
    await sb.from("push_events").insert(rows);
  } catch {
    // swallow — delivery must not break on logging errors
  }
}

function previewToken(t: string): string {
  if (!t) return "";
  return t.length > 12 ? "…" + t.slice(-8) : t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not configured" }, 500);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!payload.user_id || !payload.title) {
    return json({ error: "user_id + title required" }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const result = await deliverMobile(sb, payload);
  return json({ mobile: result }, 200);
});

async function deliverMobile(sb: any, payload: Payload) {
  const { data: tokens, error } = await sb
    .from("device_push_tokens")
    .select("token")
    .eq("user_id", payload.user_id);
  if (error) return { error: error.message };
  if (!tokens || tokens.length === 0) return { delivered: 0 };

  // Expo accepts batches of up to 100 messages per request.
  // priority "high" tells APNs/FCM to deliver immediately even when the
  // device is in Low Power Mode / Doze.
  //
  // channelId targets the "vendora-alerts" Android channel, created at
  // MAX importance by the apps — that's what makes the notification
  // pop over the screen (heads-up) instead of landing silently in the
  // tray. The old "default" channel may be frozen at a lower importance
  // on devices that created it before the MAX setting existed (Android
  // never upgrades a channel after creation). Devices that haven't
  // created the new channel yet fall back to expo-notifications'
  // fallback channel, so nothing is dropped.
  const messages = tokens.map((t: any) => ({
    to: t.token,
    sound: "default",
    priority: "high",
    title: payload.title,
    body: payload.body ?? "",
    channelId: "vendora-alerts",
    data: {
      link: payload.link ?? null,
      tag: payload.tag ?? null,
    },
  }));

  let delivered = 0;
  const dead: string[] = [];
  const events: PushEventRow[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });
      const isRate = res.status === 429;
      const json = await res.json().catch(() => null);
      const tickets: any[] = json?.data ?? [];
      if (tickets.length === 0) {
        chunk.forEach((m: any) => {
          events.push({
            notification_id: payload.notification_id ?? null,
            user_id: payload.user_id,
            token_preview: previewToken(m.to),
            token_kind: "expo",
            status: isRate ? "rate_limited" : "unknown",
            error: typeof json === "object" ? JSON.stringify(json) : null,
          });
        });
        continue;
      }
      tickets.forEach((ticket, idx) => {
        const to = chunk[idx].to as string;
        if (ticket?.status === "ok") {
          delivered++;
          events.push({
            notification_id: payload.notification_id ?? null,
            user_id: payload.user_id,
            token_preview: previewToken(to),
            token_kind: "expo",
            status: "sent",
            expo_ticket_id: ticket?.id ?? null,
          });
          return;
        }
        const err = ticket?.details?.error;
        const isInvalid =
          err === "DeviceNotRegistered" || err === "InvalidCredentials";
        if (isInvalid) dead.push(to);
        events.push({
          notification_id: payload.notification_id ?? null,
          user_id: payload.user_id,
          token_preview: previewToken(to),
          token_kind: "expo",
          status: isInvalid
            ? "invalid_token"
            : err === "MessageRateExceeded"
              ? "rate_limited"
              : "failed",
          error: ticket?.message ?? err ?? null,
        });
      });
    } catch (e) {
      // Network blip — leave tokens in place; the next notification
      // will retry. Log a per-token "failed" event so the admin
      // dashboard still sees the attempt.
      chunk.forEach((m: any) => {
        events.push({
          notification_id: payload.notification_id ?? null,
          user_id: payload.user_id,
          token_preview: previewToken(m.to),
          token_kind: "expo",
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }
  }

  if (dead.length > 0) {
    await sb.from("device_push_tokens").delete().in("token", dead);
  }
  await logEvents(sb, events);

  if (delivered > 0) {
    await sb
      .from("device_push_tokens")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", payload.user_id);
  }

  return { delivered, purged: dead.length };
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
