import { defineConfig, devices } from "@playwright/test";

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
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 8080",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
