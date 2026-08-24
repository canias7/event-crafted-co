// Password-reset request endpoint. Replaces the client-side
// supabase.auth.resetPasswordForEmail call, which the project's
// bot/abuse captcha blocks on native (no widget to render). We mint a
// recovery link with the service role (captcha-exempt) via
// admin.generateLink and email it ourselves through Resend.
//
//   POST {action: "request"?, email, redirectTo}
//     - Two-tier per-email rate limit (60s floor + 5/hour).
//     - generateLink({type:'recovery'}) to mint the token.
//     - Anti-enumeration: unknown/unconfirmed email returns ok:true
//       WITHOUT sending, identical shape to a real send.
//
// We email properties.hashed_token on our OWN https landing page rather
// than GoTrue's /verify action_link. The action link failed two ways:
//
//   1. It is a one-time GET that burns the token. Mail scanners and
//      link previewers fetch every URL in an email, so by the time the
//      recipient tapped it GoTrue had already spent it and answered
//      "otp_expired" — "expired every single time", seconds after
//      delivery.
//   2. On success it 303s to <scheme>://reset-password#access_token=…,
//      and that fragment does not survive the browser -> custom-scheme
//      handoff. The app opened on the right screen with no URL at all.
//
// A token_hash sitting in a query string is inert until something POSTs
// it to /verify, so scanners can't burn it, and query params survive the
// handoff (expo-router parses them straight into route params). The app
// — or the landing page, if the app isn't installed — redeems it with
// supabase.auth.verifyOtp({type:'recovery', token_hash}).
//
// redirectTo must be one of our app schemes; it selects which app the
// landing page hands off to, and stops the endpoint being used to mint
// recovery links pointing at arbitrary targets.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const WEB_ORIGIN =
  Deno.env.get("PUBLIC_WEB_ORIGIN") ?? "https://eventvendora.com";

const REQUEST_MIN_INTERVAL_MS = 60_000;
const REQUEST_WINDOW_MS = 3_600_000;
const MAX_REQUESTS_PER_WINDOW = 5;
// Prefix -> the ?app= slug the landing page uses to pick a scheme.
const ALLOWED_REDIRECTS: Record<string, string> = {
  "vendora-vendor://": "vendor",
  "vendora-host://": "host",
};

function appSlugFor(redirectTo: string): string | null {
  for (const [prefix, slug] of Object.entries(ALLOWED_REDIRECTS)) {
    if (redirectTo.startsWith(prefix)) return slug;
  }
  return null;
}

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

async function sendResetEmail(email: string, link: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
      <tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" /></td></tr>
      <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">Reset your password</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">
        <p style="margin:0 0 16px;">Tap the button below on this device to choose a new Vendora password. You can finish in the app or right in your browser.</p>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${link}" style="display:inline-block;background:#1a1410;color:#faf5ec;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;padding:14px 28px;">Set a new password</a>
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#555;">This link expires in 1 hour and can be used once. If you didn't request a reset, you can safely ignore this email — your password won't change.</p>
      </td></tr>
      <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">Vendora · Premium event planning &amp; vendor marketplace</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10_000);
  let r: Response;
  try {
    r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email,
        subject: "Reset your Vendora password",
        html,
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof DOMException && e.name === "AbortError";
    console.error("Resend reset send failed", aborted ? "timeout" : String(e));
    return false;
  }
  clearTimeout(timeout);
  if (!r.ok) {
    console.error("Resend reset send failed", r.status, await r.text());
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const redirectTo = String(body.redirectTo ?? "").trim();
  if (!email) return json({ error: "email required" }, 400);
  const appSlug = redirectTo ? appSlugFor(redirectTo) : null;
  if (!appSlug) return json({ error: "invalid redirectTo" }, 400);

  const sb = admin();
  const now = Date.now();

  // Two-tier per-email rate limit. Throttled requests return the same
  // success shape so the endpoint can't be used to probe state.
  const { data: existing } = await sb
    .from("password_reset_requests")
    .select("requested_at, request_count_window, request_window_started_at")
    .eq("email", email)
    .maybeSingle();

  let requestCountWindow = 1;
  let windowStartedAtIso = new Date(now).toISOString();
  if (existing) {
    const ec = existing as {
      requested_at: string | null;
      request_count_window: number | null;
      request_window_started_at: string | null;
    };
    if (
      ec.requested_at &&
      new Date(ec.requested_at).getTime() + REQUEST_MIN_INTERVAL_MS > now
    ) {
      return json({ ok: true });
    }
    if (ec.request_window_started_at) {
      const winStart = new Date(ec.request_window_started_at).getTime();
      if (now - winStart < REQUEST_WINDOW_MS) {
        if ((ec.request_count_window ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
          return json({ ok: true });
        }
        requestCountWindow = (ec.request_count_window ?? 0) + 1;
        windowStartedAtIso = ec.request_window_started_at;
      }
    }
  }

  // Record the attempt up-front so probing unknown emails is throttled
  // the same as real ones (no existence leak via rate behavior).
  await sb.from("password_reset_requests").upsert(
    {
      email,
      requested_at: new Date(now).toISOString(),
      request_count_window: requestCountWindow,
      request_window_started_at: windowStartedAtIso,
    },
    { onConflict: "email" },
  );

  // Mint the recovery link with the service role (captcha-exempt). On
  // any error (unknown email, unconfirmed user, etc.) we return the
  // success shape WITHOUT sending — anti-enumeration.
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  const props =
    (linkData as {
      properties?: { action_link?: string; hashed_token?: string };
    } | null)?.properties ?? null;

  // Preferred: our landing page carrying the raw token_hash (see the
  // note at the top). action_link is only a fallback for the case where
  // a future GoTrue stops returning hashed_token — it still works, it
  // is just the scanner-vulnerable path.
  const link = props?.hashed_token
    ? `${WEB_ORIGIN}/reset-password?token_hash=${
      encodeURIComponent(props.hashed_token)
    }&type=recovery&app=${appSlug}`
    : props?.action_link ?? null;
  if (linkErr || !link) {
    return json({ ok: true });
  }

  await sendResetEmail(email, link);
  return json({ ok: true });
});
