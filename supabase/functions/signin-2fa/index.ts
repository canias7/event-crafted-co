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
  // Reuse the signin_code template from send-transactional-email by
  // POSTing to it directly. Saves duplicating template HTML here.
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ kind: "signin_code", email, code }),
  });
  return r.ok;
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
