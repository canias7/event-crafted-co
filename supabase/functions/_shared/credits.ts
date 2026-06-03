// Helper for the Vendora credit ledger. Every AI edge function calls
// consumeCredits BEFORE the upstream API call (OpenAI, Anthropic,
// Mux, etc.) and refundCredits in the failure path. The SQL RPCs
// (consume_credits / refund_credits in 20260523040000) do the atomic
// balance manipulation; this module is just a typed, service-role-
// wrapped facade with the per-action credit costs.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type CreditAction =
  | "hilux_reply"
  | "hilux_followup"
  | "hilux_regenerate"
  | "hilux_draft"
  | "axion_image"
  | "mux_minute"
  | "email_parse"
  | "invoice_ai_draft"
  | "document_ai_draft";

// Per-action credit costs. Calibrated for ~80%+ gross margin per
// action at measured upstream prices (see ai_call_usage telemetry).
// Keep in sync with VendorUsagePage.tsx::ACTION_COST.
//
// hilux_summary removed: the daily summary function is a deterministic
// HTML email digest with zero AI call cost — listing it here surfaced
// a "row that never moves" on the vendor's usage chart.
export const CREDIT_COST: Record<CreditAction, number> = {
  hilux_reply: 2,
  hilux_followup: 2,
  hilux_regenerate: 2,
  hilux_draft: 2,
  axion_image: 10,
  mux_minute: 1,
  email_parse: 1,
  invoice_ai_draft: 2,
  document_ai_draft: 2,
};

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ConsumeResult =
  | { ok: true; balance: number; cost: number }
  | { ok: false; reason: "insufficient_credits"; cost: number }
  | { ok: false; reason: "service_unavailable"; cost: number };

// Decrement the user's credit balance for an AI action. Atomic at
// the DB layer — concurrent calls cannot over-spend. Returns the
// new balance on success so the caller can include it in the
// response (UI shows "X credits left" after each action).
export async function consumeCredits(
  userId: string,
  action: CreditAction,
  ref?: string | null,
  countOverride?: number,
): Promise<ConsumeResult> {
  const cost = countOverride ?? CREDIT_COST[action];
  const admin = adminClient();
  const { data, error } = await admin.rpc("consume_credits", {
    p_user_id: userId,
    p_n: cost,
    p_action_type: action,
    p_ref_id: ref ?? null,
  });
  if (error) {
    if (String(error.message ?? "").includes("insufficient_credits")) {
      return { ok: false, reason: "insufficient_credits", cost };
    }
    console.error("[credits] consume failed", action, error);
    return { ok: false, reason: "service_unavailable", cost };
  }
  return { ok: true, balance: (data as number) ?? 0, cost };
}

// Refund credits when the downstream AI call failed AFTER we
// already debited. Best-effort: a refund failure is logged but
// doesn't surface as an error to the client — they're already
// getting an error response from the upstream call, no point in
// stacking another one on top.
export async function refundCredits(
  userId: string,
  action: CreditAction,
  ref?: string | null,
  reason?: string | null,
  countOverride?: number,
): Promise<void> {
  const cost = countOverride ?? CREDIT_COST[action];
  const admin = adminClient();
  const { error } = await admin.rpc("refund_credits", {
    p_user_id: userId,
    p_n: cost,
    p_action_type: action,
    p_ref_id: ref ?? null,
    p_reason: reason ?? null,
  });
  if (error) {
    console.error("[credits] refund failed", action, error);
  }
}

// Standard 402 response for insufficient credits. The shape (error,
// cost, message) is what the frontend looks for to show a "top up
// to continue" modal pre-filled with the right cost.
export function insufficientCreditsResponse(
  cost: number,
  cors: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "insufficient_credits",
      cost,
      message: `This action costs ${cost} credit${cost === 1 ? "" : "s"}. Top up or upgrade your plan to continue.`,
    }),
    {
      status: 402,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
}
