// send-push: POST { user_id, title, body, link, tag } and we deliver a
// Web Push notification to every subscription registered for that user.
//
// Required env (set in Supabase project secrets):
//   VAPID_PUBLIC_KEY     — the public half of your VAPID keypair
//   VAPID_PRIVATE_KEY    — the private half (used to sign requests)
//   VAPID_SUBJECT        — mailto: or https: contact for push services
//                          (e.g. "mailto:hello@vendora.app")
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// Generate VAPID keys once with:
//   npx web-push generate-vapid-keys
//
// Frontend sets VITE_VAPID_PUBLIC_KEY to the same public key so the
// browser can subscribe.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@vendora.app";

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
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not configured" }, 500);
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // No keys yet — silently 200. The DB trigger fires on every
    // notification insert and we don't want spam in the logs until
    // the keys are configured.
    return json({ skipped: "VAPID keys not configured" }, 200);
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

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", payload.user_id);
  if (error) return json({ error: error.message }, 500);
  if (!subs || subs.length === 0) {
    return json({ delivered: 0 }, 200);
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    link: payload.link ?? "/",
    tag: payload.tag ?? undefined,
  });

  let delivered = 0;
  const dead: string[] = [];

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
      } catch (err: any) {
        // 404 / 410 = subscription is gone (uninstalled, denied) →
        // purge so we don't keep retrying.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          dead.push(s.id);
        }
      }
    }),
  );

  if (dead.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", dead);
  }

  // Best-effort touch last_used_at for the surviving rows so we can
  // show "active devices" in Settings.
  if (delivered > 0) {
    await sb
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", payload.user_id)
      .not("id", "in", `(${dead.join(",") || "''"})`);
  }

  return json({ delivered, purged: dead.length }, 200);
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
