// Personal calendar subscription feed. Returns RFC 5545 .ics for one
// user identified by their calendar_feed_token. Subscribe via:
//   webcal://<host>/functions/v1/calendar-feed?token=<token>
//
// Apple Calendar / Google Calendar / Outlook all auto-poll subscribed
// URLs every few hours, so updates show up without re-downloading.
//
// Public endpoint — token is the auth.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.events";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface Appointment {
  id: string;
  kind: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  status: string;
  vendor_name: string | null;
}

interface TimelineItem {
  id: string;
  title: string;
  start_time: string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  event_date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return text("Calendar unavailable: env not configured", 500);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return text("Missing token", 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await sb.rpc("get_calendar_feed_by_token", {
    p_token: token,
  });
  if (error) return text(`Error: ${error.message}`, 500);
  if (!data) return text("Unknown token", 404);

  const payload = data as {
    appointments: Appointment[];
    timeline: TimelineItem[];
  };

  const ics = buildIcs(payload);
  return new Response(ics, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/calendar;charset=utf-8",
      // Encourage clients to re-poll hourly. Apple Cal / Google Cal
      // pick their own interval but Cache-Control nudges intermediaries.
      "Cache-Control": "public, max-age=3600",
    },
  });
});

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function utcStamp(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function escapeText(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + 75);
    out.push(i === 0 ? chunk : ` ${chunk}`);
    i += 75;
  }
  return out.join("\r\n");
}

function buildIcs(p: {
  appointments: Appointment[];
  timeline: TimelineItem[];
}): string {
  const stamp = utcStamp(new Date());
  const events: string[] = [];

  for (const a of p.appointments ?? []) {
    const start = new Date(a.scheduled_at);
    const end = new Date(start.getTime() + (a.duration_minutes ?? 60) * 60_000);
    const kindLabel =
      ({
        consultation: "Consultation",
        walkthrough: "Walkthrough",
        tasting: "Tasting",
        fitting: "Fitting",
        phone_call: "Phone call",
        other: "Meeting",
      } as Record<string, string>)[a.kind] ?? "Meeting";
    const summary = `${kindLabel}${a.vendor_name ? ` with ${a.vendor_name}` : ""}`;
    const desc = [a.notes, `Status: ${a.status}`, `${APP_URL}/customer/appointments`]
      .filter(Boolean)
      .join("\n\n");
    events.push(eventBlock({
      uid: `appt-${a.id}@vendora`,
      stamp,
      start: utcStamp(start),
      end: utcStamp(end),
      summary,
      description: desc,
      location: a.location,
    }));
  }

  for (const t of p.timeline ?? []) {
    if (!t.event_date || !t.start_time) continue;
    const [h, m] = t.start_time.split(":").map(Number);
    const start = new Date(`${t.event_date}T00:00:00Z`);
    start.setUTCHours(h, m, 0, 0);
    const end = new Date(start.getTime() + (t.duration_minutes ?? 30) * 60_000);
    const desc = [t.notes, `${APP_URL}/customer/timeline`]
      .filter(Boolean)
      .join("\n\n");
    events.push(eventBlock({
      uid: `timeline-${t.id}@vendora`,
      stamp,
      start: utcStamp(start),
      end: utcStamp(end),
      summary: t.title,
      description: desc,
      location: t.location,
    }));
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vendora//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Vendora",
    ...events,
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n");
}

function eventBlock(e: {
  uid: string;
  stamp: string;
  start: string;
  end: string;
  summary: string;
  description: string | null;
  location: string | null;
}): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${e.stamp}`,
    `DTSTART:${e.start}`,
    `DTEND:${e.end}`,
    `SUMMARY:${escapeText(e.summary)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function text(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
  });
}
