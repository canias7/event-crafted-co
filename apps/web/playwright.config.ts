import { defineConfig, devices } from "@playwright/test";
import { HOST_AUTH_FILE, VENDOR_AUTH_FILE } from "./tests/e2e/auth.paths";

// Standalone Playwright config (no longer depends on the lovable-agent-
// playwright-config package which isn't published outside Lovable's CI).
// Targets the local Vite dev server on port 8080.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Playwright defaults workers to 1 on CI; override so the 52-test
  // suite runs in parallel and stays under Lovable's CI step timeout.
  // Vite warms its bundle on the first request and serves the cached
  // chunks to every worker after that, so 4 workers ≈ 4× faster
  // without adding bundle thrash.
  workers: process.env.CI ? 4 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // Default per-test timeout is 30s. Bumped to 60s because the first
  // test that lands on "/" triggers Vite's on-demand compile of the
  // landing page bundle (framer-motion, hero assets, i18n lazy
  // chunks) — that cold-start can take 30-45s on CI runners. Once
  // warm, every other test completes in <2s.
  // Bumped to 90s: on a cold CI runner, several workers trigger Vite's
  // on-demand route compile at once, so the first navigation to a few
  // routes can exceed 60s under that contention.
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "on-first-retry",
  },
  projects: [
    {
      // Public + gated-redirect smoke tests (no auth). Excludes the auth
      // setup and the authenticated specs.
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/auth\.setup\.ts/, /\.authed\.spec\.ts/],
    },
    {
      // Signs in a throwaway vendor (when E2E creds are set) and writes the
      // storage state the authed project below consumes.
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      // Authenticated vendor-dashboard DISPLAY checks, run at a mobile
      // viewport to exercise the bottom-nav clearance / overflow fixes.
      // Pixel 7 (not iPhone) so it runs on Chromium — CI only installs the
      // chromium browser, and iPhone devices use WebKit.
      name: "vendor-authed",
      testMatch: /vendor-display\.authed\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        storageState: VENDOR_AUTH_FILE,
      },
    },
    {
      // Authenticated host (customer) dashboard DISPLAY checks — same mobile
      // viewport, signed in as the seeded test host.
      name: "host-authed",
      testMatch: /host-display\.authed\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        storageState: HOST_AUTH_FILE,
      },
    },
  ],
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 8080",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

