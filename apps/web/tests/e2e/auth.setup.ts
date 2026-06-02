import { test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { VENDOR_AUTH_FILE } from "./auth.paths";

// Credentials + project config come from the environment so no secrets live
// in the repo. Reuse the same VITE_* vars the dev server already needs as
// sensible defaults.
const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";
// Service-role key enables a CAPTCHA-FREE sign-in: this project enforces
// server-side auth captcha, so the public password/magiclink endpoints
// reject browserless logins. The admin API isn't captcha-gated, so we mint
// a one-time magic-link OTP as admin and verify it for a real session.
const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL = process.env.E2E_VENDOR_EMAIL || "";
const PASSWORD = process.env.E2E_VENDOR_PASSWORD || "";
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:8080";

function writeState(state: unknown) {
  fs.mkdirSync(path.dirname(VENDOR_AUTH_FILE), { recursive: true });
  fs.writeFileSync(VENDOR_AUTH_FILE, JSON.stringify(state));
}

// Captcha-free: ask the admin API for a magic-link OTP, then verify it for
// a session. Requires the service-role key.
async function sessionViaServiceRole(): Promise<Session> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (linkErr || !link.properties?.email_otp) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no email_otp"}`);
  }
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.verifyOtp({
    email: EMAIL,
    token: link.properties.email_otp,
    type: "email",
  });
  if (error || !data.session) {
    throw new Error(`verifyOtp failed: ${error?.message ?? "no session"}`);
  }
  return data.session;
}

// Fallback for projects WITHOUT auth captcha.
async function sessionViaPassword(): Promise<Session> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`signInWithPassword failed: ${error?.message ?? "no session"}`);
  }
  return data.session;
}

// Always produce a storage-state file so the authed project can load it even
// when credentials aren't configured (its tests then skip). When configured,
// sign in and seed the supabase-js session into localStorage exactly as the
// browser client would persist it.
setup("authenticate as a vendor", async () => {
  const canServiceRole = Boolean(EMAIL && SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_ROLE_KEY);
  const canPassword = Boolean(EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY);
  if (!canServiceRole && !canPassword) {
    // Unconfigured — write an empty (unauthenticated) state; authed tests
    // detect the missing creds and skip, keeping CI green.
    writeState({ cookies: [], origins: [] });
    return;
  }

  const session = canServiceRole
    ? await sessionViaServiceRole()
    : await sessionViaPassword();

  // supabase-js persists the session under `sb-<project-ref>-auth-token`.
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${ref}-auth-token`;

  writeState({
    cookies: [],
    origins: [
      {
        origin: new URL(BASE_URL).origin,
        localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
      },
    ],
  });
});
