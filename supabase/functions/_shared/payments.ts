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
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// ---- env + singleton client -------------------------------------

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
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
      apiVersion: "2024-06-20",
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
 * Create a connected account for a business + return its id.
 *
 * @param idempotencyKey  REQUIRED. Caller-supplied dedupe key so a
 *                        retried POST /vendorapay/onboard doesn't
 *                        spawn duplicate accounts on the provider.
 */
export async function createAccount(args: {
  email?: string | null;
  business_id: string;
  idempotency_key: string;
}): Promise<ConnectedAccount> {
  const account = await client().accounts.create(
    {
      type: "express",
      country: "US",
      email: args.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
      metadata: { business_id: args.business_id },
    },
    { idempotencyKey: args.idempotency_key },
  );
  return normalizeAccount(account);
}

/**
 * Mint a fresh onboarding link the vendor opens to complete KYC.
 * Time-bound by the provider — always mint a new one, don't cache.
 */
export async function createOnboardingLink(args: {
  account_id: string;
  return_url: string;
  refresh_url: string;
}): Promise<{ url: string }> {
  const link = await client().accountLinks.create({
    account: args.account_id,
    return_url: args.return_url,
    refresh_url: args.refresh_url,
    type: "account_onboarding",
  });
  return { url: link.url };
}

/**
 * Current onboarding/capability state of a connected account.
 * Source of truth for "can this business receive money yet?"
 */
export async function getAccountStatus(
  account_id: string,
): Promise<ConnectedAccount> {
  const account = await client().accounts.retrieve(account_id);
  return normalizeAccount(account);
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
}): Promise<ChargeResult> {
  if (!Number.isInteger(args.amount_cents) || args.amount_cents < 50) {
    throw new Error("amount_cents must be an integer >= 50");
  }
  const feeCents = computePlatformFee(args.amount_cents);
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
  const list = await client().balanceTransactions.list(
    { limit: args.limit ?? 25, starting_after: args.starting_after },
    { stripeAccount: account_id },
  );
  return list.data.map((t) => ({
    id: t.id,
    kind: t.type,
    amount_cents: t.amount,
    fee_cents: t.fee,
    net_cents: t.net,
    currency: t.currency,
    status: t.status,
    created_at: new Date(t.created * 1000).toISOString(),
    description: t.description,
  }));
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
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("VendoraPay webhook not configured (missing secret)");
  }
  const event = await client().webhooks.constructEventAsync(
    rawBody,
    signature,
    STRIPE_WEBHOOK_SECRET,
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

function normalizeAccount(account: Stripe.Account): ConnectedAccount {
  return {
    id: account.id,
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    details_submitted: Boolean(account.details_submitted),
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
    case "charge.dispute.created":
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
