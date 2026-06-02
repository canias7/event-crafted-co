# Staging environment & write-flow tests — scope

## Why
The current automated tests (CI `Smoke (Playwright)` + vitest) cover everything
that is **read-only or render-only** against the real Supabase project, plus
RLS isolation and the public checkout *render*. What they deliberately do **not**
cover is **write flows**:

- vendor sends a host reply (and the server-side **confirmation gate**)
- create/send an invoice or payment link (Stripe + Resend)
- block/unblock calendar dates, change inquiry status, etc.
- edge-function behavior: **webhook signature verification**
  (`vendorapay-webhook`, `stripe-webhook`, `resend-webhook`, `mux-webhook`),
  the My Space AI **confirm gate**, scheduled scans.

These mutate data and/or call external services, so they must **not** run against
production. They need an isolated environment.

## The constraint that shapes everything
This is a large, mature backend:

- **444 migrations**, **~80 edge functions**
- **~27 external secrets**: `STRIPE_*`, `RESEND_*`, `MUX_*`, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `VENDORAPAY_*`, `SEND_EMAIL_HOOK_SECRET`, etc.

So "stand up a staging copy" is not a small task, and many write flows fan out
to **paid external services** (Stripe charges, Resend emails, Mux streams, LLM
tokens). A faithful staging therefore also needs **test-mode** external
credentials and/or stubs — otherwise tests send real emails / create real
Stripe objects.

## Options

### A. Local ephemeral Supabase in CI  — *recommended*
`supabase start` + `supabase db reset` (applies all migrations from the repo) +
`supabase functions serve`, all inside the CI job. Tests run against
`localhost`.

- **Cost:** none. **Isolation:** perfect (fresh DB per run). **Drift:** none —
  it *is* the repo's migrations, so it doubles as a "migrations apply from
  scratch" check.
- **External services:** stubbed. Point `STRIPE_*` / `RESEND_*` / etc. at a
  local mock server (or use Stripe's `stripe-mock`), so webhook-signature and
  write-path logic is tested without real charges/emails.
- **Best for:** DB write flows, RLS-on-write, RPC behavior, **webhook signature
  verification**, function input/validation logic — the highest-value, most
  deterministic slice.
- **Cost to build:** medium. Main risk → **do the 444 migrations apply cleanly
  from scratch?** (Must verify; mature projects often have out-of-band objects.)

### B. Supabase preview branch
Supabase branching clones schema + migrations into an isolated branch DB and can
auto-deploy functions.

- **Cost:** paid feature (per-branch compute). **Isolation:** good. **Parity:**
  high (clones prod schema). Still needs the 27 secrets set on the branch, and
  external calls still hit real services unless test-mode keys are used.
- **Best for:** full end-to-end authed write flows close to prod.
- **Cost to build:** medium; **ongoing $** + secret management.

### C. Dedicated persistent staging project
A second long-lived Supabase project.

- **Cost:** ongoing $. **Parity:** drifts unless every migration/function deploy
  is mirrored (a second deploy target to maintain). **Isolation:** good.
- **Best for:** a true shared staging environment for humans too — but heaviest
  to keep in sync. Overkill if the goal is just CI write-flow tests.

## Recommendation
**Start with A (local ephemeral Supabase in CI)** for the write-flow + webhook
tests. It's free, perfectly isolated, reproducible, and validates the migration
chain as a bonus. Reserve B/C for if/when a shared human-facing staging
environment is actually needed.

External services in option A:
- **Stripe:** `stripe-mock` (official) or test-mode keys with no real cards.
- **Resend / Mux / push:** a tiny local HTTP stub asserting the request shape;
  never hit the real APIs in CI.
- **Anthropic/OpenAI (My Space):** stub the LLM endpoint with a canned tool-call
  response so the **confirm gate** is testable deterministically (the gate is
  our logic, not the model's).

## Concrete steps (recommended path)
1. **Verify migrations apply from scratch** — `supabase db reset` locally; fix
   any out-of-band objects so a clean apply succeeds. *(Prereq; do first.)*
2. Add a CI job `e2e-write` that:
   - installs the Supabase CLI, runs `supabase start` + `db reset`,
   - serves functions with **stub** external env vars + known webhook secrets,
   - runs a new `tests/e2e/write/*.spec.ts` suite against `localhost`.
3. First high-value tests:
   - **Webhook signature verification**: post good/forged signatures to
     `vendorapay-webhook` + `stripe-webhook`; assert accept/reject. *(No
     external calls; pure crypto + DB.)*
   - **Invoice / payment-link create** writes the row + correct fields.
   - **Host-reply confirm gate**: first `send_host_reply` returns
     `confirmation_required` and sends nothing; second identical call sends.
   - **Calendar block/unblock** round-trips.
4. Seed helpers reused from the existing `auth.setup` pattern (mint sessions
   against the local stack — no captcha locally, so plain password works).

## Operator decisions needed
- **Which option** (A recommended).
- For A: confirm CI can run Docker (`supabase start` needs it) on the runner.
- For B/C: **cost approval** + who provisions the project/branch and sets the
  ~27 secrets (incl. **test-mode** Stripe/Resend keys).

## What I can do vs. what needs you
- **I can:** verify the migration-from-scratch apply, write the CI job + the
  write-flow specs + stubs, and the seed helpers.
- **You need to:** approve the approach (and any cost for B/C), and provide
  test-mode external keys if we want real-service parity instead of stubs.
