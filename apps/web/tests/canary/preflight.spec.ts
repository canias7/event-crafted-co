import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { missingAuthVars, OPTIONAL_VARS, REQUIRED_AUTH_VARS } from "./env";
import { RESULTS_DIR } from "./paths";

// Fails (never skips) when the configuration the REQUIRED authenticated
// coverage needs is missing. Public checks run in other projects regardless,
// so a misconfigured canary still reports on the public site — but it can't
// come out green.
test("preflight: required authenticated-coverage secrets are configured", async ({}, testInfo) => {
  const inventory = {
    required: REQUIRED_AUTH_VARS.map((v) => ({ ...v, set: Boolean(process.env[v.name]) })),
    optional: OPTIONAL_VARS.map((v) => ({
      ...v,
      set: v.name.split(" / ").every((n) => Boolean(process.env[n.trim()])),
    })),
  };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, "preflight.json"), JSON.stringify(inventory, null, 2));

  const missing = missingAuthVars();
  for (const name of missing) testInfo.annotations.push({ type: "blocker", description: `missing secret ${name}` });
  expect(
    missing,
    `Missing required secret(s): ${missing.join(", ")}. Authenticated vendor coverage is BLOCKED until they are set (Settings → Secrets and variables → Actions).`,
  ).toEqual([]);
});
