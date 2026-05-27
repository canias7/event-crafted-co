// Gracefully ends an active Mux live stream so the host can close the
// broadcast deterministically. The browser modal calls this when the
// host clicks "End stream"; without this call, ending only happens
// once Mux notices the WHIP/RTMP connection has dropped, which can
// hang the watch page on "Live" for the reconnect_window (60s).
//
// Mux semantics:
//   PUT /video/v1/live-streams/{id}/complete
//     Terminates the active broadcast immediately. The live stream
//     resource stays around (so the host can go live again on the same
//     stream_key without re-provisioning). Mux fires
//     `video.live_stream.disconnected` and finalizes the recording
//     asset shortly after.
//
// We also stamp status='disconnected' and ended_at locally so the
// watch page flips state without waiting on the webhook round-trip.
//
// Required env (same secrets as mux-create-live-stream):
//   MUX_TOKEN_ID, MUX_TOKEN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const MUX_TOKEN_ID = Deno.env.get("MUX_TOKEN_ID");
const MUX_TOKEN_SECRET = Deno.env.get("MUX_TOKEN_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const MUX_API = "https://api.mux.com";

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

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Look up the stream + verify the caller owns it. The user-scoped
  // client would also work via RLS, but we want the service-role write
  // anyway for the status update below.
  const { data: stream, error: streamErr } = await db
    .from("host_event_live_streams")
    .select("id, host_id, mux_stream_id, status")
    .eq("event_id", eventId)
    .maybeSingle();
  if (streamErr || !stream) {
    return json({ error: "live stream not found" }, 404);
  }
  if (stream.host_id !== userId) {
    return json({ error: "not the stream owner" }, 403);
  }

  // Tell Mux to finalize the broadcast now. "complete" works whether
  // the stream is currently active or already idle; if it's idle Mux
  // returns 200 with no-op. Catch errors but don't fail the response —
  // the local status update below is what the UI needs to advance.
  const muxRes = await fetch(
    `${MUX_API}/video/v1/live-streams/${stream.mux_stream_id}/complete`,
    {
      method: "PUT",
      headers: {
        Authorization: muxAuth(),
        "Content-Type": "application/json",
      },
    },
  );
  if (!muxRes.ok && muxRes.status !== 404) {
    const errText = await muxRes.text().catch(() => "");
    console.error("[mux-end-live-stream] Mux complete failed", muxRes.status, errText);
    // Continue — local status flip below still helps the UX.
  }

  const { error: updateErr } = await db
    .from("host_event_live_streams")
    .update({
      status: "disconnected",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", stream.id);
  if (updateErr) {
    console.error("[mux-end-live-stream] status update failed", updateErr);
    return json({ error: updateErr.message }, 500);
  }

  return json({ ok: true });
});
