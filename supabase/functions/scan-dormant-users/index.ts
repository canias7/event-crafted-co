// Dormant-user scanner — "who hasn't opened the app in a while, and do
// they have a reason to come back?"
//
// AUDIENCE ONLY. This function does not compose or send email, and has
// no Resend dependency. It answers one question and returns the answer:
// who would we contact, and what would each of them actually be told.
// Wiring a send is a separate, deliberate change — see the note at the
// bottom of the file for where it hooks in and what has to exist first.
//
// Not scheduled. No cron points here; it runs when you call it.
//
// SERVICE ROLE ONLY. verify_jwt alone is not access control: the
// publishable key is a valid JWT and ships inside the mobile bundle, so
// anyone holding it could otherwise call this and read back every user's
// email address alongside how inactive they are. The role claim is
// checked explicitly.
//
// The activity signal is public.user_last_active, a definer view over
// auth.sessions.refreshed_at. See that migration for why last_sign_in_at
// is the wrong column and why this is a proxy rather than a truth.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: DORMANT_AFTER_DAYS (14), DORMANT_GRACE_DAYS (3).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Two weeks, not one. A week catches people who took a normal weekend
// off; the point is to find users who have actually drifted away.
// Override per-run with {"dormantAfterDays": N} to explore the cohort.
const DORMANT_AFTER_DAYS = Number.parseInt(
  Deno.env.get("DORMANT_AFTER_DAYS") ?? "14",
  10,
);
// Don't chase someone who signed up two days ago and hasn't been back —
// they are still deciding, not lapsed.
const GRACE_DAYS = Number.parseInt(
  Deno.env.get("DORMANT_GRACE_DAYS") ?? "3",
  10,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Accounts that must never receive lifecycle mail. The store-review
// logins are the important ones — the first dry run of the listing
// scanner found Google's reviewer at the top of its list.
const NEVER_CONTACT = new Set([
  "playreview@eventvendora.com",
  "vendora.review.demo@gmail.com",
]);

// RFC 2606 reserves .test/.example/.invalid; .local is mDNS. All
// undeliverable, and bouncing them hurts sending reputation.
const DEAD_TLDS = [".test", ".example", ".invalid", ".local"];

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

function looksLikeFixture(email: string | null): boolean {
  if (!email) return true;
  const e = email.toLowerCase();
  if (DEAD_TLDS.some((t) => e.endsWith(t))) return true;
  return /(^|[._-])(e2e|qa|fixture|smoketest)([._-]|@)/.test(e);
}

/** Why this person might come back, best reason first. */
type Reason =
  | { kind: "open_inquiries"; count: number }
  | { kind: "unfinished_setup"; missing: number }
  | { kind: "none" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!isServiceRole(req)) {
    return new Response(
      JSON.stringify({ error: "forbidden", message: "service role required" }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const dormantAfter = Number.isFinite(body?.dormantAfterDays)
    ? Number(body.dormantAfterDays)
    : DORMANT_AFTER_DAYS;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // 1. Everyone, with their last-active proxy.
  const { data: users, error: uErr } = await db
    .from("user_last_active")
    .select("user_id, email, role, signed_up_at, last_active_at, days_since_active");
  if (uErr) {
    return new Response(
      JSON.stringify({ error: "query_failed", message: uErr.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // 2. Open inquiries per vendor owner — the strongest reason to return.
  const { data: inqRows } = await db
    .from("inquiries")
    .select("id, status, vendor_id, vendor_profiles!inner(user_id)")
    .in("status", ["new", "pending"]);
  const openByUser = new Map<string, number>();
  for (const r of (inqRows ?? []) as any[]) {
    const uid = r.vendor_profiles?.user_id;
    if (uid) openByUser.set(uid, (openByUser.get(uid) ?? 0) + 1);
  }

  // 3. Unfinished setup, from the same view the listing scanner uses,
  //    so the two scanners can never disagree about who is "done".
  const { data: setupRows } = await db
    .from("vendor_setup_status")
    .select("*");
  const incompleteByUser = new Map<string, number>();
  for (const r of (setupRows ?? []) as any[]) {
    const uid = r.user_id;
    if (!uid) continue;
    const missing = Object.entries(r).filter(
      ([k, v]) => k.startsWith("has_") && v === false,
    ).length;
    if (missing > 0) incompleteByUser.set(uid, missing);
  }

  const now = Date.now();
  const dormant: any[] = [];
  const skipped = { active: 0, too_new: 0, never_signed_in: 0, fixture: 0, never_contact: 0 };

  for (const u of (users ?? []) as any[]) {
    const email: string | null = u.email;

    if (email && NEVER_CONTACT.has(email.toLowerCase())) {
      skipped.never_contact++;
      continue;
    }
    if (looksLikeFixture(email)) {
      skipped.fixture++;
      continue;
    }
    const ageDays = (now - new Date(u.signed_up_at).getTime()) / 86_400_000;
    if (ageDays < GRACE_DAYS) {
      skipped.too_new++;
      continue;
    }
    // No session ever recorded. Distinct from "went quiet" — this
    // person may never have got past the login screen, and that is a
    // different problem with a different message.
    if (!u.last_active_at) {
      skipped.never_signed_in++;
      continue;
    }
    if ((u.days_since_active ?? 0) < dormantAfter) {
      skipped.active++;
      continue;
    }

    const open = openByUser.get(u.user_id) ?? 0;
    const missing = incompleteByUser.get(u.user_id) ?? 0;
    const reason: Reason =
      open > 0
        ? { kind: "open_inquiries", count: open }
        : missing > 0
          ? { kind: "unfinished_setup", missing }
          : { kind: "none" };

    dormant.push({
      user_id: u.user_id,
      email,
      role: u.role,
      last_active_at: u.last_active_at,
      days_since_active: u.days_since_active,
      reason,
    });
  }

  dormant.sort((a, b) => b.days_since_active - a.days_since_active);

  // "none" is the interesting bucket: these are people with no waiting
  // work and nothing unfinished, so any message to them is a "we miss
  // you" with nothing behind it. Counted separately on purpose — it is
  // the number that decides whether a send is worth doing at all.
  const byReason = {
    open_inquiries: dormant.filter((d) => d.reason.kind === "open_inquiries").length,
    unfinished_setup: dormant.filter((d) => d.reason.kind === "unfinished_setup").length,
    none: dormant.filter((d) => d.reason.kind === "none").length,
  };

  return new Response(
    JSON.stringify(
      {
        ok: true,
        mode: "audience_only",
        note: "This function never sends. It reports who a send would reach.",
        thresholds: { dormantAfterDays: dormantAfter, graceDays: GRACE_DAYS },
        scanned: (users ?? []).length,
        dormant: dormant.length,
        byReason,
        skipped,
        audience: dormant,
      },
      null,
      2,
    ),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});

// Wiring a send, when you want one. In rough order:
//
//   1. Unsubscribe. There is no opt-out column anywhere in the schema,
//      and recurring commercial mail needs a working one-click opt-out.
//      The link has to work for a logged-out person clicking from their
//      mail app, so it needs a signed token — not ?user=<id>, or anyone
//      can unsubscribe anyone.
//   2. A send log, for frequency capping. Without one this will mail the
//      same person every run forever. scan-incomplete-listings uses
//      listing_reminder_log for exactly this.
//   3. The two locks that scanner uses: an env flag AND {"confirm":"send"}
//      in the body, so neither a stray cron nor a stray call can send.
//   4. Only then compose copy, and only for the reason buckets that
//      actually have something to say.
