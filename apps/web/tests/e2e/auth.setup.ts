import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { HOST_AUTH_FILE, VENDOR_AUTH_FILE } from "./auth.paths";
import { sessionViaPassword, sessionViaServiceRole, storageStateFor, type SessionConfig } from "./session";

// Credentials + project config come from the environment so no secrets live
// in the repo. Reuse the same VITE_* vars the dev server already needs as
// sensible defaults.
const cfg: SessionConfig = {
  supabaseUrl: process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  anonKey: process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  // Service-role key enables a CAPTCHA-FREE sign-in (see session.ts).
  serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "",
};
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

const baseConfigured = Boolean(cfg.supabaseUrl && cfg.anonKey);

// Always produce a storage-state file so the authed projects can load it even
// when creds aren't configured (their tests then skip), keeping CI green.
setup("authenticate as a vendor", async () => {
  const canServiceRole = Boolean(baseConfigured && VENDOR_EMAIL && cfg.serviceRoleKey);
  const canPassword = Boolean(baseConfigured && VENDOR_EMAIL && VENDOR_PASSWORD);
  if (!canServiceRole && !canPassword) {
    writeState(VENDOR_AUTH_FILE, { cookies: [], origins: [] });
    return;
  }
  const session = canServiceRole
    ? await sessionViaServiceRole(cfg, VENDOR_EMAIL)
    : await sessionViaPassword(cfg, VENDOR_EMAIL, VENDOR_PASSWORD);
  writeState(VENDOR_AUTH_FILE, storageStateFor(cfg, BASE_URL, session));
});

setup("authenticate as a host", async () => {
  // Host has no password — only the captcha-free service-role path works.
  if (!baseConfigured || !cfg.serviceRoleKey) {
    writeState(HOST_AUTH_FILE, { cookies: [], origins: [] });
    return;
  }
  const session = await sessionViaServiceRole(cfg, HOST_EMAIL);
  writeState(HOST_AUTH_FILE, storageStateFor(cfg, BASE_URL, session));
});
