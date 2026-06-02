import { test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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
const EMAIL = process.env.E2E_VENDOR_EMAIL || "";
const PASSWORD = process.env.E2E_VENDOR_PASSWORD || "";
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:8080";

function writeState(state: unknown) {
  fs.mkdirSync(path.dirname(VENDOR_AUTH_FILE), { recursive: true });
  fs.writeFileSync(VENDOR_AUTH_FILE, JSON.stringify(state));
}

// Always produce a storage-state file so the authed project can load it
// even when credentials aren't configured (its tests then skip). When
// credentials ARE present, sign in via the Supabase REST auth endpoint
// (avoids the login form's captcha) and seed the supabase-js session into
// localStorage exactly as the browser client would persist it.
setup("authenticate as a vendor", async () => {
  if (!EMAIL || !PASSWORD || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Unconfigured — write an empty (unauthenticated) state; authed tests
    // detect the missing creds and skip, keeping CI green.
    writeState({ cookies: [], origins: [] });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`E2E vendor sign-in failed: ${error?.message ?? "no session"}`);
  }

  // supabase-js persists the session under `sb-<project-ref>-auth-token`.
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${ref}-auth-token`;

  writeState({
    cookies: [],
    origins: [
      {
        origin: new URL(BASE_URL).origin,
        localStorage: [
          { name: storageKey, value: JSON.stringify(data.session) },
        ],
      },
    ],
  });
});
