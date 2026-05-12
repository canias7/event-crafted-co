// Email-code 2FA for sign-in. Two actions on a single endpoint:
//
//   POST {action: "request", email, password}
//     - Verifies password against auth.users via verify_user_password RPC
//     - Generates a 6-digit code, stores hash in signin_2fa_codes
//     - Sends the code to the email via Resend (same FROM as other Vendora mail)
//     - Returns {ok: true} (never returns the code itself)
//
//   POST {action: "verify", email, code}
//     - Looks up the most recent unused, unexpired code for this email
//     - Compares hash (constant-time)
//     - On success, marks used_at and returns {ok: true}
//     - On failure, increments attempts and returns {ok: false, reason}

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

function randomCode(): string {
  // 6-digit numeric code, zero-padded
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

async function sendCodeEmail(email: string, code: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  // Hit Resend directly. We used to forward to send-transactional-email
  // and reuse its template, but the auto-injected SUPABASE_SERVICE_ROLE_KEY
  // no longer round-trips through that function's verify_jwt gate
  // (Supabase rolled out a new key format that fails the JWT check).
  // Inlining the template here is one HTTP hop fewer and avoids the
  // inter-function auth issue entirely.
  const cleanCode = String(code).replace(/[^0-9]/g, "").slice(0, 6);
  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
      <tr><td style="font-size:14px;letter-spacing:0.18em;color:#a08259;text-transform:uppercase;padding-bottom:24px;">— Vendora</td></tr>
      <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">Your sign-in code</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">
        <p style="margin:0 0 16px;">Use this 6-digit code to finish signing in to Vendora:</p>
        <p style="margin:0 0 24px;text-align:center;">
          <span style="display:inline-block;font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:34px;letter-spacing:0.4em;font-weight:600;color:#1a1a1a;background:#f7f5f2;border:1px solid #ececec;border-radius:8px;padding:18px 28px;">${cleanCode}</span>
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#555;">This code expires in 10 minutes. Don't share it with anyone — Vendora will never ask for it.</p>
      </td></tr>
      <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">Vendora · Premium event planning &amp; vendor marketplace</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  // 10s timeout — if Resend stalls, fail the request fast so the
  // signed-in user can retry rather than wait on a hung function.
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
        subject: `Your Vendora sign-in code is ${cleanCode}`,
        html,
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof DOMException && e.name === "AbortError";
    console.error("Resend send failed", aborted ? "timeout" : String(e));
    return false;
  }
  clearTimeout(timeout);
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
    const password = String(body.password ?? "");
    if (!email || !password) return json({ error: "email + password required" }, 400);

    // Verify password via SECURITY DEFINER RPC.
    const { data: result, error: vErr } = await sb.rpc("verify_user_password", {
      p_email: email,
      p_password: password,
    });
    if (vErr) return json({ error: "Verification failed" }, 500);
    const status = (result as { status?: string } | null)?.status;
    if (status === "invalid_credentials") return json({ ok: false, reason: "invalid_credentials" }, 200);
    if (status === "banned") return json({ ok: false, reason: "banned" }, 200);
    // Don't email a 6-digit code to an account that can't actually
    // sign in. Pending vendor applicants land here with email_confirmed_at
    // null until admin approves their application.
    if (status === "not_confirmed") return json({ ok: false, reason: "not_confirmed" }, 200);
    if (status !== "ok") return json({ ok: false, reason: "unknown" }, 200);

    // Optional per-app role gate. Each mobile app passes `app` so we
    // reject cross-app sign-ins (vendor email → host app, host email
    // → vendor app) BEFORE emailing a code. Admins bypass.
    const app = String(body.app ?? "").trim().toLowerCase();
    if (app === "host" || app === "vendor") {
      const userId = (result as { user_id?: string } | null)?.user_id;
      if (userId) {
        const { data: prof } = await sb
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        const role = (prof as { role?: string } | null)?.role ?? "host";
        if (role !== "admin" && role !== app) {
          return json({ ok: false, reason: "wrong_app" }, 200);
        }
      }
    }

    // Invalidate any earlier unused codes for this email.
    await sb
      .from("signin_2fa_codes")
      .update({ used_at: new Date().toISOString() })
      .is("used_at", null)
      .eq("email", email);

    const code = randomCode();
    const code_hash = await sha256(code);
    const expires_at = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();
    const { error: insErr } = await sb.from("signin_2fa_codes").insert({
      email,
      code_hash,
      expires_at,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    const sent = await sendCodeEmail(email, code);
    if (!sent) return json({ error: "Failed to send code" }, 500);

    return json({ ok: true, expiresInMinutes: CODE_TTL_MIN });
  }

  if (action === "verify") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    if (!email || !code) return json({ error: "email + code required" }, 400);

    const { data: row, error: selErr } = await sb
      .from("signin_2fa_codes")
      .select("id, code_hash, expires_at, used_at, attempts")
      .eq("email", email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) return json({ error: selErr.message }, 500);
    if (!row) return json({ ok: false, reason: "no_pending_code" }, 200);

    const r = row as {
      id: string;
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
    if (hash !== r.code_hash) {
      await sb
        .from("signin_2fa_codes")
        .update({ attempts: r.attempts + 1 })
        .eq("id", r.id);
      return json({ ok: false, reason: "invalid_code" }, 200);
    }

    await sb
      .from("signin_2fa_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", r.id);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
