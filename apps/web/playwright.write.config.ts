import { defineConfig } from "@playwright/test";

// Write-flow tests. NEVER pointed at production:
//   webhooks  real edge-function code under Deno + a stub database; needs no
//             Supabase stack (runs even when the migration replay fails)
//   db-write  create/update/delete flows against an ISOLATED local Supabase
//             stack started by .github/workflows/write-flow-tests.yml
//             (LOCAL_SUPABASE_URL etc.). Reported as BLOCKED when that stack
//             couldn't be built.
const OUT = "write-results";

export default defineConfig({
  testDir: "./tests/write",
  outputDir: `${OUT}/test-output`,
  fullyParallel: false,
  workers: 2,
  retries: 1,
  timeout: 90_000,
  reporter: [
    ["list"],
    ["json", { outputFile: `${OUT}/results.json` }],
    ["junit", { outputFile: `${OUT}/junit.xml` }],
    ["html", { outputFolder: `${OUT}/html`, open: "never" }],
  ],
  use: { trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "webhooks", testMatch: /webhooks\.spec\.ts/ },
    { name: "db-write", testMatch: /db\/.*\.spec\.ts/ },
  ],
});
