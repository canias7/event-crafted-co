import { defineConfig, devices } from "@playwright/test";

// Standalone Playwright config (no longer depends on the lovable-agent-
// playwright-config package which isn't published outside Lovable's CI).
// Targets the local Vite dev server on port 8080.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
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
    timeout: 30_000,
  },
});
