// send-push: POST { user_id, title, body, link, tag } and we deliver
// the notification to every channel registered for that user — web
// push (VAPID) AND mobile push (Expo).
//
// Fired automatically by the notifications_fanout_push trigger
// (see migration 20260503430000_push_subscriptions.sql) on every
// insert into public.notifications.
//
// Required env (Supabase project secrets):
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
//     — for browsers (apps/web service worker). If missing, web push
//       is skipped silently.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// Mobile delivery uses Expo's public Push API; no credentials needed.
// Tokens come from public.device_push_tokens, populated by the
// vendor-mobile / host-mobile apps after sign-in.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@vendora.app";

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
  token_kind: "expo" | "web";
  status: PushEventStatus;
  expo_ticket_id?: string | null;
  error?: string | null;
}

// Best-effort batch insert into push_events. Failures here MUST NOT
// break delivery — wrap and swallow.
async function logEvents(sb: any, rows: PushEventRow[]) {
  if (rows.length === 0) return;
  try {
    await sb.from("push_events").insert(rows);
  } catch {
    // swallow
  }
}

function previewToken(t: string): string {
  // Tokens are sensitive; keep only the trailing 8 chars for forensics.
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

  const [webResult, mobileResult] = await Promise.all([
    deliverWeb(sb, payload),
    deliverMobile(sb, payload),
  ]);

  return json(
    {
      web: webResult,
      mobile: mobileResult,
    },
    200,
  );
});

async function deliverWeb(sb: any, payload: Payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { skipped: "VAPID keys not configured" };
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", payload.user_id);
  if (error) return { error: error.message };
  if (!subs || subs.length === 0) return { delivered: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    link: payload.link ?? "/",
    tag: payload.tag ?? undefined,
  });

  let delivered = 0;
  const dead: string[] = [];
  const events: PushEventRow[] = [];

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
        );
        delivered++;
        events.push({
          notification_id: payload.notification_id ?? null,
          user_id: payload.user_id,
          token_preview: previewToken(s.endpoint),
          token_kind: "web",
          status: "sent",
        });
      } catch (err: any) {
        const code = err?.statusCode;
        const isDead = code === 404 || code === 410;
        const isRate = code === 429;
        if (isDead) dead.push(s.id);
        events.push({
          notification_id: payload.notification_id ?? null,
          user_id: payload.user_id,
          token_preview: previewToken(s.endpoint),
          token_kind: "web",
          status: isDead
            ? "invalid_token"
            : isRate
              ? "rate_limited"
              : "failed",
          error: err?.body ?? err?.message ?? String(code ?? "unknown"),
        });
      }
    }),
  );

  if (dead.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", dead);
  }
  await logEvents(sb, events);

  if (delivered > 0) {
    // Only touch last_used_at on subscriptions that didn't just get
    // purged. PostgREST's .not("id","in",...) handles arrays directly;
    // building a string with `(${join(",")})` works in the happy path
    // but the prior `"''"` fallback for empty dead arrays produced
    // invalid SQL. Skip the filter entirely when nothing was purged.
    let q = sb
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", payload.user_id);
    if (dead.length > 0) q = q.not("id", "in", `(${dead.join(",")})`);
    await q;
  }

  return { delivered, purged: dead.length };
}

async function deliverMobile(sb: any, payload: Payload) {
  const { data: tokens, error } = await sb
    .from("device_push_tokens")
    .select("token")
    .eq("user_id", payload.user_id);
  if (error) return { error: error.message };
  if (!tokens || tokens.length === 0) return { delivered: 0 };

  // Expo accepts batches of up to 100 messages per request.
  // priority "high" tells APNs/FCM to deliver immediately even when the
  // device is in Low Power Mode / Doze. Without it iOS may batch the
  // notification for several minutes, and Focus filters can suppress
  // it entirely while the app is closed.
  const messages = tokens.map((t: any) => ({
    to: t.token,
    sound: "default",
    priority: "high",
    title: payload.title,
    body: payload.body ?? "",
    channelId: "default",
    data: {
      link: payload.link ?? null,
      tag: payload.tag ?? null,
    },
  }));

  let delivered = 0;
  const dead: string[] = [];
  const events: PushEventRow[] = [];

  // Chunk just in case — practically tokens.length is tiny but the
  // ceiling is real.
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
      // If Expo returned no tickets (e.g. global 429), still log one
      // event per token so we don't lose the trail.
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
      // Network blip — leave tokens in place, the next notification
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
