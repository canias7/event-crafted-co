// Receives Resend webhook events + persists them to email_events for
// the admin deliverability dashboard.
//
// Security: Resend signs each request with the webhook secret. We
// verify the signature header against an HMAC-SHA256 of the raw body
// before trusting any data. If RESEND_WEBHOOK_SECRET isn't set we
// reject — fail closed.
//
// Operator setup: Resend dashboard → Webhooks → add endpoint with URL
//   <SUPABASE_URL>/functions/v1/resend-webhook
// Copy the signing secret + set RESEND_WEBHOOK_SECRET in Supabase
// project secrets. Subscribe to the events you care about (sent,
// delivered, bounced, complained, opened, clicked, failed).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResendEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string | string[];
    subject?: string;
    [k: string]: unknown;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
    return json({ error: "webhook not configured" }, 500);
  }

  const rawBody = await req.text();

  // Resend uses Svix-format signatures. Header looks like:
  //   svix-signature: v1,base64sig v1,base64sig
  // We only need ONE valid signature to pass.
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return json({ error: "missing signature headers" }, 401);
  }

  const ok = await verifySvix(
    WEBHOOK_SECRET,
    svixId,
    svixTimestamp,
    rawBody,
    svixSignature,
  );
  if (!ok) return json({ error: "invalid signature" }, 401);

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const recipients = Array.isArray(event.data.to)
    ? event.data.to
    : event.data.to
      ? [event.data.to]
      : [null];

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const rows = recipients.map((r) => ({
    resend_event_id: `${svixId}-${event.data.email_id ?? ""}-${r ?? ""}`.slice(0, 200),
    resend_email_id: event.data.email_id ?? null,
    event_type: event.type,
    recipient_email: r,
    subject: event.data.subject ?? null,
    meta: event.data,
    occurred_at: event.created_at ?? new Date().toISOString(),
  }));

  // Upsert on resend_event_id so a webhook retry doesn't double-count.
  const { error } = await sb
    .from("email_events")
    .upsert(rows, { onConflict: "resend_event_id" });
  if (error) {
    console.error("insert failed", error);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, persisted: rows.length }, 200);
});

// Svix signature: v1,base64(hmacSha256(secret, "msg-id.timestamp.body"))
async function verifySvix(
  secret: string,
  msgId: string,
  timestamp: string,
  body: string,
  headerValue: string,
): Promise<boolean> {
  // Strip optional whsec_ prefix; secret may be base64-encoded
  // (Resend's default) — try both literal + base64-decoded.
  const trimmedSecret = secret.replace(/^whsec_/, "");
  const candidates: Uint8Array[] = [
    new TextEncoder().encode(trimmedSecret),
  ];
  try {
    const bin = atob(trimmedSecret);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    candidates.push(buf);
  } catch {
    // not base64; ignore
  }

  const toSign = `${msgId}.${timestamp}.${body}`;
  const sigs = headerValue
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("v1,") ? s.slice(3) : s));

  for (const keyBytes of candidates) {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(toSign),
    );
    const ours = b64(new Uint8Array(sig));
    for (const s of sigs) {
      if (s === ours) return true;
    }
  }
  return false;
}

function b64(buf: Uint8Array): string {
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
