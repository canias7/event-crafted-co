// sync-google-calendar: pulls busy events from each connected Google
// Calendar into calendar_synced_busy. Designed to be invoked from:
//   * Supabase Cron (pg_cron) every 15-30 minutes — passes no body, syncs
//     every connection due for refresh.
//   * The frontend post-OAuth — passes { user_id } to do an immediate
//     first sync so the UI shows pulled events without a 30-min wait.
//
// We pull the next 90 days of events, treating any event the user is
// attending or hosting as "busy" (we don't try to be clever about
// declined or tentative — too noisy). Events flagged transparency=
// "transparent" (the user marked them as Free) are skipped.
//
// Token refresh: when token_expires_at is within 60s, we POST to
// /oauth2/v4/token with the refresh_token and update the connection
// row before fetching events.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Connection {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
  primary_calendar_id: string;
  pull_busy_times: boolean;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  transparency?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLIENT_ID || !CLIENT_SECRET) {
    return json({ error: "missing env" }, 500);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let body: { user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const query = sb
    .from("calendar_connections")
    .select(
      "id, user_id, provider, access_token, refresh_token, token_expires_at, primary_calendar_id, pull_busy_times",
    )
    .eq("provider", "google")
    .eq("pull_busy_times", true);
  const { data: connections, error } = body.user_id
    ? await query.eq("user_id", body.user_id)
    : await query;
  if (error) return json({ error: error.message }, 500);

  const results: Array<{
    user_id: string;
    upserted: number;
    deleted: number;
    error?: string;
  }> = [];

  for (const c of (connections as Connection[] | null) ?? []) {
    try {
      const tokens = await refreshIfNeeded(sb, c);
      const events = await fetchEvents(tokens.access_token, c.primary_calendar_id);
      const { upserted, deleted } = await persistEvents(sb, c.user_id, events);
      await sb
        .from("calendar_connections")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
        })
        .eq("id", c.id);
      results.push({ user_id: c.user_id, upserted, deleted });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sb
        .from("calendar_connections")
        .update({
          last_sync_error: message.slice(0, 400),
        })
        .eq("id", c.id);
      results.push({ user_id: c.user_id, upserted: 0, deleted: 0, error: message });
    }
  }

  return json({ synced: results.length, results }, 200);
});

async function refreshIfNeeded(sb: any, c: Connection) {
  const expiresAt = new Date(c.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { access_token: c.access_token };
  }
  if (!c.refresh_token) {
    throw new Error(
      "Access token expired and no refresh token. Reconnect required.",
    );
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: c.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`refresh failed: ${res.status} ${t}`);
  }
  const tk = (await res.json()) as { access_token: string; expires_in: number };
  await sb
    .from("calendar_connections")
    .update({
      access_token: tk.access_token,
      token_expires_at: new Date(
        Date.now() + (tk.expires_in - 60) * 1000,
      ).toISOString(),
    })
    .eq("id", c.id);
  return { access_token: tk.access_token };
}

async function fetchEvents(
  accessToken: string,
  calendarId: string,
): Promise<GoogleEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    maxResults: "500",
    showDeleted: "false",
  });
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Calendar fetch failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { items?: GoogleEvent[] };
  return data.items ?? [];
}

async function persistEvents(sb: any, userId: string, events: GoogleEvent[]) {
  // Filter out transparent (Free) events + cancelled.
  const usable = events.filter(
    (e) => e.status !== "cancelled" && e.transparency !== "transparent",
  );

  const upserts = usable.map((e) => {
    const start = e.start?.dateTime ?? e.start?.date;
    const end = e.end?.dateTime ?? e.end?.date;
    const isAllDay = Boolean(e.start?.date && !e.start?.dateTime);
    return {
      user_id: userId,
      provider: "google",
      external_event_id: e.id,
      summary: e.summary ?? null,
      starts_at: start ? new Date(start).toISOString() : null,
      ends_at: end ? new Date(end).toISOString() : null,
      is_all_day: isAllDay,
      synced_at: new Date().toISOString(),
    };
  }).filter((r) => r.starts_at && r.ends_at);

  // Upsert into calendar_synced_busy. Conflict on (user_id, provider, external_event_id).
  let upserted = 0;
  if (upserts.length > 0) {
    const { error } = await sb
      .from("calendar_synced_busy")
      .upsert(upserts, { onConflict: "user_id,provider,external_event_id" });
    if (error) throw new Error(`upsert failed: ${error.message}`);
    upserted = upserts.length;
  }

  // Delete rows that no longer exist in Google for this user (cleared
  // events). We scope the delete to the time window we just fetched
  // (next 90 days) so we don't nuke historical entries.
  const now = new Date();
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const liveIds = upserts.map((r) => r.external_event_id);
  const deleteQuery = sb
    .from("calendar_synced_busy")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "google")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", future.toISOString());
  const { error: delErr, count: deleted } =
    liveIds.length > 0
      ? await deleteQuery.not(
          "external_event_id",
          "in",
          `(${liveIds.map((id) => `"${id.replace(/"/g, '""')}"`).join(",")})`,
        )
      : await deleteQuery;
  if (delErr) throw new Error(`delete failed: ${delErr.message}`);

  return { upserted, deleted: deleted ?? 0 };
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
