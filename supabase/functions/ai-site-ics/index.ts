// AI Website Builder — .ics calendar download.
//
// GET /functions/v1/ai-site-ics?slug=<slug>
//   → text/calendar (RFC 5545) file the user can import into
//     Google Calendar, Apple Calendar, Outlook, etc.
//
// The generated site emits structured metadata as <meta> tags in
// <head>:
//   <meta name="event-start"    content="2026-08-15T16:00:00-04:00">
//   <meta name="event-end"      content="2026-08-15T22:00:00-04:00">
//   <meta name="event-location" content="Villa Cipressi, Lake Como, Italy">
//   <meta name="event-summary"  content="Eleanor & Marcus Wedding">
//
// We parse those out of the saved HTML and synthesize an .ics file.
// Anyone with the slug can download — there's no PII in the calendar
// payload that isn't already public on the site.
//
// Auth: public (verify_jwt = false).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

// Format a Date as UTC YYYYMMDDTHHMMSSZ for an .ics DTSTART/DTEND.
function icsDate(input: string | null, fallback: Date): string {
  const d = input ? new Date(input) : fallback;
  if (Number.isNaN(d.getTime())) return icsDate(null, fallback);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// .ics text needs CRLF line endings and certain chars escaped.
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold a property line to 75 octets per RFC 5545 with CRLF + space.
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74));
    out.push(i === 0 ? chunk : " " + chunk);
    i += i === 0 ? 75 : 74;
  }
  return out.join("\r\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  if (!slug) {
    return new Response("Missing slug", { status: 400, headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("ai_sites")
    .select("id, slug, title, html, is_blocked")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) {
    return new Response("Site not found", { status: 404, headers: cors });
  }
  const site = data as {
    id: string;
    slug: string;
    title: string;
    html: string;
    is_blocked: boolean | null;
  };
  if (site.is_blocked) {
    return new Response("Site not found", { status: 404, headers: cors });
  }

  // Pull structured meta. Falls back gracefully if AI didn't emit them.
  const startRaw = extractMeta(site.html, "event-start");
  const endRaw = extractMeta(site.html, "event-end");
  const location = extractMeta(site.html, "event-location") ?? "";
  const summary = extractMeta(site.html, "event-summary") ?? site.title ?? "Event";

  // No start → no usable .ics. Surface a friendly error.
  if (!startRaw) {
    return new Response(
      "This site doesn't have a calendar date set yet. Ask the designer to add one.",
      { status: 422, headers: cors },
    );
  }

  const now = new Date();
  // Default end = start + 3h if AI didn't emit one.
  const startD = new Date(startRaw);
  const endD = endRaw
    ? new Date(endRaw)
    : new Date(startD.getTime() + 3 * 60 * 60 * 1000);

  const uid = `${site.id}@eventvendora.com`;
  const url2 = `https://eventvendora.com/s/${site.slug}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Event Crafted Co//Website Builder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(now.toISOString(), now)}`,
    `DTSTART:${icsDate(startD.toISOString(), now)}`,
    `DTEND:${icsDate(endD.toISOString(), now)}`,
    fold(`SUMMARY:${icsEscape(summary)}`),
    fold(`LOCATION:${icsEscape(location)}`),
    fold(`URL:${url2}`),
    fold(`DESCRIPTION:${icsEscape(`Details: ${url2}`)}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${site.slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
});
