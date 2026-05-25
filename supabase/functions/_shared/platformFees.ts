// VendoraPay platform fee — tiered by the vendor's subscription_tier.
//
// All rates here are "all-in" — the total the vendor sees deducted
// from a charge (Stripe's fee + Vendora's cut combined). Stripe's
// own cost is fixed by them; Vendora's cut is whatever the all-in
// rate minus Stripe leaves.
//
// Studio = pass-through: Vendora earns nothing, vendor pays only
// Stripe's processing cost. Top-tier perk.
//
// On charges so small that Stripe's fee alone exceeds the all-in
// rate, the platform fee floors at 0 (we never charge negative).
// That makes the effective rate higher on tiny charges — vendors
// should avoid <$10 charges or just absorb it.

export type Tier = "free" | "starter" | "pro" | "studio";

/** All-in fee rate the vendor sees, in basis points (500 = 5.00%). */
const ALL_IN_BPS: Record<Tier, number> = {
  free: 500,
  starter: 500,
  pro: 400,
  studio: 0, // Studio = Stripe pass-through, Vendora earns nothing.
};

/**
 * Fixed-cents component of the all-in rate. Mirrors Stripe's
 * standard "% + $0.30" pricing model — Free/Starter/Pro pay the
 * $0.30 on top of the percentage. Studio is full pass-through
 * (Stripe's $0.30 is already in their fee; Vendora adds nothing).
 */
const ALL_IN_FIXED_CENTS: Record<Tier, number> = {
  free: 30,
  starter: 30,
  pro: 30,
  studio: 0,
};

// Stripe's processing cost on US cards. Used to back out what
// Vendora's slice ends up being so the customer sees only the
// vendor's "all-in" rate. Hardcoded because Stripe doesn't expose
// these as a constant; bump when their rates change.
const STRIPE_BPS = 290;
const STRIPE_FIXED_CENTS = 30;

export function normalizeTier(input: string | null | undefined): Tier {
  if (input === "studio" || input === "pro" || input === "starter") return input;
  return "free";
}

/**
 * Compute the application_fee_amount (cents) to pass to Stripe so
 * that the vendor's all-in fee matches the tier rate.
 *
 * For Studio: returns 0 (vendor pays only Stripe's cost).
 * For tiers where the all-in rate is below Stripe's cost on a given
 * charge size (tiny amounts), returns 0 — never goes negative.
 */
export function computePlatformFeeCents(
  tier: Tier,
  amount_cents: number,
): number {
  const allInBps = ALL_IN_BPS[tier];
  const allInFixed = ALL_IN_FIXED_CENTS[tier];
  if (allInBps === 0 && allInFixed === 0) return 0;

  const allInFee = Math.round((amount_cents * allInBps) / 10_000) + allInFixed;
  const stripeFee = Math.round((amount_cents * STRIPE_BPS) / 10_000) + STRIPE_FIXED_CENTS;
  return Math.max(0, allInFee - stripeFee);
}

/** Display string for the Settings tab. */
export function describeTierFee(tier: Tier): string {
  if (tier === "studio") return "2.9% + $0.30 (Stripe pass-through, Vendora $0)";
  const bps = ALL_IN_BPS[tier];
  return `${(bps / 100).toFixed(1)}% all-in`;
}
