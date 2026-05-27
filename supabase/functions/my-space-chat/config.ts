// Shared runtime configuration for the My Space chat function.
//
// Constants + the withTimeout helper, pulled out so both index.ts
// and streaming.ts can read them without one importing the other.

export const SONNET_MODEL = "claude-sonnet-4-6";
export const IMAGE_MODEL_PRIMARY = "gpt-image-2";
export const IMAGE_MODEL_FALLBACK = "gpt-image-1";
export const MAX_TOOL_ITERATIONS = 6;
export const CONTEXT_HORIZON_DAYS = 30;

// Per-vendor daily caps on outbound-touching tools. Cheap defense
// against a hijacked chat blasting messages in a tight loop.
export const SEND_EMAIL_DAILY_CAP = 20;
export const BULK_SEND_REPLY_DAILY_CAP = 5;

// Per-user Claude cost cap in USD per rolling 24h. Generous power-
// user budget; fails open on telemetry errors so an unrelated
// outage doesn't lock users out.
export const CHAT_DAILY_USD_CAP = 20;

// Edge-function execution budget is 150s. We cap outbound calls
// well below that so a hung upstream can't blow the whole stream.
export const CLAUDE_FETCH_TIMEOUT_MS = 110_000;
export const OPENAI_FETCH_TIMEOUT_MS = 90_000;
export const SUMMARIZE_FETCH_TIMEOUT_MS = 30_000;

export function withTimeout(
  ms: number,
): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const id = setTimeout(
    () => ctrl.abort(new Error("upstream_timeout")),
    ms,
  );
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}
