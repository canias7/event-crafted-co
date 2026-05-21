// Mux webhook handler. Receives lifecycle events from Mux Live and
// updates host_event_live_streams so the watch page knows the right
// state (idle / live / replay / ended).
//
// Required env:
//   MUX_WEBHOOK_SECRET    — from Mux dashboard → Settings → Webhooks
//                            ("signing secret" on the endpoint detail)
//
// Deployed with verify_jwt=false — Mux doesn't send a Supabase JWT;
// the signature header is what authenticates the request.
//
// Endpoint URL to register in Mux:
//   https://pahpjjubhbcbwqjpamwv.functions.supabase.co/mux-webhook
//
// Events handled (subscribe to all live_stream + asset events in Mux):
//   video.live_stream.created       — initial create (already handled by us)
//   video.live_stream.active        — host started pushing
//   video.live_stream.idle          — host stopped, no recording yet
//   video.live_stream.disconnected  — terminal "ended" state
//   video.live_stream.recording     — recording started (variant of active)
//   video.asset.ready               — recording asset finalized for replay

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const MUX_WEBHOOK_SECRET = Deno.env.get("MUX_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Mux signs webhooks with the same Standard Webhooks scheme Stripe
// uses: timestamp + payload → HMAC-SHA256 → hex digest.
// Header: `mux-signature: t=<ts>,v1=<hex>`.
async function verifyMuxSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=", 2);
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  // Reject anything more than 5 minutes off the wall clock — bounds
  // a replay window.
  const skewSec = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(skewSec) || skewSec > 5 * 60) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time compare avoids leaking match progress through timing.
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Supabase admin credentials not configured", { status: 500 });
  }

  const raw = await req.text();

  // Allow unsigned-but-logged in dev when the secret hasn't been set
  // yet; in prod the secret should always be configured. The "verified"
  // flag goes to the log so we'd notice an unsigned event.
  let verified = false;
  if (MUX_WEBHOOK_SECRET) {
    verified = await verifyMuxSignature(
      raw,
      req.headers.get("mux-signature"),
      MUX_WEBHOOK_SECRET,
    );
    if (!verified) {
      console.error("[mux-webhook] signature verification failed");
      return new Response("invalid signature", { status: 400 });
    }
  } else {
    console.warn("[mux-webhook] MUX_WEBHOOK_SECRET not set — accepting unsigned");
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const type = String(event?.type ?? "");
  const data = event?.data ?? {};

  try {
    switch (type) {
      case "video.live_stream.active":
      case "video.live_stream.recording": {
        const streamId = data.id as string;
        if (!streamId) break;
        // Only stamp started_at on the first transition to active.
        // Subsequent reconnects keep the original timestamp.
        await db
          .from("host_event_live_streams")
          .update({
            status: type === "video.live_stream.recording" ? "recording" : "active",
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("mux_stream_id", streamId)
          .is("started_at", null);
        // Keep status fresh on every active event even if started_at
        // was already set (host reconnect after a drop).
        await db
          .from("host_event_live_streams")
          .update({
            status: type === "video.live_stream.recording" ? "recording" : "active",
            updated_at: new Date().toISOString(),
          })
          .eq("mux_stream_id", streamId);
        break;
      }
      case "video.live_stream.idle":
      case "video.live_stream.disconnected": {
        const streamId = data.id as string;
        if (!streamId) break;
        await db
          .from("host_event_live_streams")
          .update({
            status: type === "video.live_stream.disconnected" ? "disconnected" : "idle",
            ended_at:
              type === "video.live_stream.disconnected"
                ? new Date().toISOString()
                : null,
            updated_at: new Date().toISOString(),
          })
          .eq("mux_stream_id", streamId);
        break;
      }
      case "video.asset.ready": {
        // The recording finalized for a stream. Mux puts the source
        // live_stream_id on the asset's data; match against that.
        const assetId = data.id as string;
        const liveStreamId = data.live_stream_id as string | undefined;
        if (!liveStreamId || !assetId) break;
        await db
          .from("host_event_live_streams")
          .update({
            mux_asset_id: assetId,
            updated_at: new Date().toISOString(),
          })
          .eq("mux_stream_id", liveStreamId);
        break;
      }
      default:
        // Many events fire (e.g. simulcast_target.*, live_stream.created
        // which we already know about). 2xx them so Mux stops retrying.
        break;
    }
  } catch (err) {
    console.error("[mux-webhook] handler error", type, err);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
