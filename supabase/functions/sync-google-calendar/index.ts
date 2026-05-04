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
  push_appointments: boolean;
}

interface AppointmentRow {
  id: string;
  vendor_id: string;
  host_id: string;
  title: string | null;
  kind: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  status: string;
  external_event_id: string | null;
  external_event_provider: string | null;
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

  let body: { user_id?: string; user_ids?: string[]; mode?: "pull_only" | "push_only" | "both" } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode = body.mode ?? "both";
  // Build the connection set for this run.
  let query = sb
    .from("calendar_connections")
    .select(
      "id, user_id, provider, access_token, refresh_token, token_expires_at, primary_calendar_id, pull_busy_times, push_appointments",
    )
    .eq("provider", "google");
  if (body.user_id) query = query.eq("user_id", body.user_id);
  if (body.user_ids && body.user_ids.length > 0)
    query = query.in("user_id", body.user_ids);
  const { data: connections, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const results: Array<{
    user_id: string;
    pulled?: { upserted: number; deleted: number };
    pushed?: { created: number; deleted: number };
    error?: string;
  }> = [];

  for (const c of (connections as Connection[] | null) ?? []) {
    try {
      const tokens = await refreshIfNeeded(sb, c);
      const result: (typeof results)[number] = { user_id: c.user_id };

      if (mode !== "push_only" && c.pull_busy_times) {
        const events = await fetchEvents(tokens.access_token, c.primary_calendar_id);
        result.pulled = await persistEvents(sb, c.user_id, events);
      }

      if (mode !== "pull_only" && c.push_appointments) {
        result.pushed = await pushAppointments(
          sb,
          tokens.access_token,
          c.user_id,
          c.primary_calendar_id,
        );
      }

      await sb
        .from("calendar_connections")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
        })
        .eq("id", c.id);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sb
        .from("calendar_connections")
        .update({
          last_sync_error: message.slice(0, 400),
        })
        .eq("id", c.id);
      results.push({ user_id: c.user_id, error: message });
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

// Push side: for each appointment this user is on (as host or vendor
// team member), reconcile against Google. Three states drive action:
//   accepted + no external_event_id  → POST /events (create)
//   accepted + external_event_id     → PATCH /events/{id} (update if mtime drifted)
//   declined|cancelled + external_event_id → DELETE /events/{id} + null out
//
// Idempotency: external_event_id keyed; we skip if scheduled_at is in
// the past (no point creating retro events).
async function pushAppointments(
  sb: any,
  accessToken: string,
  userId: string,
  calendarId: string,
): Promise<{ created: number; deleted: number }> {
  const nowIso = new Date().toISOString();

  // Find vendor_ids this user owns or is a team member of, so we know
  // which appointments they're on as vendor (not just as host).
  const { data: vendorRows } = await sb
    .from("vendor_profiles")
    .select("id")
    .eq("user_id", userId);
  const ownedVendorIds: string[] = ((vendorRows as Array<{ id: string }> | null) ?? []).map(
    (v) => v.id,
  );
  const { data: memberRows } = await sb
    .from("vendor_team_members")
    .select("vendor_id")
    .eq("user_id", userId);
  const memberVendorIds: string[] = ((memberRows as Array<{ vendor_id: string }> | null) ?? []).map(
    (m) => m.vendor_id,
  );
  const vendorIds = Array.from(new Set([...ownedVendorIds, ...memberVendorIds]));

  // Build OR filter for "appointments where this user is host OR vendor team."
  let filter = `host_id.eq.${userId}`;
  if (vendorIds.length > 0) {
    filter += `,vendor_id.in.(${vendorIds.map((id) => `"${id}"`).join(",")})`;
  }

  const { data: appts, error } = await sb
    .from("appointments")
    .select(
      "id, vendor_id, host_id, title, kind, scheduled_at, duration_minutes, location, notes, status, external_event_id, external_event_provider",
    )
    .or(filter)
    .gte("scheduled_at", nowIso)
    .limit(200);
  if (error) throw new Error(`appointments fetch failed: ${error.message}`);

  let created = 0;
  let deleted = 0;

  for (const a of (appts as AppointmentRow[] | null) ?? []) {
    const isLive = a.status === "accepted" || a.status === "proposed";
    const isDead = a.status === "declined" || a.status === "cancelled";

    if (isLive && !a.external_event_id) {
      const ev = await createGoogleEvent(accessToken, calendarId, a);
      if (ev?.id) {
        const update: Record<string, unknown> = {
          external_event_id: ev.id,
          external_event_provider: "google",
          external_synced_at: new Date().toISOString(),
        };
        // Upgrade Jitsi → Google Meet if Google handed us a real Meet link.
        if (ev.hangoutLink) {
          update.meeting_url = ev.hangoutLink;
          update.meeting_provider = "google_meet";
        }
        await sb.from("appointments").update(update).eq("id", a.id);
        created++;
      }
    } else if (isDead && a.external_event_id && a.external_event_provider === "google") {
      const ok = await deleteGoogleEvent(accessToken, calendarId, a.external_event_id);
      if (ok) {
        await sb
          .from("appointments")
          .update({
            external_event_id: null,
            external_event_provider: null,
            external_synced_at: new Date().toISOString(),
          })
          .eq("id", a.id);
        deleted++;
      }
    }
    // Update path skipped for v1 — we'd need a hash of the rendered event
    // to detect drift cheaply. Most Vendora appointments don't change
    // after acceptance. v2 polish.
  }

  return { created, deleted };
}

async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  a: AppointmentRow,
): Promise<{ id: string; hangoutLink?: string } | null> {
  const start = new Date(a.scheduled_at);
  const end = new Date(start.getTime() + a.duration_minutes * 60 * 1000);
  const summary =
    a.title?.trim() || `Vendora ${a.kind.replace("_", " ")}`;
  const remoteFriendly = ["consultation", "phone_call", "other"].includes(a.kind);
  const body: Record<string, unknown> = {
    summary: `[Vendora] ${summary}`,
    description:
      (a.notes ?? "") +
      `\n\nManaged by Vendora — appointment id ${a.id}.`,
    location: a.location ?? undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    source: { title: "Vendora", url: "https://vendora.app" },
  };
  // Remote-friendly kinds get a Google Meet attached automatically.
  if (remoteFriendly) {
    body.conferenceData = {
      createRequest: {
        requestId: a.id,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn(`event create failed: ${res.status} ${t}`);
    return null;
  }
  return (await res.json()) as { id: string; hangoutLink?: string };
}

async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  // 204 = deleted, 410 = already gone (treat as success).
  return res.status === 204 || res.status === 410;
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
