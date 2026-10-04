import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { sessionViaServiceRole, storageStateFor, type SessionConfig } from "../e2e/session";
import {
  AUTH_CONFIGURED,
  BASE_URL,
  BLOCKED_REASON,
  HOST_EMAIL,
  SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  VENDOR_EMAIL,
} from "./env";
import { CANARY_HOST_STATE, CANARY_VENDOR_STATE } from "./paths";

// Seeds ONE session per dedicated test account and writes it to a storage
// state file under tests/canary/.auth (git-ignored and never uploaded as an
// artifact — it contains tokens). Minting once avoids the admin-OTP race when
// the same user's OTP is generated concurrently.
//
// This is a SEEDED session (admin OTP → verify), not a login through the UI.

const cfg: SessionConfig = {
  supabaseUrl: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  serviceRoleKey: SERVICE_ROLE_KEY,
};

function write(file: string, state: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
}

setup.describe("seeded sessions", () => {
  setup.describe.configure({ mode: "serial" });

  setup("seed vendor session (dedicated test vendor)", async ({}, testInfo) => {
    if (!AUTH_CONFIGURED) {
      write(CANARY_VENDOR_STATE, { cookies: [], origins: [] });
      setup.skip(true, BLOCKED_REASON);
    }
    testInfo.annotations.push({ type: "session", description: "seeded via admin OTP (not a UI login)" });
    const session = await sessionViaServiceRole(cfg, VENDOR_EMAIL);
    expect(session.user?.id, "seeded vendor session has a user").toBeTruthy();
    write(CANARY_VENDOR_STATE, storageStateFor(cfg, BASE_URL, session));
  });

  setup("seed host session (dedicated test host)", async ({}, testInfo) => {
    if (!AUTH_CONFIGURED) {
      write(CANARY_HOST_STATE, { cookies: [], origins: [] });
      setup.skip(true, BLOCKED_REASON);
    }
    testInfo.annotations.push({ type: "session", description: "seeded via admin OTP (not a UI login)" });
    const session = await sessionViaServiceRole(cfg, HOST_EMAIL);
    write(CANARY_HOST_STATE, storageStateFor(cfg, BASE_URL, session));
  });
});
