// Anthropic SSE parser + streaming tool-call loop.
//
// Pulled out of index.ts so the orchestration (system prompt build,
// tool handlers, request handler) stays separable from the protocol
// and loop bookkeeping. `streamClaudeWithTools` takes its tool
// dispatcher + custom-tool loader as dependencies to avoid a circular
// import — the actual tool implementations live in index.ts and are
// passed in via the `deps` arg.

import { TOOLS } from "./tools-schemas.ts";
import {
  CLAUDE_FETCH_TIMEOUT_MS,
  MAX_TOOL_ITERATIONS,
  SONNET_MODEL,
  withTimeout,
} from "./config.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// Tools that mutate the world — every successful + failed call is
// logged to my_space_action_audit so the vendor can review what the
// AI did on their behalf.
export const WRITE_TOOL_NAMES = new Set([
  "send_host_reply",
  "update_inquiry_status",
  "mark_notifications_read",
  "send_email",
  "manage_appointment",
  "manage_calendar",
  "manage_knowledge",
  "manage_scheduled_action",
  "create_payment_link",
  "create_invoice",
  "toggle_auto_reply",
  "manage_faq",
  "manage_package",
  "update_profile",
  "edit_image",
  "set_chat_preferences",
  "bulk_update_inquiry_status",
  "bulk_send_reply",
]);

export interface ClaudeMessage {
  role: "user" | "assistant";
  // deno-lint-ignore no-explicit-any
  content: any;
}

export interface ClaudeTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

// Parse Anthropic's SSE format into a stream of typed events.
// deno-lint-ignore no-explicit-any
export async function* parseAnthropicSSE(
  body: ReadableStream<Uint8Array>,
  // deno-lint-ignore no-explicit-any
): AsyncGenerator<any, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {
        // Ignore malformed lines.
      }
    }
  }
}

// Claude Sonnet 4.6 list pricing (May 2026, USD per million tokens).
// Fire-and-forget — telemetry failure must never fail the chat.
export async function logChatUsage(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  tokens: ClaudeTokens,
): Promise<void> {
  try {
    const usd = (tokens.input_tokens * 3.0 +
      tokens.output_tokens * 15.0 +
      tokens.cache_creation_tokens * 3.75 +
      tokens.cache_read_tokens * 0.30) /
      1_000_000;
    await admin.from("ai_call_usage").insert({
      user_id: userId,
      action_type: "my_space_chat",
      provider: "anthropic",
      model: SONNET_MODEL,
      input_tokens: tokens.input_tokens,
      output_tokens: tokens.output_tokens,
      cache_creation_tokens: tokens.cache_creation_tokens,
      cache_read_tokens: tokens.cache_read_tokens,
      cost_micros: Math.round(usd * 1_000_000),
      success: true,
    });
  } catch (err) {
    console.warn("[my-space-chat] usage log failed", err);
  }
}

// Fire-and-forget — never block the chat reply on audit insert.
export function logActionAudit(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  vendorId: string | null,
  threadId: string | null,
  toolName: string,
  // deno-lint-ignore no-explicit-any
  input: any,
  // deno-lint-ignore no-explicit-any
  result: any,
): void {
  if (!WRITE_TOOL_NAMES.has(toolName)) return;
  // deno-lint-ignore no-explicit-any
  const errorMessage = (result as any)?.error ?? null;
  admin
    .from("my_space_action_audit")
    .insert({
      user_id: userId,
      vendor_id: vendorId || null,
      thread_id: threadId || null,
      tool_name: toolName,
      input,
      result,
      success: !errorMessage,
      error_message: errorMessage,
    })
    .then(
      () => {},
      // deno-lint-ignore no-explicit-any
      (e: any) =>
        console.warn("[my-space-chat] audit insert failed", e),
    );
}

// Dependencies the streaming loop calls back into index.ts for —
// avoids importing the tool handlers (which is most of index.ts)
// from this file. index.ts builds and passes these in per turn.
export interface StreamingDeps {
  executeTool: (
    // deno-lint-ignore no-explicit-any
    admin: any,
    vendorId: string,
    userId: string,
    // deno-lint-ignore no-explicit-any
    customTools: Map<string, any>,
    name: string,
    // deno-lint-ignore no-explicit-any
    input: any,
  ) => Promise<unknown>;
  loadCustomTools: (
    // deno-lint-ignore no-explicit-any
    admin: any,
    vendorId: string,
    // deno-lint-ignore no-explicit-any
  ) => Promise<Array<any>>;
}

// Streaming tool loop. Calls `send` for each event:
//   { type: "delta", text }
//   { type: "tool_start", name }
//   { type: "tool_done", name }
//   { type: "iteration_cap_reached", iterations }
// Returns the assembled final text. Uses Anthropic's streaming API
// on every iteration so text shows up immediately, even on turns
// that also call tools (Claude often emits a sentence before
// invoking a tool — that should be visible to the vendor).
export async function streamClaudeWithTools(
  systemPrompt: string,
  initialMessages: ClaudeMessage[],
  // deno-lint-ignore no-explicit-any
  admin: any,
  vendorId: string,
  userId: string,
  threadId: string,
  send: (ev: Record<string, unknown>) => void,
  deps: StreamingDeps,
): Promise<string> {
  // Load the vendor's custom webhook tools once per turn and merge
  // them into the tool list Claude sees.
  const customToolRows = await deps.loadCustomTools(admin, vendorId);
  // deno-lint-ignore no-explicit-any
  const customToolMap = new Map(customToolRows.map((r: any) => [r.name, r]));
  // deno-lint-ignore no-explicit-any
  const customToolDefs = customToolRows.map((r: any) => ({
    name: r.name,
    description: `[custom] ${r.description}`,
    input_schema: r.input_schema ?? { type: "object", properties: {} },
  }));
  const allTools = [...TOOLS, ...customToolDefs];
  if (!ANTHROPIC_API_KEY) throw new Error("anthropic_key_missing");
  let messages = [...initialMessages];
  let finalText = "";
  const totalTokens: ClaudeTokens = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
  };
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const tm = withTimeout(CLAUDE_FETCH_TIMEOUT_MS);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: tm.signal,
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: allTools,
        messages,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const t = res.body ? await res.text() : "";
      throw new Error(`anthropic ${res.status}: ${t.slice(0, 240)}`);
    }

    // Reassemble content blocks as the stream arrives. We need them
    // to round-trip back to Claude on tool-use turns.
    // deno-lint-ignore no-explicit-any
    const blocks: Array<any> = [];
    let stopReason: string | null = null;
    let turnText = "";

    for await (const ev of parseAnthropicSSE(res.body)) {
      if (ev.type === "content_block_start") {
        // deno-lint-ignore no-explicit-any
        const cb = { ...ev.content_block } as any;
        if (cb.type === "tool_use") {
          cb._jsonBuf = "";
          send({ type: "tool_start", name: cb.name });
        } else if (cb.type === "text") {
          cb.text = cb.text ?? "";
        }
        blocks[ev.index] = cb;
      } else if (ev.type === "content_block_delta") {
        const cb = blocks[ev.index];
        if (!cb) continue;
        if (ev.delta?.type === "text_delta") {
          const chunk = String(ev.delta.text ?? "");
          turnText += chunk;
          cb.text = (cb.text ?? "") + chunk;
          send({ type: "delta", text: chunk });
        } else if (ev.delta?.type === "input_json_delta") {
          cb._jsonBuf = (cb._jsonBuf ?? "") +
            String(ev.delta.partial_json ?? "");
        }
      } else if (ev.type === "content_block_stop") {
        const cb = blocks[ev.index];
        if (cb?.type === "tool_use") {
          try {
            cb.input = cb._jsonBuf ? JSON.parse(cb._jsonBuf) : {};
          } catch {
            cb.input = {};
          }
          delete cb._jsonBuf;
        }
      } else if (ev.type === "message_delta") {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        // Anthropic ships output_tokens here; input/cache live on
        // message_start. Accumulate so we log one row at the end of
        // the whole tool loop instead of one per iteration.
        if (ev.usage?.output_tokens) {
          totalTokens.output_tokens += Number(ev.usage.output_tokens) || 0;
        }
      } else if (ev.type === "message_start") {
        const u = ev.message?.usage ?? {};
        totalTokens.input_tokens += Number(u.input_tokens) || 0;
        totalTokens.cache_creation_tokens +=
          Number(u.cache_creation_input_tokens) || 0;
        totalTokens.cache_read_tokens +=
          Number(u.cache_read_input_tokens) || 0;
      }
    }
    tm.cancel();

    if (stopReason === "tool_use") {
      const toolUses = blocks.filter((b) => b?.type === "tool_use");
      const toolResults = await Promise.all(
        toolUses.map(async (tu) => {
          const out = await deps.executeTool(
            admin,
            vendorId,
            userId,
            customToolMap,
            tu.name,
            tu.input,
          );
          send({ type: "tool_done", name: tu.name });
          // Tool-level analytics so we can see which tools the AI
          // reaches for most. Fire-and-forget.
          admin
            .from("ai_call_usage")
            .insert({
              user_id: userId,
              action_type: `my_space_tool:${tu.name}`,
              provider: "internal",
              model: tu.name,
              input_tokens: 0,
              output_tokens: 0,
              cost_micros: 0,
              // deno-lint-ignore no-explicit-any
              success: !(out as any)?.error,
              // deno-lint-ignore no-explicit-any
              error_message: (out as any)?.error ?? null,
            })
            .then(
              () => {},
              // deno-lint-ignore no-explicit-any
              (e: any) =>
                console.warn("[my-space-chat] tool log failed", e),
            );
          // Audit log captures full input + result for write tools.
          logActionAudit(
            admin,
            userId,
            vendorId || null,
            threadId || null,
            tu.name,
            tu.input,
            out,
          );
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(out),
          };
        }),
      );
      // Strip internal scratch fields before sending back to Claude.
      const cleanedBlocks = blocks.map((b) => {
        const { _jsonBuf: _ignored, ...rest } = b ?? {};
        return rest;
      });
      messages = [
        ...messages,
        { role: "assistant", content: cleanedBlocks },
        { role: "user", content: toolResults },
      ];
      continue;
    }

    finalText = turnText.trim() || "(no response)";
    // Fire-and-forget — we don't await so the user-visible reply
    // doesn't wait on a telemetry insert.
    void logChatUsage(admin, userId, totalTokens);
    return finalText;
  }
  // The model burned the entire tool-iteration budget without
  // returning text. Surface to both the operator (warn log) and the
  // client (stream event the UI renders as a banner). Also tagged in
  // ai_call_usage so we can query "how often is this happening?".
  console.warn("[my-space-chat] iteration cap reached", {
    user_id: userId,
    vendor_id: vendorId || null,
    iterations: MAX_TOOL_ITERATIONS,
  });
  try {
    send({ type: "iteration_cap_reached", iterations: MAX_TOOL_ITERATIONS });
  } catch (_) {
    // Stream may already be closed — ignore.
  }
  admin.from("ai_call_usage").insert({
    user_id: userId,
    action_type: "my_space_iteration_cap_reached",
    provider: "internal",
    model: SONNET_MODEL,
    input_tokens: 0,
    output_tokens: 0,
    cost_micros: 0,
    success: false,
    // deno-lint-ignore no-explicit-any
  }).then(() => {}, (e: any) =>
    console.warn("[my-space-chat] cap audit failed", e));
  void logChatUsage(admin, userId, totalTokens);
  return `(I made ${MAX_TOOL_ITERATIONS} tool calls without finishing — try breaking the request into smaller asks, or rephrase what you need.)`;
}
