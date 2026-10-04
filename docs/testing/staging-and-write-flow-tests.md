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

## Finding (2026-06-02): migrations do NOT apply from scratch
The first CI run of `.github/workflows/write-flow-tests.yml` (option A's
prerequisite gate) **failed** — the migration chain can't be replayed cleanly:

```
20260503205144_eb966d2e-….sql →
ERROR: column "event_type" of relation "profiles" already exists (SQLSTATE 42701)
  alter table public.profiles add column event_type text check (...), …
```

A Lovable-generated migration re-adds `profiles.event_type` (+ event_date,
event_location, budget_*, event_notes, onboarded_at) without `IF NOT EXISTS`;
an earlier migration already added them. Prod never errored (those columns were
created out-of-band via the Lovable UI, so the migration was effectively a
no-op there), but a from-scratch replay collides. There are very likely **more**
such conflicts later in the 444-migration chain.

**Implications & paths forward:**
1. **Make migrations idempotent** (`add column if not exists`, `create … if not
   exists`, guard drops) — iterative: fix one, re-run the workflow, fix the
   next. Could span many migrations. Has value beyond tests (fresh-env / DR /
   onboarding all depend on a clean replay).
2. **Schema-snapshot approach** — `pg_dump --schema-only` of the current prod
   schema, commit it as a fixture, and load *that* into the local stack instead
   of replaying history. Sidesteps the drift entirely (tests want current-schema
   parity, not migration history). Lower effort to get tests running; doesn't
   fix the underlying migration debt.

The validation workflow is now `workflow_dispatch`-only so it doesn't auto-fail.

### Re-checked 2026-10-04 (485 migrations): still failing, same place
`write-flow-tests.yml` (local-stack job) replays the chain on every run that
touches the write tests, and reports the failing migration instead of hiding
it. On 2026-10-04 it stopped at the same file with the same error:

```
20260503205144_eb966d2e-e2fe-4cb1-a978-9d02b09e87e7.sql
ERROR: column "event_type" of relation "profiles" already exists (SQLSTATE 42701)
At statement: 2 — alter table public.profiles add column event_type text …
```

Everything in `apps/web/tests/write/db/` is therefore reported BLOCKED until
the chain replays. The webhook contract tests (`apps/web/tests/write/webhooks.spec.ts`)
don't need the stack and run regardless. Later migrations past this point
have not been reached, so further conflicts are still unknown.

### Fixed 2026-10-04 (path 1): the chain replays from scratch
Replayed locally on Postgres 16 with a small Supabase shim (auth / storage /
realtime schemas, stub pg_cron / pg_net / vault / pgmq), fixing each failure in
place until all 489 files applied. What changed:

- **Idempotent DDL** in ~40 early (mostly Lovable-era) files: `add column if
  not exists`, `create table/index if not exists`, `create or replace
  function/view`, `drop policy/trigger if exists` before re-creating, guarded
  `create type`, `add constraint` and realtime publication adds.
- **Real bugs:** `20260503370000_inquiry_labels.sql` had `unique (vendor_id,
  lower(name))` in a table constraint (invalid; now the expression index that
  production has); `20260503580000_planner_workspace.sql` had a misplaced
  `coalesce(…)` (syntax error).
- **Return-type changes:** functions recreated with a different return type
  now `drop function if exists` first.
- **Objects created outside migrations** are backfilled from production's
  definitions: `20260503449999_backfill_user_roles.sql`,
  `20260511175959_backfill_untracked_tables.sql`, plus a few single-column
  backfills at the top of the file that first needs them.
- **Out-of-order files:** `20260526084000` / `20260526086000` ran before the
  migration that creates `vendor_recurring_invoices`; they now skip when it
  doesn't exist.

Production is unaffected: its migration history starts at `20260507044459`
and records different versions, so none of these files re-run there. The real
check is the `local-stack` job (`supabase start`), which now also runs on any
change under `supabase/migrations/`.

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
