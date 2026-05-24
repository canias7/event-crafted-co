// Per-call AI usage logger. Writes one row to ai_call_usage for
// every upstream API call (Anthropic message, OpenAI image) so we
// can replace list-price COGS math with actual telemetry.
//
// Fire-and-forget — telemetry failure must never fail the user-
// facing call. Errors are warn-logged and swallowed.
//
// Distinct from vendor_credit_transactions: that table tracks what
// the VENDOR paid in credits; this tracks what WE paid in dollars
// to the upstream. One credit-consume can produce N usage rows
// (e.g. hilux_reply main call + lead-score side call).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export interface ClaudeTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

// Anthropic Claude Sonnet 4.6 list pricing (May 2026, USD per
// million tokens). Update when Anthropic announces new prices —
// cost_micros is snapshotted at write time so old rows stay
// historically correct.
const CLAUDE_PRICING_PER_MTOK: Record<
  string,
  { input: number; output: number; cache_write: number; cache_read: number }
> = {
  "claude-sonnet-4-6": {
    input: 3.00,
    output: 15.00,
    cache_write: 3.75,
    cache_read: 0.30,
  },
};

export function claudeCostMicros(model: string, t: ClaudeTokens): number {
  const p = CLAUDE_PRICING_PER_MTOK[model];
  if (!p) return 0;
  const usd =
    (t.input_tokens * p.input) / 1_000_000 +
    (t.output_tokens * p.output) / 1_000_000 +
    (t.cache_creation_tokens * p.cache_write) / 1_000_000 +
    (t.cache_read_tokens * p.cache_read) / 1_000_000;
  return Math.round(usd * 1_000_000);
}

// OpenAI image pricing keyed by `model:size:quality`. gpt-image-1
// medium 1024×1024 is currently ~$0.042/image (OpenAI cost calc).
// Add entries here before changing axion's size/quality knobs.
const IMAGE_PRICING_USD_PER_IMAGE: Record<string, number> = {
  "gpt-image-1:1024x1024:medium": 0.042,
  "gpt-image-1:1024x1024:high": 0.167,
  "gpt-image-1:1024x1024:low": 0.011,
};

export function imageCostMicros(spec: string, count: number): number {
  const per = IMAGE_PRICING_USD_PER_IMAGE[spec] ?? 0;
  return Math.round(per * count * 1_000_000);
}

function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface LogClaudeParams {
  userId: string | null;
  actionType: string;
  model: string;
  tokens: ClaudeTokens;
  refId?: string | null;
  success?: boolean;
  errorMessage?: string | null;
}

export async function logClaudeUsage(p: LogClaudeParams): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  try {
    await admin.from("ai_call_usage").insert({
      user_id: p.userId,
      action_type: p.actionType,
      provider: "anthropic",
      model: p.model,
      input_tokens: p.tokens.input_tokens,
      output_tokens: p.tokens.output_tokens,
      cache_creation_tokens: p.tokens.cache_creation_tokens,
      cache_read_tokens: p.tokens.cache_read_tokens,
      cost_micros: claudeCostMicros(p.model, p.tokens),
      ref_id: p.refId ?? null,
      success: p.success ?? true,
      error_message: p.errorMessage ?? null,
    });
  } catch (err) {
    console.warn("[ai-usage] logClaudeUsage failed", err);
  }
}

interface LogImageParams {
  userId: string | null;
  actionType: string;
  model: string;
  // 'gpt-image-1:1024x1024:medium' — key into IMAGE_PRICING_USD_PER_IMAGE.
  spec: string;
  imageCount: number;
  refId?: string | null;
  success?: boolean;
  errorMessage?: string | null;
}

export async function logImageUsage(p: LogImageParams): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  try {
    await admin.from("ai_call_usage").insert({
      user_id: p.userId,
      action_type: p.actionType,
      provider: "openai",
      model: p.model,
      image_count: p.imageCount,
      cost_micros: imageCostMicros(p.spec, p.imageCount),
      ref_id: p.refId ?? null,
      success: p.success ?? true,
      error_message: p.errorMessage ?? null,
    });
  } catch (err) {
    console.warn("[ai-usage] logImageUsage failed", err);
  }
}
