import { test as setup } from "@playwright/test";
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

// We hit the GoTrue REST endpoints with plain fetch rather than the
// supabase-js client: createClient() spins up a realtime client that needs a
// WebSocket, which Node < 22 (CI's runner) doesn't provide natively — it
// throws before we ever reach auth. fetch needs none of that.
const gotrue = (suffix: string, apikey: string, body: unknown) =>
  fetch(`${SUPABASE_URL}/auth/v1/${suffix}`, {
    method: "POST",
    headers: {
      apikey,
      authorization: `Bearer ${apikey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

// Captcha-free: ask the admin API for a one-time magic-link OTP (admin calls
// aren't captcha-gated), then verify it for a session. Requires service role.
async function sessionViaServiceRole(): Promise<Session> {
  const linkRes = await gotrue(
    "admin/generate_link",
    SERVICE_ROLE_KEY,
    { type: "magiclink", email: EMAIL },
  );
  if (!linkRes.ok) {
    throw new Error(`generate_link ${linkRes.status}: ${await linkRes.text()}`);
  }
  const link = await linkRes.json();
  // GoTrue returns the OTP at the top level or under `properties`.
  const otp: string | undefined = link?.email_otp ?? link?.properties?.email_otp;
  if (!otp) throw new Error("generate_link returned no email_otp");

  const verifyRes = await gotrue("verify", SUPABASE_ANON_KEY, {
    type: "email",
    email: EMAIL,
    token: otp,
  });
  if (!verifyRes.ok) {
    throw new Error(`verify ${verifyRes.status}: ${await verifyRes.text()}`);
  }
  const session = (await verifyRes.json()) as Session;
  if (!session?.access_token) throw new Error("verify returned no access_token");
  return session;
}

// Fallback for projects WITHOUT auth captcha.
async function sessionViaPassword(): Promise<Session> {
  const res = await gotrue(
    "token?grant_type=password",
    SUPABASE_ANON_KEY,
    { email: EMAIL, password: PASSWORD },
  );
  if (!res.ok) {
    throw new Error(`password grant ${res.status}: ${await res.text()}`);
  }
  const session = (await res.json()) as Session;
  if (!session?.access_token) throw new Error("password grant returned no access_token");
  return session;
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
