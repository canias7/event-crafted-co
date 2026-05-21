// Creates (or retrieves) a Mux Live Stream resource for a host event.
// Idempotent: calling twice for the same event returns the existing
// stream — Mux charges per resource and per minute, so we don't
// orphan streams behind a "Go Live" button that was clicked twice.
//
// Required env (Supabase Edge Function secrets):
//   MUX_TOKEN_ID       — from Mux dashboard → Settings → Access Tokens
//   MUX_TOKEN_SECRET   — paired secret for the token above
//   APP_URL            — base URL of the web app, for the share link
//
// Invoke from frontend:
//   const { data } = await supabase.functions.invoke(
//     "mux-create-live-stream",
//     { body: { event_id } },
//   );
//   // data: { stream_id, stream_key, playback_id, share_token, share_url, ingest_url, status }

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const MUX_TOKEN_ID = Deno.env.get("MUX_TOKEN_ID");
const MUX_TOKEN_SECRET = Deno.env.get("MUX_TOKEN_SECRET");
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const MUX_API = "https://api.mux.com";
// Standard RTMP ingest endpoint. Mobile encoders (Larix, Streamlabs)
// take the URL + the stream_key as the "stream name". WHIP/browser
// ingest uses a different URL; we surface both.
const MUX_RTMP_INGEST = "rtmps://global-live.mux.com:443/app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function muxAuth(): string {
  return "Basic " + btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }
  if (
    !MUX_TOKEN_ID ||
    !MUX_TOKEN_SECRET ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return json({ error: "Mux/Supabase secrets not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing auth" }, 401);

  const userClient = createClient(
    SUPABASE_URL!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json({ error: "invalid auth" }, 401);

  const body = await req.json().catch(() => ({}));
  const eventId = body?.event_id as string | undefined;
  if (!eventId) return json({ error: "event_id required" }, 400);

  // Verify the caller owns this event — RLS on host_events gates
  // SELECT to the owner, so a successful read is the auth check.
  const { data: event, error: eventErr } = await userClient
    .from("host_events")
    .select("id, host_id, title")
    .eq("id", eventId)
    .maybeSingle();
  if (eventErr || !event) {
    return json({ error: "event not found or not owned by caller" }, 404);
  }
  if (event.host_id !== userId) {
    return json({ error: "not the event owner" }, 403);
  }

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Idempotency. If a stream already exists for this event, return
  // it. Mux charges per stream object and we don't want to orphan
  // resources behind double-clicks on "Go Live".
  const { data: existing } = await db
    .from("host_event_live_streams")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) {
    return json({
      stream_id: existing.mux_stream_id,
      stream_key: existing.mux_stream_key,
      playback_id: existing.mux_playback_id,
      share_token: existing.share_token,
      share_url: `${APP_URL}/live/${existing.share_token}`,
      ingest_url: MUX_RTMP_INGEST,
      status: existing.status,
      reused: true,
    });
  }

  // Create a fresh live stream. Settings:
  //   playback_policy: ["public"]   — anyone with the playback id can watch
  //   new_asset_settings.playback_policy: ["public"] — recordings public too
  //   latency_mode: "low"           — ~5s glass-to-glass; good for events
  //                                    while keeping HLS reliability
  //   reconnect_window: 60          — host can drop and rejoin within 60s
  //                                    without breaking the viewer experience
  const res = await fetch(`${MUX_API}/video/v1/live-streams`, {
    method: "POST",
    headers: {
      Authorization: muxAuth(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      playback_policy: ["public"],
      new_asset_settings: { playback_policy: ["public"] },
      latency_mode: "low",
      reconnect_window: 60,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[mux-create-live-stream] Mux API failed", res.status, errText);
    return json({ error: `Mux: ${res.status}`, detail: errText }, 502);
  }
  const muxBody = (await res.json()) as any;
  const streamId = muxBody?.data?.id as string;
  const streamKey = muxBody?.data?.stream_key as string;
  const playbackId = muxBody?.data?.playback_ids?.[0]?.id as string;
  if (!streamId || !streamKey || !playbackId) {
    console.error("[mux-create-live-stream] malformed Mux response", muxBody);
    return json({ error: "Mux returned malformed response" }, 502);
  }

  const { data: inserted, error: insertErr } = await db
    .from("host_event_live_streams")
    .insert({
      event_id: eventId,
      host_id: userId,
      mux_stream_id: streamId,
      mux_stream_key: streamKey,
      mux_playback_id: playbackId,
      status: "idle",
    })
    .select()
    .single();
  if (insertErr || !inserted) {
    console.error("[mux-create-live-stream] DB insert failed", insertErr);
    // Best-effort cleanup of the Mux resource so we don't pay for an
    // orphan. Don't block the response on this — if it fails, an
    // operator can clean up later from the Mux dashboard.
    fetch(`${MUX_API}/video/v1/live-streams/${streamId}`, {
      method: "DELETE",
      headers: { Authorization: muxAuth() },
    }).catch(() => {});
    return json({ error: insertErr?.message ?? "insert failed" }, 500);
  }

  return json({
    stream_id: streamId,
    stream_key: streamKey,
    playback_id: playbackId,
    share_token: inserted.share_token,
    share_url: `${APP_URL}/live/${inserted.share_token}`,
    ingest_url: MUX_RTMP_INGEST,
    status: "idle",
    reused: false,
  });
});
