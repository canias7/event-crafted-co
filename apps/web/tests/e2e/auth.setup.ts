import { test as setup } from "@playwright/test";
import type { Session } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { HOST_AUTH_FILE, VENDOR_AUTH_FILE } from "./auth.paths";

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
const VENDOR_EMAIL = process.env.E2E_VENDOR_EMAIL || "";
const VENDOR_PASSWORD = process.env.E2E_VENDOR_PASSWORD || "";
// Fixed seeded test host (has inquiries as a host). No password — signs in
// via the service-role admin OTP path only.
const HOST_EMAIL = "e2e-host-1@eventvendora.test";
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:8080";

function writeState(authFile: string, state: unknown) {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  fs.writeFileSync(authFile, JSON.stringify(state));
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
async function sessionViaServiceRole(email: string): Promise<Session> {
  const linkRes = await gotrue("admin/generate_link", SERVICE_ROLE_KEY, {
    type: "magiclink",
    email,
  });
  if (!linkRes.ok) {
    throw new Error(`generate_link ${linkRes.status}: ${await linkRes.text()}`);
  }
  const link = await linkRes.json();
  // GoTrue returns the OTP at the top level or under `properties`.
  const otp: string | undefined = link?.email_otp ?? link?.properties?.email_otp;
  if (!otp) throw new Error("generate_link returned no email_otp");

  const verifyRes = await gotrue("verify", SUPABASE_ANON_KEY, {
    type: "email",
    email,
    token: otp,
  });
  if (!verifyRes.ok) {
    throw new Error(`verify ${verifyRes.status}: ${await verifyRes.text()}`);
  }
  const session = (await verifyRes.json()) as Session;
  if (!session?.access_token) throw new Error("verify returned no access_token");
  return session;
}

// Fallback for projects WITHOUT auth captcha (password grant).
async function sessionViaPassword(email: string, password: string): Promise<Session> {
  const res = await gotrue("token?grant_type=password", SUPABASE_ANON_KEY, {
    email,
    password,
  });
  if (!res.ok) {
    throw new Error(`password grant ${res.status}: ${await res.text()}`);
  }
  const session = (await res.json()) as Session;
  if (!session?.access_token) throw new Error("password grant returned no access_token");
  return session;
}

// Seed the supabase-js session into a storage-state file exactly as the
// browser client would persist it (key `sb-<project-ref>-auth-token`).
function persist(authFile: string, session: Session) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  writeState(authFile, {
    cookies: [],
    origins: [
      {
        origin: new URL(BASE_URL).origin,
        localStorage: [
          { name: `sb-${ref}-auth-token`, value: JSON.stringify(session) },
        ],
      },
    ],
  });
}

const baseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Always produce a storage-state file so the authed projects can load it even
// when creds aren't configured (their tests then skip), keeping CI green.
setup("authenticate as a vendor", async () => {
  const canServiceRole = Boolean(baseConfigured && VENDOR_EMAIL && SERVICE_ROLE_KEY);
  const canPassword = Boolean(baseConfigured && VENDOR_EMAIL && VENDOR_PASSWORD);
  if (!canServiceRole && !canPassword) {
    writeState(VENDOR_AUTH_FILE, { cookies: [], origins: [] });
    return;
  }
  const session = canServiceRole
    ? await sessionViaServiceRole(VENDOR_EMAIL)
    : await sessionViaPassword(VENDOR_EMAIL, VENDOR_PASSWORD);
  persist(VENDOR_AUTH_FILE, session);
});

setup("authenticate as a host", async () => {
  // Host has no password — only the captcha-free service-role path works.
  if (!baseConfigured || !SERVICE_ROLE_KEY) {
    writeState(HOST_AUTH_FILE, { cookies: [], origins: [] });
    return;
  }
  const session = await sessionViaServiceRole(HOST_EMAIL);
  persist(HOST_AUTH_FILE, session);
});
