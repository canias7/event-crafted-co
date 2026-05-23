// Vendor signup flow with a 6-digit email code. Mirrors the
// host-signup edge function: bypasses Supabase Auth's built-in
// confirmation email so we can send a real 6-digit code via Resend
// (the default magic-link template doesn't render the token).
//
//   POST {action: "request", email, businessName?, category?}
//     - Generates a 6-digit code, stores hash in vendor_signup_codes.
//     - Two-tier rate limit per email: 60s floor + 5 requests/hour
//       cap. Throttled requests return the same success shape so the
//       endpoint can't be used to probe state.
//     - Emails the code via Resend.
//     - Returns {ok: true}.
//
//   POST {action: "verify", email, code, password,
//          businessName?, category?}
//     - Validates the code (TTL 10min, max 5 attempts per code,
//       constant-time hash compare).
//     - Creates the auth user via admin API with email_confirm:true
//       and intended_role:"vendor" metadata. handle_new_user then
//       sets profiles.role='vendor'. No vendor_profile row is
//       created here — listings are born only when the vendor
//       hits Create listing in the profile tab.
//     - If the email already belongs to an auth user (confirmed or
//       not), refuses with reason="account_exists" rather than
//       overwriting the existing password. The old fallback was an
//       ATO path on unconfirmed accounts.
//     - Marks the code used. Client signInWithPassword to get a
//       session.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const REQUEST_MIN_INTERVAL_MS = 60_000;
const REQUEST_WINDOW_MS = 3_600_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function admin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase admin credentials not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time equality for two equal-length hex strings. Both
// sides are SHA-256 digests (64 hex chars). Plain === has an
// early-exit timing characteristic; this loops the full length
// regardless of whether bytes match.
function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function randomCode(): string {
  // Rejection-sample to avoid modulo bias: 2^32 is not a multiple of
  // 1e6, so a bare % skews probability toward lower codes.
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  let r = crypto.getRandomValues(new Uint32Array(1))[0];
  while (r >= limit) {
    r = crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return (r % 1_000_000).toString().padStart(6, "0");
}

// Find an auth user by email, paging through listUsers. The admin API
// has no email filter and listUsers() defaults to just the first 50
// users — a bare call silently misses everyone past page 1 once the
// project grows past 50 accounts.
async function findUserByEmail(sb: any, email: string): Promise<any | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const users = (data?.users ?? []) as any[];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
}

// Sent in place of the 6-digit code when /request is invoked with an
// email that's already a confirmed user. Keeps the API response shape
// identical to a fresh signup so the endpoint can't be used to
// enumerate which emails are registered — the differentiation happens
// privately in the user's inbox instead of in the JSON response.
async function sendAlreadyRegisteredEmail(email: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const loginUrl = "https://eventvendora.com/login/vendor";
  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
      <tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" /></td></tr>
      <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">You already have an account</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">
        <p style="margin:0 0 16px;">Someone (probably you) just tried to sign up for Vendora as a vendor with this email, but you already have an account. Tap below to log in:</p>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${loginUrl}" style="display:inline-block;background:#1a1410;color:#faf5ec;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;padding:14px 28px;">Log in to Vendora</a>
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#555;">If you didn't try to sign up, you can safely ignore this email — nothing has changed on your account.</p>
      </td></tr>
      <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">Vendora · Premium event planning &amp; vendor marketplace</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: email,
      subject: "You already have a Vendora account",
      html,
    }),
  });
  if (!r.ok) {
    console.error("Resend already-registered send failed", r.status, await r.text());
    return false;
  }
  return true;
}

async function sendCodeEmail(email: string, code: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const cleanCode = String(code).replace(/[^0-9]/g, "").slice(0, 6);
  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
      <tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" /></td></tr>
      <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">Confirm your vendor account</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">
        <p style="margin:0 0 16px;">Use this 6-digit code to finish creating your Vendora vendor account:</p>
        <p style="margin:0 0 24px;text-align:center;">
          <span style="display:inline-block;font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:34px;letter-spacing:0.4em;font-weight:600;color:#1a1a1a;background:#f7f5f2;border:1px solid #ececec;border-radius:8px;padding:18px 28px;">${cleanCode}</span>
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#555;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </td></tr>
      <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">Vendora · Premium event planning &amp; vendor marketplace</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: email,
      subject: `Your Vendora vendor confirmation code is ${cleanCode}`,
      html,
    }),
  });
  if (!r.ok) {
    console.error("Resend send failed", r.status, await r.text());
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: { action?: string } & Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = String(body.action ?? "");
  const sb = admin();

  if (action === "request") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "email required" }, 400);

    // If there's already a confirmed user with this email, swap the
    // 6-digit code for a "you already have an account" email and
    // return the SAME success shape as a fresh signup. The API can no
    // longer be used to enumerate registered emails — the user finds
    // out from their inbox, not from the JSON response.
    const existingUser = await findUserByEmail(sb, email);
    const taken =
      existingUser != null && existingUser.email_confirmed_at != null;
    if (taken) {
      // Return success shape regardless to avoid leaking which emails
      // are registered. Log on failure so we'd notice in dashboards.
      const sent = await sendAlreadyRegisteredEmail(email);
      if (!sent) {
        console.error(
          "[vendor-signup] sendAlreadyRegisteredEmail failed",
          { email },
        );
      }
      return json({ ok: true, expiresInMinutes: CODE_TTL_MIN });
    }

    // Per-email rate limit. Two tiers:
    //   60s floor between requests (anti-spam) and
    //   5 requests / hour (anti-brute-force).
    // Throttled requests return the success shape so the endpoint
    // can't be used to probe whether an email is in cool-down.
    const now = Date.now();
    const { data: existingCode } = await sb
      .from("vendor_signup_codes")
      .select(
        "requested_at, request_count_window, request_window_started_at",
      )
      .eq("email", email)
      .maybeSingle();

    let requestCountWindow = 1;
    let windowStartedAtIso = new Date(now).toISOString();
    if (existingCode) {
      const ec = existingCode as {
        requested_at: string | null;
        request_count_window: number | null;
        request_window_started_at: string | null;
      };
      if (
        ec.requested_at &&
        new Date(ec.requested_at).getTime() + REQUEST_MIN_INTERVAL_MS > now
      ) {
        return json({ ok: true, expiresInMinutes: CODE_TTL_MIN });
      }
      if (ec.request_window_started_at) {
        const winStart = new Date(ec.request_window_started_at).getTime();
        if (now - winStart < REQUEST_WINDOW_MS) {
          if ((ec.request_count_window ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
            return json({ ok: true, expiresInMinutes: CODE_TTL_MIN });
          }
          requestCountWindow = (ec.request_count_window ?? 0) + 1;
          windowStartedAtIso = ec.request_window_started_at;
        }
      }
    }

    const code = randomCode();
    const code_hash = await sha256(code);
    const expires_at = new Date(now + CODE_TTL_MIN * 60_000).toISOString();

    const { error: upErr } = await sb
      .from("vendor_signup_codes")
      .upsert(
        {
          email,
          code_hash,
          expires_at,
          attempts: 0,
          used_at: null,
          requested_at: new Date(now).toISOString(),
          request_count_window: requestCountWindow,
          request_window_started_at: windowStartedAtIso,
        },
        { onConflict: "email" },
      );
    if (upErr) return json({ error: upErr.message }, 500);

    const sent = await sendCodeEmail(email, code);
    if (!sent) return json({ error: "Failed to send code" }, 500);

    return json({ ok: true, expiresInMinutes: CODE_TTL_MIN });
  }

  if (action === "verify") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const password = String(body.password ?? "");
    const businessName = String(body.businessName ?? "").trim();
    const category = String(body.category ?? "").trim();
    if (!email || !code || !password) {
      return json({ error: "email + code + password required" }, 400);
    }
    if (password.length < 8) {
      return json({ ok: false, reason: "weak_password" }, 200);
    }

    const { data: row, error: selErr } = await sb
      .from("vendor_signup_codes")
      .select("email, code_hash, expires_at, used_at, attempts")
      .eq("email", email)
      .is("used_at", null)
      .maybeSingle();
    if (selErr) return json({ error: selErr.message }, 500);
    if (!row) return json({ ok: false, reason: "no_pending_code" }, 200);

    const r = row as {
      email: string;
      code_hash: string;
      expires_at: string;
      used_at: string | null;
      attempts: number;
    };

    if (new Date(r.expires_at).getTime() < Date.now()) {
      return json({ ok: false, reason: "expired" }, 200);
    }
    if (r.attempts >= MAX_ATTEMPTS) {
      return json({ ok: false, reason: "too_many_attempts" }, 200);
    }

    const hash = await sha256(code);
    if (!constantTimeHexEqual(hash, r.code_hash)) {
      await sb
        .from("vendor_signup_codes")
        .update({ attempts: r.attempts + 1 })
        .eq("email", email);
      return json({ ok: false, reason: "wrong_code" }, 200);
    }

    const userMeta: Record<string, unknown> = { intended_role: "vendor" };
    if (businessName) userMeta.vendor_business_name = businessName;
    if (category) userMeta.vendor_category = category;

    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMeta,
    });
    if (createErr) {
      // ATO defense: the old fallback called updateUserById with the
      // attacker-supplied password whenever createUser said the email
      // existed. Combined with /request's lack of rate-limiting, that
      // let an attacker brute-force a code for any unconfirmed
      // account, then overwrite its password on /verify. We no longer
      // do that — if the email is already taken we mark the code used
      // (so it can't be replayed) and tell the caller to sign in.
      await sb
        .from("vendor_signup_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("email", email);
      const msg = createErr.message ?? "";
      if (/already (registered|exists)/i.test(msg)) {
        return json({ ok: false, reason: "account_exists" }, 200);
      }
      return json({ error: createErr.message }, 500);
    }

    await sb
      .from("vendor_signup_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("email", email);

    return json({
      ok: true,
      userId: created?.user?.id ?? null,
    });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
