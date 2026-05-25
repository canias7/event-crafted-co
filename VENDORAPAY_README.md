# VendoraPay — payments platform setup

VendoraPay is a white-labeled marketplace payments platform built on
Stripe Connect Express. Vendors onboard, hosts pay, money lands on the
vendor's connected account with VendoraPay's platform fee taken off the
top. The Stripe implementation is fully abstracted — see the
"Swapping providers" section below.

## Architecture rule (READ THIS)

**All Stripe code lives in one module: `supabase/functions/_shared/payments.ts`.**

Every other edge function in the repo imports the abstraction from
there. The rest of the app NEVER imports `stripe` directly.

Public API exposed by `payments.ts`:

| Function | Purpose |
|----------|---------|
| `createAccount({ business_id, email?, idempotency_key })` | Stand up a connected account |
| `createOnboardingLink({ account_id, return_url, refresh_url })` | Mint the time-bound KYC URL |
| `getAccountStatus(account_id)` | Live capability check |
| `charge({ account_id, amount_cents, idempotency_key, ... })` | Destination charge with platform fee |
| `getBalance(account_id)` | Available + pending balance |
| `listTransactions(account_id, { limit?, starting_after? })` | Recent balance transactions |
| `handleWebhookEvent(rawBody, signature)` | Signature-verify + normalize a provider event |

Money is **always** integer cents. State-changing calls require a
caller-supplied `idempotency_key`. The webhook handler returns a
normalized event with one of five `kind` values (`account.updated`,
`payment.succeeded`, `payment.failed`, `charge.refunded`,
`charge.disputed`) — no Stripe-specific event types leak past this
boundary.

## Edge functions

| Function | Method | Purpose |
|----------|--------|---------|
| `vendorapay-onboard` | POST | Create + return KYC link |
| `vendorapay-status` | GET / POST | Return charges/payouts/details_submitted bools |
| `vendorapay-charge` | POST | Mint a PaymentIntent + return client_secret |
| `vendorapay-webhook` | POST (verify_jwt=false) | Provider → DB sync |

Frontend invokes via `supabase.functions.invoke("vendorapay-...", { body })`.

## One-time Stripe dashboard setup

You need a Stripe account with Connect enabled. Do this once per
environment (test + live).

1. **Get a Stripe account.** https://dashboard.stripe.com/register.
   You can do all of Phase 1 in test mode — no business verification
   needed.

2. **Enable Connect.**
   `Dashboard → Connect → Get started → "Platform or Marketplace"`.
   Pick **Express** as the account type when prompted.

3. **Copy API keys.**
   `Dashboard → Developers → API keys` (toggle "Test mode" on for now).
   Copy:
   - `Publishable key` (`pk_test_...`) — used by the React frontend
   - `Secret key` (`sk_test_...`) — used by edge functions only

4. **Set up the platform branding.**
   `Dashboard → Settings → Connect → Branding` (or `/account` if not
   visible). The Connect onboarding screens vendors see will be
   themed with the icon, name, and brand color you set here — keep
   them VendoraPay-branded, NOT your dev/company name.

5. **Webhook endpoint.**
   `Dashboard → Developers → Webhooks → Add endpoint`.
   - Endpoint URL: `https://<your-supabase-project>.supabase.co/functions/v1/vendorapay-webhook`
   - Listen to events on: **"Events on Connected accounts"** AND
     **"Events on your account"**
   - Pick events: `account.updated`, `payment_intent.succeeded`,
     `payment_intent.payment_failed`, `charge.refunded`,
     `charge.dispute.created`.
   - After saving, click **Reveal signing secret** and copy
     `whsec_...`.

6. **Local webhook testing with the Stripe CLI.**
   ```bash
   stripe login                    # one-time
   stripe listen --forward-to localhost:54321/functions/v1/vendorapay-webhook
   ```
   The CLI prints a `whsec_...` — use THAT one for local dev
   (separate from the dashboard endpoint's secret).

## Env vars

Drop these into `.env` (local) and your hosting provider's secrets
(Supabase Edge Functions for the server vars, Vercel for the
`VITE_*` ones). See `.env.example` at repo root.

### Server (Supabase Edge Functions)
| Var | Required | Notes |
|-----|----------|-------|
| `STRIPE_SECRET_KEY` | yes | `sk_test_...` / `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` |
| `VENDORAPAY_FEE_BPS` | no | Platform fee in basis points. Default 500 (5.00%). |
| `VENDORAPAY_FEE_FIXED_CENTS` | no | Optional flat-cent fee on top. Default 0. |
| `APP_URL` | yes | Base URL of the React app (used in return/refresh URLs). |
| `SUPABASE_URL` | auto-injected | — |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected | — |
| `SUPABASE_ANON_KEY` | auto-injected | — |

Push these via the Supabase MCP or the dashboard
(`Project → Edge Functions → Manage Secrets`).

### Frontend (Vite / Vercel)
| Var | Required | Notes |
|-----|----------|-------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | yes | `pk_test_...` / `pk_live_...` |

## Testing Phase 1 end-to-end

1. As an approved vendor user, go to **Settings → Integrations → Pay**
   and click **Connect**. Complete the test onboarding form on the
   Stripe-hosted Express page (auto-fills "successful" inputs in
   test mode). You'll be redirected back to `/vendorapay/return`.

2. Hit **`vendorapay-status?business_id=<your_vendor_id>`** and
   confirm `charges_enabled: true`.

3. As a host with an accepted proposal, navigate to
   **`/pay/<proposal_id>`**. The VendoraPay checkout loads with the
   amount + Stripe Elements card form.

4. Use a Stripe test card:
   - `4242 4242 4242 4242` — successful charge
   - `4000 0027 6000 3184` — requires 3DS, click "Complete"
   - `4000 0000 0000 9995` — declined
   Any future date for expiry, any 3 digits for CVC, any ZIP.

5. After "Pay now", you're redirected to
   `/pay/:id?vendorapay_payment=success`.

6. Verify in `Dashboard → Connect → Connected accounts → <vendor>`:
   - A new PaymentIntent for the full amount
   - An application fee = `floor(amount × VENDORAPAY_FEE_BPS/10000) + VENDORAPAY_FEE_FIXED_CENTS`
   - `transfer_data.destination` = the vendor's connected account

7. Verify in the DB: `proposals.payment_status = 'paid_in_full'`
   (or `deposit_paid` if you picked deposit mode). This is set by
   `vendorapay-webhook` when Stripe fires `payment_intent.succeeded`.

## Swapping providers

To replace Stripe with another payment provider (Adyen, Braintree,
Mangopay, etc.):

1. Reimplement the public functions in `payments.ts` against the new
   SDK. Type signatures and behavior (idempotency, integer cents,
   normalized webhook kinds) must match.
2. Add new env vars for the provider; remove the Stripe ones.
3. Update the webhook endpoint URL in the new provider's dashboard.
4. Nothing else in the codebase changes — no route handler, no
   React component, no SQL migration touches the provider name.

## What's NOT in Phase 1

- VendoraPay dashboard (balance, payouts, transaction history) — Phase 2
- Invoices, contracts, CRM, reminders — stubbed; will not function
  even though edge functions / DB columns may exist for them
