# Deployed-site canary

Read-only Playwright checks against the **live** Vendora web app on Cloudflare
Pages (`https://eventvendora.com`, plus `app.` and `admin.`), run by
`.github/workflows/canary.yml`. It does not start Vite; config is
`apps/web/playwright.canary.config.ts`.

## What runs

| Project | Viewport | Needs secrets | Covers |
|---|---|---|---|
| `preflight` | — | — | Inventories required secrets (names only). **Fails** if any is missing. |
| `public-desktop` / `public-mobile` | Desktop Chrome / Pixel 7 | no | Landing → directory, directory vs API (approved listings only), search + empty state, vendor detail, test-data leakage, login chooser + vendor form (no real sign-in), 404, legal, public pay-link / invoice checkout render, signed-out redirects for every gated route, `app.` host, `admin.` PIN gate |
| `setup` | — | yes | Seeds one session per dedicated test account |
| `vendor-desktop` / `vendor-mobile` | Desktop Chrome / Pixel 7 | yes | Overview dashboard, My Profile (shows the vendor's own business), edit form pre-filled (never saved), gallery, inbox total == API count, open a thread, inbox search, calendar month grid + navigation, retired Workspace/My Space links redirect to Overview, secondary pages; session reload, client-side sign-out, expired + tampered tokens, host blocked from vendor pages |
| `isolation-api` | — | yes | Read-only RLS: vendor/host/anon inquiry visibility, cross-vendor reads of inquiries/invoices/payment links, non-approved listing hidden from anon, analytics RPC scoped to caller |

Every browser test also fails on uncaught page errors, unexpected
`console.error`s, and failed or 5xx first-party requests (`fixtures.ts`).
First-party 4xx responses are recorded as annotations without failing.

### Mobile ≠ native

`*-mobile` projects are a **phone-sized browser viewport on the web app**.
The native apps (`apps/vendor-mobile`, `apps/host-mobile`) get **only a static
type check** (`native-static` job). Nothing here exercises them at runtime.

### Seeded session vs. login

Authenticated checks use a **seeded session**: the service-role admin API
mints a one-time OTP for the dedicated test account and verifies it, which
yields an ordinary user session. Every assertion then runs as that ordinary
user. This tests "a signed-in vendor can use X". It does **not** test the
login form end to end. Production login requires the password plus an
emailed 6-digit code, and the canary does not weaken that. The login UI
is checked only up to the point where a real credential would be submitted.

### Read-only

Production checks never save forms, send messages, block dates or create
payments. Write flows live in `tests/write/` and run only against an isolated
local Supabase stack (`.github/workflows/write-flow-tests.yml`).

## Secrets

Set in **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Required | Value |
|---|---|---|
| `E2E_VENDOR_EMAIL` | **yes** | Email of the dedicated synthetic vendor (`e2e-vendor@eventvendora.test`) |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase service-role key (only used to mint the test accounts' sessions) |
| `E2E_SUPABASE_URL` | no | Defaults to the production project URL |
| `E2E_SUPABASE_ANON_KEY` | no | Defaults to the production publishable key |
| `E2E_HOST_EMAIL` | no | Defaults to `e2e-host-1@eventvendora.test` |
| `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | no | Already used by the deploy workflow. When present, the report names the live Pages deployment id and commit. |

If a required secret is missing, `preflight` fails, authenticated tests show
as **BLOCKED**, and the run is red. Public checks still run and report.

Credentials go only to trusted code: default-branch runs (schedule, deploy
follow-up, manual dispatch) and pull requests from branches of this
repository. Fork PRs never get them.

## Results

Each run publishes a job summary and an artifact (`canary-results-*`)
containing:

- `summary.md` and `summary.json`: passed / failed / flaky / blocked /
  skipped, kept separate.
- `results.json` and `junit.xml`: machine-readable results.
- `html/`: the Playwright report.
- `metadata.json`: tested URL, deployed bundle, Cloudflare deployment,
  commits and time.
- Failure screenshots, plus traces for signed-out tests only.

The artifacts are scrubbed by `scripts/canary/sanitize.mjs` before upload,
and session state is deleted. A test that passes only on retry is reported
as **flaky**.

## Running locally

```bash
cd apps/web
bunx playwright test -c playwright.canary.config.ts --project=preflight --project=public-desktop
# signed-in projects need E2E_VENDOR_EMAIL + E2E_SUPABASE_SERVICE_ROLE_KEY in the env
node ../../scripts/canary/summarize.mjs --results canary-results/results.json --out canary-results
```

Behind a TLS-inspecting proxy, `CANARY_CHROMIUM_PATH`, `CANARY_CHROMIUM_ARGS`
and `CANARY_BROWSER_PROXY` let you point at a local Chromium. CI never sets
them.
