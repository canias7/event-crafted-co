// VendoraPay payments abstraction. ALL Stripe code lives in this
// file (and the webhook event-shape mapper at the bottom). Every
// other edge function in this repo MUST call into this module
// instead of importing `stripe` directly.
//
// The contract: callers see VendoraPay concepts (accounts, charges,
// balance, transactions). Stripe is the current implementation —
// swap to Adyen/Braintree/Mangopay later by replacing only this
// file. No "stripe" / "Stripe" strings leak past this boundary.
//
// Currency: integer cents only, never floats. All amounts in this
// module's signatures are bigints/numbers representing minor units.
//
// Idempotency: every state-changing call (createAccount, charge)
// requires an idempotency_key from the caller. Repeated calls with
// the same key + payload return the same result instead of
// double-creating.
//
// Webhook signature verification happens inside handleWebhookEvent.
// Routes never trust the body until this function returns ok.

// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@18.0.0?target=deno";

// ---- env + singleton client -------------------------------------

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// VendoraPay webhook secret. Prefer a dedicated value when set —
// this lets you register vendorapay-webhook as a SEPARATE endpoint
// in the Stripe dashboard with its own whsec_... while the legacy
// stripe-webhook keeps using STRIPE_WEBHOOK_SECRET. Falls back to
// STRIPE_WEBHOOK_SECRET so a single shared endpoint also works
// (you'd add the Phase 1 events to the existing endpoint).
const WEBHOOK_SECRET =
  Deno.env.get("VENDORAPAY_WEBHOOK_SECRET") ??
  Deno.env.get("STRIPE_WEBHOOK_SECRET") ??
  "";
// Platform fee on every charge — basis points (500 = 5.00%) plus
// optional fixed cents. Source of truth so VendoraPay's pricing can
// be tuned in one place (env, not code).
const PLATFORM_FEE_BPS = Number(
  Deno.env.get("VENDORAPAY_FEE_BPS") ??
    Deno.env.get("STRIPE_PLATFORM_FEE_BASIS_POINTS") ?? "500",
);
const PLATFORM_FEE_FIXED_CENTS = Number(
  Deno.env.get("VENDORAPAY_FEE_FIXED_CENTS") ?? "0",
);
// Statement descriptor every customer sees on their card statement.
// Hardcoded to the platform brand — vendors don't get to set this
// because that's where Stripe shows through.
const STATEMENT_DESCRIPTOR = "VENDORAPAY";

let _client: Stripe | null = null;
function client(): Stripe {
  if (!_client) {
    if (!STRIPE_SECRET_KEY) {
      throw new Error("VendoraPay not configured (missing platform secret)");
    }
    _client = new Stripe(STRIPE_SECRET_KEY, {
      // dahlia is the API release that activates v2 Accounts. Existing
      // v1 endpoints (PaymentIntents, Charges, Refunds, Checkout) keep
      // working under this version — only Accounts moves to v2.
      apiVersion: "2026-04-22.dahlia" as any,
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return _client;
}

// ---- types the rest of the app sees -----------------------------

export interface ConnectedAccount {
  /** Opaque provider account id. Store on the user — don't expose. */
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  /** Default external account (bank) summary for the Integrations tab. */
  bank?: {
    bank_name: string | null;
    last4: string | null;
    currency: string | null;
  } | null;
}

export interface ChargeResult {
  /** Opaque provider charge id. Use to correlate refunds + disputes. */
  id: string;
  status: "requires_action" | "succeeded" | "processing" | "requires_payment_method";
  amount_cents: number;
  currency: string;
  /** Set when the charge needs further customer action (3DS, etc.). */
  client_secret: string | null;
}

export interface Balance {
  /** Funds settled and withdrawable. */
  available_cents: number;
  /** Funds in transit (settling). */
  pending_cents: number;
  currency: string;
}

export interface Transaction {
  id: string;
  /** "charge", "refund", "payout", "fee", "adjustment". */
  kind: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  currency: string;
  status: string;
  created_at: string; // ISO
  description: string | null;
  /**
   * PaymentIntent id when this txn is sourced by a charge. Resolved
   * server-side via `expand: ['data.source']` on the listTransactions
   * call. Required for the refund flow — Transaction.id is a
   * balance-txn id (txn_*), not a PI id, so `refunds.create` rejects
   * it. Use payment_intent_id when refunding.
   */
  payment_intent_id: string | null;
}

export interface NormalizedWebhookEvent {
  /** Provider event id — store + dedupe on this. */
  id: string;
  /** Normalized event kind — see ALLOWED_EVENT_TYPES below. */
  kind: WebhookEventKind;
  /** Provider account this event is for, if any. */
  account_id: string | null;
  /** Full raw event for handlers that need fields we didn't normalize. */
  raw: any;
}

export type WebhookEventKind =
  | "account.updated"
  | "payment.succeeded"
  | "payment.failed"
  | "charge.refunded"
  | "charge.disputed";

// ---- public API -------------------------------------------------

/**
 * Direct fetch to Stripe v2 REST API. Bypasses the SDK because the
 * Deno esm.sh build of stripe@18 doesn't tree-shake the v2 namespace
 * (stripe.v2.core.accounts is undefined at runtime).
 */
async function stripeV2(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<any> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("VendoraPay not configured (missing platform secret)");
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    "Content-Type": "application/json",
    "Stripe-Version": "2026-04-22.dahlia",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? json?.message ?? `Stripe ${res.status}`;
    throw new Error(message);
  }
  return json;
}

/**
 * Create a connected account via the v2 Accounts API.
 */
export async function createAccount(args: {
  email?: string | null;
  business_id: string;
  idempotency_key: string;
}): Promise<ConnectedAccount> {
  const account = await stripeV2(
    "POST",
    "/v2/core/accounts",
    {
      dashboard: "express",
      contact_email: args.email ?? undefined,
      display_name: args.email ?? undefined,
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
      identity: {
        country: "US",
        entity_type: "individual",
      },
      configuration: {
        // recipient = the account can receive money (transfers,
        // payouts to its bank). Required for destination charges.
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
        // merchant = the account can accept money (charges its own
        // customers' cards). v2 requires this whenever stripe_transfers
        // is requested, even when we only use destination charges.
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
      },
      metadata: { business_id: args.business_id },
    },
    args.idempotency_key,
  );
  return normalizeAccountV2(account);
}

/**
 * Mint a fresh onboarding link via v2 account_links.
 */
export async function createOnboardingLink(args: {
  account_id: string;
  return_url: string;
  refresh_url: string;
}): Promise<{ url: string }> {
  const link = await stripeV2("POST", "/v2/core/account_links", {
    account: args.account_id,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        // Onboard for both configurations so the vendor's KYC covers
        // receiving transfers AND being a merchant of record.
        configurations: ["recipient", "merchant"],
        refresh_url: args.refresh_url,
        return_url: args.return_url,
      },
    },
  });
  return { url: link.url };
}

/**
 * Current onboarding/capability state via v2 accounts.retrieve.
 * `include` query params layer additional fields onto the response.
 */
export async function getAccountStatus(
  account_id: string,
): Promise<ConnectedAccount> {
  const q = new URLSearchParams();
  q.append("include", "requirements");
  q.append("include", "configuration.recipient");
  const account = await stripeV2(
    "GET",
    `/v2/core/accounts/${encodeURIComponent(account_id)}?${q.toString()}`,
  );
  return normalizeAccountV2(account);
}

/**
 * Charge a customer with funds settling on the connected account.
 * Uses destination charges + application_fee — VendoraPay's platform
 * fee is taken off the top automatically.
 *
 * Amount in integer cents.
 */
export async function charge(args: {
  account_id: string;
  amount_cents: number;
  currency?: string; // defaults to "usd"
  customer_email?: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotency_key: string;
  /**
   * Override the env-based platform fee. When set, this value is
   * used directly as application_fee_amount and computePlatformFee
   * is bypassed. Callers that know the vendor's tier should compute
   * via _shared/platformFees.ts and pass the result here.
   */
  application_fee_cents?: number;
}): Promise<ChargeResult> {
  if (!Number.isInteger(args.amount_cents) || args.amount_cents < 50) {
    throw new Error("amount_cents must be an integer >= 50");
  }
  const feeCents =
    args.application_fee_cents ?? computePlatformFee(args.amount_cents);
  const intent = await client().paymentIntents.create(
    {
      amount: args.amount_cents,
      currency: args.currency ?? "usd",
      application_fee_amount: feeCents,
      transfer_data: { destination: args.account_id },
      statement_descriptor: STATEMENT_DESCRIPTOR,
      receipt_email: args.customer_email,
      description: args.description,
      metadata: args.metadata ?? {},
    },
    { idempotencyKey: args.idempotency_key },
  );
  return {
    id: intent.id,
    status: intent.status as ChargeResult["status"],
    amount_cents: intent.amount,
    currency: intent.currency,
    client_secret: intent.client_secret,
  };
}

/**
 * Available + pending balance for a connected account.
 * Sums across all currencies — multi-currency vendors get a single
 * normalized currency back (the first available bucket).
 */
export async function getBalance(account_id: string): Promise<Balance> {
  const balance = await client().balance.retrieve(
    {},
    { stripeAccount: account_id },
  );
  const available = balance.available[0];
  const pending = balance.pending[0];
  return {
    available_cents: available?.amount ?? 0,
    pending_cents: pending?.amount ?? 0,
    currency: available?.currency ?? pending?.currency ?? "usd",
  };
}

/**
 * Recent balance transactions on a connected account. Used to render
 * the VendoraPay transaction history (Phase 2 dashboard).
 */
export async function listTransactions(
  account_id: string,
  args: { limit?: number; starting_after?: string } = {},
): Promise<Transaction[]> {
  // Expand `source` so we can pull the underlying charge's
  // payment_intent for refund routing. Without this, the frontend
  // only sees a `txn_*` id which Stripe rejects on refunds.create.
  const list = await client().balanceTransactions.list(
    {
      limit: args.limit ?? 25,
      starting_after: args.starting_after,
      expand: ["data.source"],
    },
    { stripeAccount: account_id },
  );
  return list.data.map((t) => {
    let paymentIntentId: string | null = null;
    const src = t.source as unknown;
    if (src && typeof src === "object" && "object" in src) {
      const obj = src as { object?: string; payment_intent?: string | null };
      if (obj.object === "charge" && obj.payment_intent) {
        paymentIntentId = obj.payment_intent as string;
      }
    }
    return {
      id: t.id,
      kind: t.type,
      amount_cents: t.amount,
      fee_cents: t.fee,
      net_cents: t.net,
      currency: t.currency,
      status: t.status,
      created_at: new Date(t.created * 1000).toISOString(),
      description: t.description,
      payment_intent_id: paymentIntentId,
    };
  });
}

/**
 * Resolve the host's email for a PaymentIntent.
 *
 * receipt_email on the PI is only set when WE pass it upfront —
 * Stripe Checkout collects the email on the hosted page and stamps
 * it onto charge.billing_details.email, not receipt_email. This
 * helper retrieves the PI with the latest_charge expanded and
 * returns the first email it finds.
 *
 * Used by vendorapay-webhook to populate payment_links.host_email
 * for the scheduled-balance reminder flow.
 */
export async function getReceiptEmailForPI(
  pi_id: string,
): Promise<string | null> {
  const pi = await client().paymentIntents.retrieve(pi_id, {
    expand: ["latest_charge"],
  });
  if (pi.receipt_email) return pi.receipt_email;
  const charge = pi.latest_charge as unknown;
  if (charge && typeof charge === "object") {
    const ch = charge as {
      billing_details?: { email?: string | null };
      receipt_email?: string | null;
    };
    return ch.billing_details?.email ?? ch.receipt_email ?? null;
  }
  return null;
}

/**
 * Verify webhook signature + normalize into a VendoraPay event.
 * Returns null when the event isn't one we care about (so handlers
 * can drop it without branching on every type).
 *
 * Throws if the signature is invalid — caller should return 400.
 */
export async function handleWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<NormalizedWebhookEvent | null> {
  if (!WEBHOOK_SECRET) {
    throw new Error("VendoraPay webhook not configured (missing secret)");
  }
  const event = await client().webhooks.constructEventAsync(
    rawBody,
    signature,
    WEBHOOK_SECRET,
  );
  const kind = normalizeEventType(event.type);
  if (!kind) return null;
  return {
    id: event.id,
    kind,
    account_id: (event as any).account ?? null,
    raw: event,
  };
}

// ---- internals ---------------------------------------------------

function computePlatformFee(amount_cents: number): number {
  const pct = Math.round((amount_cents * PLATFORM_FEE_BPS) / 10_000);
  return pct + PLATFORM_FEE_FIXED_CENTS;
}

/**
 * v2 account shape: capability status lives under
 * configuration.recipient.capabilities.stripe_balance.*. Map it to
 * our flat ConnectedAccount shape so consumers don't need to know
 * about v1 vs v2.
 */
function normalizeAccountV2(account: any): ConnectedAccount {
  const caps =
    account?.configuration?.recipient?.capabilities?.stripe_balance ?? {};
  const charges_enabled = caps?.stripe_transfers?.status === "active";
  const payouts_enabled = caps?.payouts?.status === "active";
  const summary_status =
    account?.requirements?.summary?.minimum_deadline?.status;
  // v2 details_submitted maps from requirements.summary: null status =
  // submitted; "eventually_due" = submitted but more later; anything
  // else (currently_due, past_due) = incomplete.
  const details_submitted =
    summary_status == null || summary_status === "eventually_due";
  // Bank info: v2 nests external_accounts differently — for V1 we
  // expanded external_accounts; v2 has it on configuration.recipient.
  // Return null for now; the Integrations tab will fall back to
  // "configured in Stripe Express" copy.
  return {
    id: account.id,
    charges_enabled,
    payouts_enabled,
    details_submitted,
    bank: null,
  };
}

function normalizeAccount(account: Stripe.Account): ConnectedAccount {
  // external_accounts is included on accounts.retrieve by default
  // but expand is required to get the full bank object. The default
  // bank is the first one marked default_for_currency=true (or the
  // first one if none).
  let bank: ConnectedAccount["bank"] = null;
  const exts = (account as unknown as { external_accounts?: { data?: any[] } })
    .external_accounts?.data ?? [];
  const defaultBank = exts.find((e: any) => e?.object === "bank_account" && e?.default_for_currency)
    ?? exts.find((e: any) => e?.object === "bank_account")
    ?? null;
  if (defaultBank) {
    bank = {
      bank_name: (defaultBank.bank_name as string | null) ?? null,
      last4: (defaultBank.last4 as string | null) ?? null,
      currency: (defaultBank.currency as string | null) ?? null,
    };
  }
  return {
    id: account.id,
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    details_submitted: Boolean(account.details_submitted),
    bank,
  };
}

function normalizeEventType(type: string): WebhookEventKind | null {
  switch (type) {
    case "account.updated":
      return "account.updated";
    case "payment_intent.succeeded":
      return "payment.succeeded";
    case "payment_intent.payment_failed":
      return "payment.failed";
    case "charge.refunded":
      return "charge.refunded";
    // All dispute lifecycle events normalize to one kind — the
    // webhook reads dispute.status off the payload to know which
    // state to write.
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
      return "charge.disputed";
    default:
      return null;
  }
}

/** Exposed for tests / introspection. Never call from app code. */
export const _internal = {
  computePlatformFee,
  normalizeEventType,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_FIXED_CENTS,
  STATEMENT_DESCRIPTOR,
};
