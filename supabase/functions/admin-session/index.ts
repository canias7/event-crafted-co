// PIN-gated admin login. Mints a Supabase session for the admin account
// SERVER-SIDE and returns the tokens, bypassing the project-level CAPTCHA
// protection that blocks the admin app's headless signInWithPassword.
//
// Why this exists: the public web login uses Cloudflare Turnstile, so
// project Auth has CAPTCHA protection ON. The admin app signs in silently
// with no captcha token, so GoTrue rejects it ("captcha protection:
// request disallowed"). Instead of weakening the public site (turning
// captcha off) or bolting a captcha widget onto the admin, the admin now
// authenticates here: we verify the PIN, then mint a session with the
// service-role admin API (generateLink) + /verify, neither of which is
// captcha-gated.
//
// Security model:
//   - The PIN is the gate, verified server-side (NOT baked into the client
//     bundle). Source of truth: the ADMIN_PIN env secret if set, else the
//     Vault-backed admin_pin checked via the admin_pin_ok RPC.
//   - A session is only ever minted for an account whose profiles.role
//     = 'admin'. A caller-supplied email (if any) must resolve to that
//     admin; otherwise we fall back to the sole admin account.
//   - Per-IP rate limiting (admin_login_attempts) bounds PIN brute force.
//
// verify_jwt=false (config.toml): the caller has no session yet — that's
// the whole point of this endpoint.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_PIN = Deno.env.get("ADMIN_PIN") ?? "";

// Brute-force throttle: at most MAX_FAILS wrong PINs per IP per WINDOW_MIN.
const MAX_FAILS = 10;
const WINDOW_MIN = 15;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
// Constant-time-ish compare so a wrong PIN can't be timed character by
// character.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const windowStart = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

  try {
    // Opportunistic prune so the table doesn't grow unbounded.
    await admin.from("admin_login_attempts").delete().lt("attempted_at", windowStart);

    // Rate limit: how many recent FAILED attempts from this IP?
    const { count } = await admin
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("attempted_at", windowStart);
    if ((count ?? 0) >= MAX_FAILS) {
      return json(429, {
        error: "too_many_attempts",
        message: "Too many attempts. Try again later.",
      });
    }

    const body = await req.json().catch(() => ({}));
    const pin = String(body?.pin ?? "");
    const wantEmail = String(body?.email ?? "").trim().toLowerCase();

    // PIN source of truth: the ADMIN_PIN env secret if an operator set one,
    // otherwise the Vault-backed admin_pin (checked via the admin_pin_ok RPC,
    // which returns null when nothing is configured). Keeping the env path
    // lets an operator override without a redeploy.
    let pinOk: boolean;
    if (ADMIN_PIN) {
      pinOk = !!pin && safeEqual(pin, ADMIN_PIN);
    } else {
      const { data: rpcOk, error: rpcErr } = await admin.rpc("admin_pin_ok", {
        provided: pin,
      });
      if (rpcErr) {
        console.error("[admin-session] admin_pin_ok failed", rpcErr);
        return json(500, { error: "admin_login_failed" });
      }
      if (rpcOk === null || rpcOk === undefined) {
        return json(500, {
          error: "admin_login_not_configured",
          message: "Admin PIN is not configured.",
        });
      }
      pinOk = rpcOk === true;
    }

    if (!pinOk) {
      await admin.from("admin_login_attempts").insert({ ip });
      return json(401, { error: "invalid_pin" });
    }

    // Resolve the admin account. Pull every profiles.role='admin', then map
    // to emails. If the caller named an email, it must be one of them.
    const { data: adminRows } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    const ids = ((adminRows as Array<{ id: string }> | null) ?? []).map((r) => r.id);
    if (ids.length === 0) {
      return json(500, { error: "no_admin_account" });
    }

    let targetEmail: string | null = null;
    for (const id of ids) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      const email = u?.user?.email?.toLowerCase() ?? null;
      if (!email) continue;
      if (!wantEmail || wantEmail === email) {
        targetEmail = u!.user!.email!; // preserve original casing for GoTrue
        break;
      }
    }
    if (!targetEmail) {
      // PIN was right, but the supplied email isn't an admin account.
      return json(403, { error: "not_admin" });
    }

    // Mint a session WITHOUT the captcha-protected password flow:
    //   generateLink (service-role admin API) -> hashed_token -> /verify.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    });
    const hashed = (link as any)?.properties?.hashed_token as string | undefined;
    if (linkErr || !hashed) {
      console.error("[admin-session] generateLink failed", linkErr);
      return json(500, { error: "link_failed" });
    }

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      token_hash: hashed,
      type: "email",
    });
    const session = verified?.session;
    if (verifyErr || !session) {
      console.error("[admin-session] verify failed", verifyErr);
      return json(500, { error: "verify_failed" });
    }

    // Success — clear this IP's failed attempts.
    await admin.from("admin_login_attempts").delete().eq("ip", ip);

    return json(200, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    });
  } catch (err) {
    console.error("[admin-session] error", err);
    return json(500, { error: "admin_login_failed" });
  }
});
