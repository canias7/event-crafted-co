# End-to-end tests (Playwright)

Run from `apps/web`:

```bash
npm run test:e2e            # all projects
npx playwright test --list  # list tests without running
```

## Projects

- **chromium** — public pages render without errors + gated `/vendor/*`,
  `/customer/*` routes redirect to `/login`. No auth, no real backend
  needed (runs against placeholder Supabase in CI).
- **setup** — signs in a throwaway vendor and writes the storage state the
  authed project consumes. Always writes a (possibly empty) state file.
- **vendor-authed** — authenticated vendor-dashboard **display** smoke
  tests at a mobile viewport (`vendor-display.authed.spec.ts`): each
  dashboard route renders for a signed-in vendor, doesn't bounce to
  `/login`, throws no uncaught errors, and has no horizontal overflow
  (guards the mobile bottom-nav clearance / table / grid fixes).

## Enabling the authenticated vendor-display tests

These skip until a throwaway **approved-vendor** account is configured.
They also require the app to run against the **real** Supabase project (not
the CI placeholder), so the injected session matches the client.

> ⚠️ **This project enforces server-side auth captcha.** Browserless
> password / magic-link *requests* are rejected (`captcha_failed`), so the
> reliable path is the **service-role** key: `auth.setup.ts` asks the admin
> API for a one-time OTP (admin calls aren't captcha-gated) and verifies it
> for a session. Password sign-in only works where captcha is disabled.

Set these as GitHub Actions secrets (and/or local env):

| Var | What | Required |
| --- | --- | --- |
| `E2E_VENDOR_EMAIL` | Throwaway approved-vendor login email | yes |
| `E2E_SUPABASE_URL` | Real project URL, e.g. `https://<ref>.supabase.co` | yes |
| `E2E_SUPABASE_ANON_KEY` | Real project publishable/anon key | yes |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Service-role key — captcha-free admin sign-in | yes (captcha on) |
| `E2E_VENDOR_PASSWORD` | Password — only used as a fallback when captcha is off | optional |

When the required secrets are present the CI e2e job points
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` at the real project
(see `.github/workflows/ci.yml`) and the authed tests run; otherwise
everything falls back to placeholders and the authed tests skip.

Notes:
- The service-role key is **highly sensitive** — store it only as an
  encrypted CI secret, never in the repo or client.
- The session state file (`.auth/vendor.json`) holds tokens and is
  git-ignored — never commit it.
- Use a dedicated throwaway vendor, since these tests hit the real backend.

## Fixture data — `seed.sql` (required for `checkout` + `rls` specs)

`checkout.spec.ts` and `rls.spec.ts` depend on **fixed fixture rows** in the
E2E target project that are **not created by any migration**:

| Fixture | Used by |
| --- | --- |
| pay link `e2e-pay-link` (`$250.00`) | `checkout.spec.ts` |
| invoice `e2e-invoice` (`$1,299.00`, "Wedding photography package") | `checkout.spec.ts` |
| throwaway vendor listing + >50 inquiries (host-1 owns a subset) | `rls.spec.ts` |

If this data is missing, those specs fail with `Invoice not found` /
`vendor should own a listing` and **CI goes red with no code cause**. Because
the fixtures live only in the live project, they can be wiped out-of-band and
silently rot — restore them by applying the idempotent seed:

```bash
# service-role / SQL editor on the E2E target project
psql "$E2E_DATABASE_URL" -f apps/web/tests/e2e/seed.sql
# or paste seed.sql into the Supabase SQL editor / run via the Supabase MCP
```

The script is safe to re-run (fixed fixture ids, replace-in-place). It requires
the two throwaway auth users to already exist:
`e2e-vendor@eventvendora.test` (`E2E_VENDOR_EMAIL`) and
`e2e-host-1@eventvendora.test`. See the header of `seed.sql` for details.
