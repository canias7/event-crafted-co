// "Your listing isn't finished" reminder scanner.
//
// DELIBERATELY CANNOT SEND YET. Two independent locks have to be opened
// before a single email leaves:
//
//   1. env  LISTING_REMINDER_SEND = "true"
//   2. body {"confirm":"send"}
//
// Miss either and the run is a dry run: it computes the exact audience,
// writes what it WOULD have sent to listing_reminder_log, and returns a
// summary. Nothing is scheduled either — no cron points at this.
//
// SERVICE ROLE ONLY. verify_jwt alone is not access control here: the
// publishable/anon key is a valid JWT and ships inside the mobile app,
// so anyone holding it could otherwise call this and read back a list of
// vendor email addresses. The role claim is checked explicitly below.
//
// The audience comes from public.vendor_setup_status, which mirrors
// apps/vendor-mobile/lib/setupChecklist.ts, so a reminder can never
// claim a step is missing that the app shows as done.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: RESEND_API_KEY, EMAIL_FROM_ADDRESS, APP_URL,
//           LISTING_REMINDER_SEND, LISTING_REMINDER_COOLDOWN_DAYS,
//           LISTING_REMINDER_GRACE_DAYS.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <hello@eventvendora.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SEND_ENABLED = Deno.env.get("LISTING_REMINDER_SEND") === "true";
const COOLDOWN_DAYS = Number.parseInt(
  Deno.env.get("LISTING_REMINDER_COOLDOWN_DAYS") ?? "7",
  10,
);
// Don't nag someone who signed up this morning.
const GRACE_DAYS = Number.parseInt(
  Deno.env.get("LISTING_REMINDER_GRACE_DAYS") ?? "3",
  10,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Accounts that must never receive lifecycle mail. The store-review
// logins are the important ones — the first dry run of this scanner
// found Google's reviewer at the top of the list.
const NEVER_EMAIL = new Set([
  "playreview@eventvendora.com",
  "vendora.review.demo@gmail.com",
]);

// Fixture domains. RFC 2606 reserves .test/.example/.invalid; .local is
// mDNS. All undeliverable, and bouncing them hurts sending reputation.
const DEAD_TLDS = [".test", ".example", ".invalid", ".local"];

const STEPS: { key: string; column: string; label: string }[] = [
  { key: "identity", column: "has_identity", label: "Business name" },
  { key: "logo", column: "has_logo", label: "Profile photo or logo" },
  { key: "description", column: "has_description", label: "Description" },
  { key: "category", column: "has_category", label: "Category" },
  { key: "location", column: "has_location", label: "Location & service area" },
  { key: "pricing", column: "has_pricing", label: "Starting price" },
  { key: "listing", column: "has_published_listing", label: "Publish a listing" },
  { key: "availability", column: "has_availability", label: "Availability" },
];

// The bearer must carry role=service_role. Anything else — anon,
// publishable, a signed-in user's token — is refused.
function isServiceRole(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (token === SERVICE_ROLE) return true;
  const parts = token.split(".");
  if (parts.length < 2) return false;
  try {
    const pad = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const json = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    return JSON.parse(json)?.role === "service_role";
  } catch {
    return false;
  }
}

function emailBody(name: string, missing: string[]): string {
  const items = missing
    .map(
      (m) =>
        `<tr><td style="padding:6px 0;font-family:Georgia,serif;font-size:15px;color:#14161a">&#9702;&nbsp;&nbsp;${m}</td></tr>`,
    )
    .join("");
  const done = STEPS.length - missing.length;
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fbf9f4;border:1px solid #e6e1d5;border-radius:20px;padding:28px">
<tr><td style="font-family:Georgia,serif;font-size:24px;color:#14161a;padding-bottom:8px">You're ${done} of ${STEPS.length} of the way there</td></tr>
<tr><td style="font-family:Georgia,serif;font-size:15px;line-height:22px;color:#14161a;padding-bottom:18px">${name}, hosts can't find you until your listing is finished. Here's what's left:</td></tr>
<tr><td><table role="presentation">${items}</table></td></tr>
<tr><td style="padding-top:24px"><a href="${APP_URL}/vendor/setup" style="display:inline-block;background:#c9a86a;color:#14161a;font-family:Georgia,serif;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:999px">Finish my listing</a></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!isServiceRole(req)) {
    return new Response(
      JSON.stringify({ error: "service role required" }),
      {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine — that's a dry run
  }

  const confirmed = body?.confirm === "send";
  const willSend = SEND_ENABLED && confirmed && !!RESEND_API_KEY;
  const dryRun = !willSend;

  const { data: rows, error } = await supabase
    .from("vendor_setup_status")
    .select("*");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: suppressed } = await supabase
    .from("suppressed_emails")
    .select("email");
  const suppressedSet = new Set(
    (suppressed ?? []).map((s: any) => String(s.email).toLowerCase()),
  );

  const cooldownSince = new Date(
    Date.now() - COOLDOWN_DAYS * 86400_000,
  ).toISOString();
  const { data: recent } = await supabase
    .from("listing_reminder_log")
    .select("user_id")
    .not("sent_at", "is", null)
    .gte("sent_at", cooldownSince);
  const recentlyMailed = new Set((recent ?? []).map((r: any) => r.user_id));

  const graceCutoff = Date.now() - GRACE_DAYS * 86400_000;

  const candidates: any[] = [];
  const skipped: Record<string, number> = {};
  const note = (why: string) => {
    skipped[why] = (skipped[why] ?? 0) + 1;
  };

  for (const row of rows ?? []) {
    const missing = STEPS.filter((s) => !row[s.column]).map((s) => s.label);
    if (missing.length === 0) {
      note("complete");
      continue;
    }

    const { data: userRes } = await supabase.auth.admin.getUserById(row.user_id);
    const email = (userRes?.user?.email ?? "").toLowerCase();
    if (!email) {
      note("no-email");
      continue;
    }
    if (NEVER_EMAIL.has(email)) {
      note("store-review-account");
      continue;
    }
    if (DEAD_TLDS.some((t) => email.endsWith(t))) {
      note("undeliverable-domain");
      continue;
    }
    if (suppressedSet.has(email)) {
      note("suppressed");
      continue;
    }
    if (recentlyMailed.has(row.user_id)) {
      note("cooldown");
      continue;
    }
    if (
      row.first_listing_at &&
      new Date(row.first_listing_at).getTime() > graceCutoff
    ) {
      note("too-new");
      continue;
    }

    candidates.push({
      user_id: row.user_id,
      email,
      business_name: row.business_name,
      missing,
    });
  }

  const results: any[] = [];
  for (const c of candidates) {
    let sentAt: string | null = null;
    let failure: string | null = null;

    if (willSend) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [c.email],
            subject: "Your Vendora listing is almost ready",
            html: emailBody(c.business_name, c.missing),
          }),
        });
        if (!res.ok) failure = `resend ${res.status}: ${await res.text()}`;
        else sentAt = new Date().toISOString();
      } catch (e) {
        failure = String(e);
      }
    }

    await supabase.from("listing_reminder_log").insert({
      user_id: c.user_id,
      email: c.email,
      missing: c.missing,
      dry_run: dryRun,
      sent_at: sentAt,
      skipped_reason: failure,
    });

    results.push({
      business_name: c.business_name,
      email: c.email,
      missing: c.missing,
      sent: !!sentAt,
      failure,
    });
  }

  return new Response(
    JSON.stringify(
      {
        mode: dryRun ? "DRY RUN — nothing sent" : "LIVE — emails sent",
        locks: {
          env_LISTING_REMINDER_SEND: SEND_ENABLED,
          body_confirm_send: confirmed,
          resend_key_present: !!RESEND_API_KEY,
        },
        scanned: (rows ?? []).length,
        would_email: results.length,
        skipped,
        recipients: results,
      },
      null,
      2,
    ),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
