import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { CANARY_VENDOR_STATE, RESULTS_DIR } from "./tests/canary/paths";

// Deployed-site canary. Unlike playwright.config.ts this does NOT start Vite:
// it drives the live production deployment (CANARY_BASE_URL, default
// https://eventvendora.com). Production checks are read-only.
//
// Projects:
//   preflight            required-secret inventory; FAILS when auth config is missing
//   public-desktop/-mobile   signed-out journeys (Desktop Chrome / Pixel 7 viewport)
//   setup                seeds one session per dedicated test account
//   vendor-desktop/-mobile   signed-in vendor journeys + session handling
//   isolation-api        read-only RLS / cross-vendor checks with user tokens
//
// "mobile" here is a phone-sized BROWSER viewport on the web app. It is not
// the native vendor-mobile app; see tests/canary/README.md.

const BASE_URL = process.env.CANARY_BASE_URL || "https://eventvendora.com";

// Local-only escape hatches for sandboxes behind a TLS-inspecting proxy. CI
// leaves these unset and uses the browser Playwright installs.
const launchOptions: NonNullable<PlaywrightTestConfig["use"]>["launchOptions"] = {
  executablePath: process.env.CANARY_CHROMIUM_PATH || undefined,
  args: (process.env.CANARY_CHROMIUM_ARGS || "").split(" ").filter(Boolean),
  proxy: process.env.CANARY_BROWSER_PROXY ? { server: process.env.CANARY_BROWSER_PROXY } : undefined,
};

// Signed-out projects can keep traces of failures. Signed-in ones never record
// traces or video: a trace captures request headers (bearer tokens) and
// storage, which must not end up in an uploaded artifact.
const publicUse = { trace: "retain-on-failure" as const, screenshot: "only-on-failure" as const, video: "off" as const };
const authedUse = {
  trace: "off" as const,
  screenshot: "only-on-failure" as const,
  video: "off" as const,
  storageState: CANARY_VENDOR_STATE,
};

export default defineConfig({
  testDir: "./tests/canary",
  outputDir: `${RESULTS_DIR}/test-output`,
  fullyParallel: true,
  workers: process.env.CI ? 4 : 2,
  // One retry: a test that only passes on retry is reported as FLAKY.
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["json", { outputFile: `${RESULTS_DIR}/results.json` }],
    ["junit", { outputFile: `${RESULTS_DIR}/junit.xml` }],
    ["html", { outputFolder: `${RESULTS_DIR}/html`, open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    launchOptions,
    serviceWorkers: "block",
  },
  projects: [
    { name: "preflight", testMatch: /preflight\.spec\.ts/, retries: 0 },
    {
      name: "public-desktop",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...publicUse },
    },
    {
      // Pixel 7 rather than iPhone so it runs on Chromium (WebKit isn't installed).
      name: "public-mobile",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Pixel 7"], ...publicUse },
    },
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "vendor-desktop",
      testMatch: /\.authed\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], ...authedUse },
    },
    {
      name: "vendor-mobile",
      testMatch: /\.authed\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], ...authedUse },
    },
    {
      name: "isolation-api",
      testMatch: /\.api\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
});
