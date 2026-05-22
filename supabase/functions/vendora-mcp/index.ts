// Vendora MCP server — exposes a slice of the vendor's account
// (inquiries, HILUX settings, listings) to any MCP-compatible
// Claude client (Claude.ai, Claude Code, Cursor, etc.).
//
// V1 transport: HTTP + JSON-RPC 2.0. No SSE streaming yet — clients
// that need streaming will negotiate at `initialize` time and fall
// back to plain request/response. Most clients accept this.
//
// Auth: Personal Access Token in `Authorization: Bearer <token>`.
// We SHA-256 the inbound token, look it up in vendor_access_tokens,
// bump `last_used_at`, and resolve the vendor's user_id for the
// rest of the call. Every tool enforces row-ownership against that
// user_id via the service-role client.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  callClaude,
  DEFAULT_ACTIONS,
  loadVendorContext,
  priceUsd,
} from "../_shared/hilux-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// Action keys the MCP `update_hilux_settings` tool accepts in its
// `actions` patch. Mirrors the columns on `profiles` — keeps the
// allowlist explicit so we can't accidentally let Claude write
// random profile columns through this surface.
const ALLOWED_ACTION_KEYS = new Set([
  "follow_up", "quiet_hours", "pause_weekends", "skip_when_active",
  "use_calendar", "detect_frustration",
  "mention_starting_price", "suggest_package", "decline_negotiation",
  "avoid_competitors", "send_portfolio_link", "offer_call",
  "share_booking_process", "echo_question", "acknowledge_emotion",
  "lead_with_question", "refuse_legal", "refuse_competitor_pricing",
  "no_other_clients", "redact_contact", "auto_mark_replied",
  "notify_on_reply", "update_inquiry_fields", "notify_on_escalation",
  "notify_on_hot_lead", "email_reply_copies", "auto_archive_cold",
  "daily_summary", "cap_replies_per_inquiry", "detect_booking_intent",
  "log_actions",
]);

const INQUIRY_STATUSES = ["new", "replied", "won", "lost", "expired", "drafted"] as const;
const HISTORY_LIMIT = 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// JSON-RPC 2.0 helpers. We're strict about the response shape so
// MCP clients can parse without surprises.
function rpcResult(id: any, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function rpcError(id: any, code: number, message: string) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
}

// 401 with WWW-Authenticate per RFC 6750 + RFC 9728. Points
// MCP clients at the protected-resource metadata so they can
// discover the OAuth Authorization Server and run the code flow.
function unauthorized(id: any, error: string) {
  const resourceMeta =
    `${Deno.env.get("SUPABASE_URL")!}/functions/v1/mcp-oauth-metadata?kind=resource`;
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: `Unauthorized: ${error}` },
    }),
    {
      status: 401,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="vendora", resource_metadata="${resourceMeta}"`,
      },
    },
  );
}

// Rate-limit thresholds. Per-user counts over the mcp_call_log
// table. We use two tiers: a generous all-tools cap and a tight
// write-tools cap, so a runaway agent can't blast send_reply.
// All limits are per-minute except the daily safety net.
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_PER_DAY = 1000;
const WRITE_RATE_LIMIT_PER_MINUTE = 10;
const WRITE_TOOLS = new Set([
  "send_reply",
  "pause_hilux_thread",
  "resume_hilux_thread",
  "update_hilux_settings",
  "mark_inquiry",
  "compose_draft_reply",
  "regenerate_last_hilux_reply",
]);

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
}

// Check rate limits BEFORE invoking the tool. Returns null when
// ok, or a { message, info } pair the caller can use to build the
// 429 response with RateLimit-* headers. Uses head:count which is
// a cheap exact count under the existing (user_id, created_at desc)
// index.
async function checkRateLimit(
  admin: any,
  userId: string,
  toolName: string,
): Promise<{ message: string; info: RateLimitInfo } | null> {
  const now = Date.now();
  const minuteAgo = new Date(now - 60_000).toISOString();
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const secsTillNextMinute = 60 - Math.floor((now % 60_000) / 1000);

  // Per-minute (all tools).
  const minuteCount = await admin
    .from("mcp_call_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", minuteAgo);
  const minutes = minuteCount.count ?? 0;
  if (minutes >= RATE_LIMIT_PER_MINUTE) {
    return {
      message: `Rate limit: ${RATE_LIMIT_PER_MINUTE} calls/minute exceeded. Slow down.`,
      info: {
        limit: RATE_LIMIT_PER_MINUTE,
        remaining: 0,
        resetSeconds: secsTillNextMinute,
        retryAfterSeconds: secsTillNextMinute,
      },
    };
  }

  // Per-day (all tools).
  const dayCount = await admin
    .from("mcp_call_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", dayAgo);
  if ((dayCount.count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return {
      message: `Rate limit: ${RATE_LIMIT_PER_DAY} calls/day exceeded. Try again tomorrow.`,
      info: {
        limit: RATE_LIMIT_PER_DAY,
        remaining: 0,
        resetSeconds: 86_400,
        retryAfterSeconds: 3600,
      },
    };
  }

  // Per-minute (write tools only).
  if (WRITE_TOOLS.has(toolName)) {
    const writeCount = await admin
      .from("mcp_call_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("tool_name", Array.from(WRITE_TOOLS))
      .gte("created_at", minuteAgo);
    if ((writeCount.count ?? 0) >= WRITE_RATE_LIMIT_PER_MINUTE) {
      return {
        message: `Rate limit: ${WRITE_RATE_LIMIT_PER_MINUTE} write calls/minute exceeded. Slow down or confirm with the vendor first.`,
        info: {
          limit: WRITE_RATE_LIMIT_PER_MINUTE,
          remaining: 0,
          resetSeconds: secsTillNextMinute,
          retryAfterSeconds: secsTillNextMinute,
        },
      };
    }
  }

  return null;
}

// Build a 429 response for a rate-limit hit with the appropriate
// RateLimit-* and Retry-After headers per IETF draft.
function rateLimited(id: any, message: string, info: RateLimitInfo) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32029, message },
    }),
    {
      status: 429,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Retry-After": String(info.retryAfterSeconds),
        "RateLimit-Limit": String(info.limit),
        "RateLimit-Remaining": String(info.remaining),
        "RateLimit-Reset": String(info.resetSeconds),
      },
    },
  );
}

// SHA-256 of a string, returning lowercase hex. Matches the
// pgcrypto digest call in create_vendor_access_token so the hash
// stored at mint time matches what we compute here.
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Tool catalog — describes what Claude can do via this server.
// Schemas are JSON Schema Draft 7 (what MCP expects). Each tool
// is intentionally small + read-only in v1; we'll add write tools
// (send_reply, pause_hilux, etc.) once the read surface is stable.
// Tool annotation shapes. MCP clients (Claude.ai) render confirmation
// prompts based on these hints — destructive tools get a "are you
// sure?" before invocation, read-only tools fire silently.
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const WRITE_ADDITIVE_IDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const WRITE_ADDITIVE_NONIDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const WRITE_DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const TOOLS = [
  {
    name: "list_inquiries",
    description:
      "List the vendor's inquiries, newest first. Filter by status (new/replied/won/lost/expired) or lead_score (hot/warm/cold/unknown). For pagination, pass `cursor` set to the `next_cursor` from the previous response. Result includes `next_cursor` when there are more rows.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["new", "replied", "won", "lost", "expired", "drafted"],
        },
        lead_score: {
          type: "string",
          enum: ["hot", "warm", "cold", "unknown"],
        },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        cursor: {
          type: "string",
          description:
            "ISO timestamp of the last seen row's last_message_at. Pass the next_cursor returned from the previous call.",
        },
      },
    },
    annotations: { title: "List inquiries", ...READ },
  },
  {
    name: "get_inquiry",
    description:
      "Fetch a single inquiry with full structured fields and the latest 30 messages from its thread.",
    inputSchema: {
      type: "object",
      properties: { inquiry_id: { type: "string" } },
      required: ["inquiry_id"],
    },
    annotations: { title: "Read an inquiry + transcript", ...READ },
  },
  {
    name: "get_hilux_settings",
    description:
      "Return the vendor's current HILUX configuration: master enabled flag, custom greeting, reply length, and every action toggle. Useful when the vendor asks Claude what HILUX is set to.",
    inputSchema: { type: "object", properties: {} },
    annotations: { title: "Inspect HILUX settings", ...READ },
  },
  {
    name: "list_listings",
    description:
      "Return the vendor's listings (vendor_profiles rows they own) with category, location, base price, and approval status.",
    inputSchema: { type: "object", properties: {} },
    annotations: { title: "List vendor listings", ...READ },
  },
  {
    name: "send_reply",
    description:
      "Send a message in a thread AS THE VENDOR (not HILUX). Use this for replies HILUX shouldn't write — price negotiations, custom asks, anything you'd want the host to know is from you personally. Plain text, max 5000 chars. Pass `idempotency_key` to safely retry on network errors without sending the message twice.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
        body: { type: "string", minLength: 1, maxLength: 5000 },
        idempotency_key: {
          type: "string",
          description:
            "Optional client-generated key. If the server has seen this key from this user in the last 10 minutes, the prior result is returned instead of sending again. Use a fresh UUID per logical send.",
          maxLength: 80,
        },
      },
      required: ["thread_id", "body"],
    },
    // send_reply writes a message visible to the host outside our
    // system — open-world. With an idempotency key it's safely
    // retryable; without one each call adds a new message.
    annotations: {
      title: "Reply to a host",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "pause_hilux_thread",
    description:
      "Pause HILUX on a single thread. HILUX will not auto-reply to the host in that conversation until it's resumed. Other threads keep working normally.",
    inputSchema: {
      type: "object",
      properties: { thread_id: { type: "string" } },
      required: ["thread_id"],
    },
    annotations: { title: "Pause HILUX on a thread", ...WRITE_ADDITIVE_IDEMPOTENT },
  },
  {
    name: "resume_hilux_thread",
    description:
      "Resume HILUX on a thread that was paused. HILUX picks the conversation back up on the next host message.",
    inputSchema: {
      type: "object",
      properties: { thread_id: { type: "string" } },
      required: ["thread_id"],
    },
    annotations: { title: "Resume HILUX on a thread", ...WRITE_ADDITIVE_IDEMPOTENT },
  },
  {
    name: "update_hilux_settings",
    description:
      "Update HILUX configuration on the vendor's profile. Pass any subset of fields. `actions` is a key→boolean map where keys are the snake_case action names (e.g. `follow_up`, `quiet_hours`, `use_calendar`, `escalate`, `mention_starting_price`, `suggest_package`, `notify_on_hot_lead`, etc. — see get_hilux_settings for the full list).",
    inputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        actions: {
          type: "object",
          additionalProperties: { type: "boolean" },
        },
      },
    },
    annotations: { title: "Update HILUX settings", ...WRITE_ADDITIVE_IDEMPOTENT },
  },
  {
    name: "mark_inquiry",
    description:
      "Set an inquiry's status — e.g. mark a hot lead as won after they book, mark a cold thread as lost.",
    inputSchema: {
      type: "object",
      properties: {
        inquiry_id: { type: "string" },
        status: { type: "string", enum: [...INQUIRY_STATUSES] },
      },
      required: ["inquiry_id", "status"],
    },
    annotations: { title: "Mark an inquiry", ...WRITE_ADDITIVE_IDEMPOTENT },
  },
  {
    name: "get_action_log",
    description:
      "Return HILUX's recent actions (replies, escalations, follow-ups, regenerations, archives). Newest first. Pass `cursor` from a previous response's `next_cursor` to page back further. Useful when the vendor asks Claude what HILUX has been doing on their behalf.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["reply", "escalate", "follow_up", "regenerate", "archive_cold", "booking_intent_detected", "lead_score_hot", "fields_extracted"],
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        cursor: {
          type: "string",
          description: "ISO created_at from a prior page's next_cursor.",
        },
      },
    },
    annotations: { title: "Read HILUX activity log", ...READ },
  },
  {
    name: "get_mcp_call_log",
    description:
      "Return what CLAUDE has done via this MCP connector — every tool call (success + failure). Useful when the vendor asks 'what have you been doing for me?'. Includes timing, args, ok/error status. Newest first. Pass `cursor` from a previous response's `next_cursor` to page back further.",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        cursor: {
          type: "string",
          description: "ISO created_at from a prior page's next_cursor.",
        },
      },
    },
    annotations: { title: "Read Claude's own MCP call log", ...READ },
  },
  {
    name: "compose_draft_reply",
    description:
      "Generate a HILUX-style draft reply for a thread WITHOUT sending it. Uses the same system prompt, voice samples, and toggles as the always-on agent, so the draft matches what HILUX would have written. Pass `instructions` to nudge the draft (e.g. 'lean technical', 'offer a 15% discount'). The vendor reviews the draft in Claude; call send_reply with the body if they approve.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
        instructions: {
          type: "string",
          description:
            "Optional one-off override to layer on top of the vendor's saved HILUX instructions for this single draft.",
          maxLength: 1000,
        },
      },
      required: ["thread_id"],
    },
    // Doesn't mutate, but each call goes to Claude so results vary.
    annotations: {
      title: "Compose a HILUX-style draft",
      ...WRITE_ADDITIVE_NONIDEMPOTENT,
      readOnlyHint: true,
    },
  },
  {
    name: "regenerate_last_hilux_reply",
    description:
      "Ask HILUX to rewrite its most recent reply in a thread (different angle, different opener). Only works while HILUX's reply is still the latest message — once the host has replied, regeneration is moot.",
    inputSchema: {
      type: "object",
      properties: { thread_id: { type: "string" } },
      required: ["thread_id"],
    },
    annotations: { title: "Regenerate HILUX's last reply", ...WRITE_DESTRUCTIVE },
  },
];

// Initialize handshake response. Capabilities tell the client
// what this server supports.
const INITIALIZE_RESULT = {
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: { listChanged: false },
    prompts: { listChanged: false },
    resources: { listChanged: false, subscribe: false },
    completions: {},
  },
  serverInfo: {
    name: "vendora",
    version: "0.4.0",
  },
  instructions:
    "Vendora exposes a vendor's marketplace inbox + HILUX configuration to Claude. Tools: use list_inquiries to see what's waiting, get_inquiry to drill in, compose_draft_reply to write in the vendor's HILUX voice. Prompts: slash-menu workflows (morning_recap, draft_for_thread, score_hot_leads). Resources: reference vendora://settings, vendora://activity, or any inquiry/thread by URI.",
};

// Static resources Claude can always reference by URI. Templates
// (dynamic per-id resources) are returned via resources/templates/list.
const STATIC_RESOURCES = [
  {
    uri: "vendora://settings",
    name: "HILUX settings",
    description:
      "The vendor's HILUX configuration — every toggle, greeting, and reply length. Equivalent to calling get_hilux_settings.",
    mimeType: "application/json",
  },
  {
    uri: "vendora://activity",
    name: "HILUX activity log",
    description:
      "Recent HILUX actions (replies, escalations, follow-ups, archives). Equivalent to get_action_log with default limit.",
    mimeType: "application/json",
  },
  {
    uri: "vendora://listings",
    name: "Vendor listings",
    description:
      "The vendor's vendor_profiles. Equivalent to calling list_listings.",
    mimeType: "application/json",
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "vendora://inquiry/{inquiry_id}",
    name: "Inquiry detail",
    description:
      "Full inquiry plus the last 30 messages in its thread. Use after listing inquiries to drill into one by id.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "vendora://thread/{thread_id}",
    name: "Thread transcript",
    description: "Full message transcript for a thread by id (latest 30).",
    mimeType: "application/json",
  },
];

// Prompts catalog — discoverable workflows that vendors can fire
// from Claude.ai's slash menu. Each prompt returns a pre-filled
// instruction Claude executes using the tools above. Prompts give
// the vendor one-tap access to HILUX-curated routines instead of
// re-typing the same context every time.
const PROMPTS = [
  {
    name: "morning_recap",
    description:
      "Walk through everything that happened overnight: HILUX's actions, hot leads, escalations, booking-intent signals. Use this first thing in the morning.",
    arguments: [],
  },
  {
    name: "draft_for_thread",
    description:
      "Generate a HILUX-voice draft reply for a specific thread and stage it for vendor review.",
    arguments: [
      {
        name: "thread_id",
        description: "The thread id (uuid). Find one via list_inquiries or get_inquiry.",
        required: true,
      },
      {
        name: "angle",
        description:
          "Optional tone / direction nudge for this single draft, e.g. 'lean enthusiastic' or 'mention the discount'.",
        required: false,
      },
    ],
  },
  {
    name: "score_hot_leads",
    description:
      "Find every inquiry HILUX has scored hot, summarize each in one line, and propose the single next action.",
    arguments: [],
  },
  {
    name: "audit_settings",
    description:
      "Walk the vendor through their current HILUX settings, flag anything that looks off or contradictory, and suggest improvements.",
    arguments: [],
  },
  {
    name: "weekly_review",
    description:
      "Pull the last 7 days of HILUX activity (replies, escalations, hot leads, archives), summarize what worked, and recommend toggle changes for next week.",
    arguments: [],
  },
];

function renderPrompt(
  name: string,
  args: Record<string, any>,
): { description: string; messages: Array<{ role: "user"; content: { type: "text"; text: string } }> } | null {
  switch (name) {
    case "morning_recap":
      return {
        description: "Morning recap of HILUX activity + hot leads.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Run a morning recap using the Vendora MCP. Steps:\n" +
                "1. Call get_action_log to pull HILUX's last 24h of activity.\n" +
                "2. Call list_inquiries with lead_score=hot to surface hot leads.\n" +
                "3. Call list_inquiries with status=new to see anything HILUX escalated or hasn't touched.\n" +
                "Then give me a 5-line summary: how many replies, escalations, hot leads, and the single most important thread to address first.",
            },
          },
        ],
      };
    case "draft_for_thread": {
      const threadId = String(args.thread_id ?? "").trim();
      const angle = typeof args.angle === "string" && args.angle.trim()
        ? args.angle.trim()
        : null;
      if (!threadId) return null;
      const angleClause = angle
        ? `Pass instructions="${angle.replace(/"/g, '\\"')}" so the draft picks up that direction.`
        : "Use the vendor's default HILUX voice — no override.";
      return {
        description: `Draft a HILUX-voice reply for thread ${threadId}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Draft a reply for thread_id="${threadId}" using the Vendora MCP.\n\n` +
                "Steps:\n" +
                `1. Call compose_draft_reply with thread_id="${threadId}". ${angleClause}\n` +
                "2. Show me the returned draft VERBATIM in a code block.\n" +
                "3. Below the draft, ask: 'Send as-is, edit, or skip?'\n" +
                "If I say send, call send_reply with that exact body. Don't call send_reply until I confirm.",
            },
          },
        ],
      };
    }
    case "score_hot_leads":
      return {
        description: "List hot leads + propose next action for each.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Find my hot leads:\n" +
                "1. Call list_inquiries with lead_score=hot, limit=20.\n" +
                "2. For each, give me ONE line: event_type/date/location + the lead_score_reason.\n" +
                "3. Then pick the single highest-priority one and propose the next action (compose a draft, schedule a call, etc.). Don't take the action — just propose it.",
            },
          },
        ],
      };
    case "audit_settings":
      return {
        description: "Audit HILUX settings + suggest improvements.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Audit my HILUX configuration:\n" +
                "1. Call get_hilux_settings to see every toggle, greeting, and reply length.\n" +
                "2. Flag any toggles that look contradictory (e.g. 'decline_negotiation=on' + 'mention_starting_price=off') or obviously wrong for my category.\n" +
                "3. Suggest 3 specific toggle changes you think would improve HILUX's replies. For each, explain why in one sentence.\n" +
                "Don't change anything yet — just recommend.",
            },
          },
        ],
      };
    case "weekly_review":
      return {
        description: "7-day HILUX activity review + tuning recommendations.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Run a weekly HILUX review:\n" +
                "1. Call get_action_log with limit=100 to pull recent activity.\n" +
                "2. Count actions in the last 7 days vs the prior 7 days (replies, escalations, hot leads, archives).\n" +
                "3. Tell me: what worked, what looked off, and 2-3 toggle changes worth trying for next week.\n" +
                "Keep it under 200 words.",
            },
          },
        ],
      };
    default:
      return null;
  }
}

// completion/complete handler. Used by Claude clients to autocomplete
// arg values when filling in prompts or resource templates. We only
// return completions for IDs the user could plausibly want to fill —
// inquiry_id and thread_id pulled from their recent inbox.
async function completeArgument(
  admin: any,
  userId: string,
  vendorScope: string | null,
  params: Record<string, any>,
): Promise<{ values: string[]; total?: number; hasMore?: boolean }> {
  const ref = params?.ref ?? {};
  const arg = params?.argument ?? {};
  const argName = String(arg.name ?? "");
  const value = String(arg.value ?? "").toLowerCase();
  const refType = String(ref.type ?? "");
  const refName = String(ref.name ?? "");
  const refUri = String(ref.uri ?? "");

  // Only the id-shaped args benefit from server-side completion.
  // Static enums are already in the schema.
  if (argName !== "thread_id" && argName !== "inquiry_id") {
    return { values: [] };
  }

  // Look up the user's vendor scope (or all owned vendors).
  const { data: vendors } = await admin
    .from("vendor_profiles")
    .select("id")
    .eq("user_id", userId);
  let vendorIds = ((vendors ?? []) as Array<{ id: string }>).map((v) => v.id);
  if (vendorScope) vendorIds = vendorIds.filter((id) => id === vendorScope);
  if (vendorIds.length === 0) return { values: [] };

  // refName-based dispatch:
  //   - prompt:draft_for_thread.thread_id  → recent thread ids
  //   - resource:vendora://thread/{id}     → same
  //   - resource:vendora://inquiry/{id}    → recent inquiry ids
  const wantsThread =
    argName === "thread_id" &&
    (refName === "draft_for_thread" ||
      refUri.startsWith("vendora://thread/") ||
      refType === "ref/prompt" ||
      refType === "ref/resource");
  const wantsInquiry =
    argName === "inquiry_id" &&
    (refUri.startsWith("vendora://inquiry/") ||
      refType === "ref/resource" ||
      refType === "ref/prompt");

  if (wantsInquiry) {
    const { data } = await admin
      .from("inquiries")
      .select("id, event_type, location, last_message_at")
      .in("vendor_id", vendorIds)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);
    const rows = ((data ?? []) as Array<{ id: string }>);
    const ids = rows.map((r) => r.id);
    const filtered = value ? ids.filter((id) => id.toLowerCase().includes(value)) : ids;
    return { values: filtered.slice(0, 100), total: filtered.length, hasMore: false };
  }

  if (wantsThread) {
    const { data } = await admin
      .from("direct_threads")
      .select("id, vendor_id, last_message_at")
      .in("vendor_id", vendorIds)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);
    const rows = ((data ?? []) as Array<{ id: string }>);
    const ids = rows.map((r) => r.id);
    const filtered = value ? ids.filter((id) => id.toLowerCase().includes(value)) : ids;
    return { values: filtered.slice(0, 100), total: filtered.length, hasMore: false };
  }

  return { values: [] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  // Health check: GET /vendora-mcp returns 200 with a tiny JSON
  // body so uptime monitors can ping this URL. No auth, no DB.
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        name: "vendora",
        version: INITIALIZE_RESULT.serverInfo.version,
        protocolVersion: INITIALIZE_RESULT.protocolVersion,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  // Validate JSON-RPC envelope.
  if (payload?.jsonrpc !== "2.0" || !payload?.method) {
    return rpcError(payload?.id ?? null, -32600, "Invalid Request");
  }

  const { id, method, params } = payload;

  // `initialize` doesn't need auth — the client is just asking what
  // we are. Auth happens before the first tool call.
  if (method === "initialize") {
    return rpcResult(id, INITIALIZE_RESULT);
  }

  // `tools/list`, `prompts/list`, and the static resource catalogs
  // are technically auth-required by spec, but returning them
  // publicly is harmless and improves DX (Claude can probe before
  // the user authenticates).
  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (method === "prompts/list") {
    return rpcResult(id, { prompts: PROMPTS });
  }
  if (method === "resources/list") {
    return rpcResult(id, { resources: STATIC_RESOURCES });
  }
  if (method === "resources/templates/list") {
    return rpcResult(id, { resourceTemplates: RESOURCE_TEMPLATES });
  }

  // Beyond this point: bearer token required. We accept TWO token
  // formats:
  //   1. Vendor Access Tokens (PATs) — minted via /vendora-access-token
  //   2. OAuth 2.1 access tokens — issued by /mcp-oauth-token
  // OAuth tokens are prefixed `vat_`; PATs use a different scheme.
  // We try OAuth first, then fall back to PAT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) {
    return unauthorized(id, "missing bearer token");
  }
  const tokenHash = await sha256Hex(bearer);

  let userId: string | null = null;
  let authMethod: "oauth" | "pat" | null = null;
  let clientId: string | null = null;
  let scope: "read_only" | "read_write" = "read_write";
  // When the auth token is bound to a single vendor (PAT only,
  // for now), every vendor-scoped tool filters/checks against
  // this id. Null = caller sees all vendors they own.
  let vendorScope: string | null = null;

  // Try OAuth first.
  const { data: oauthRow } = await admin
    .from("oauth_access_tokens")
    .select("id, user_id, client_id, scope, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (oauthRow) {
    const r = oauthRow as {
      id: string;
      user_id: string;
      client_id: string;
      scope: string;
      expires_at: string;
      revoked_at: string | null;
    };
    if (r.revoked_at) return unauthorized(id, "token revoked");
    if (new Date(r.expires_at).getTime() < Date.now()) {
      return unauthorized(id, "token expired");
    }
    userId = r.user_id;
    authMethod = "oauth";
    clientId = r.client_id;
    scope = r.scope === "read_only" ? "read_only" : "read_write";
    admin
      .from("oauth_access_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", r.id)
      .then(({ error }) => {
        if (error) console.error("[vendora-mcp] oauth last_used bump failed", error);
      });
  }

  // Fall back to PAT.
  if (!userId) {
    const { data: patRow } = await admin
      .from("vendor_access_tokens")
      .select("id, user_id, token_prefix, scope, vendor_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (patRow) {
      const p = patRow as {
        id: string;
        user_id: string;
        token_prefix: string;
        scope: string;
        vendor_id: string | null;
      };
      userId = p.user_id;
      authMethod = "pat";
      clientId = p.token_prefix;
      scope = p.scope === "read_only" ? "read_only" : "read_write";
      vendorScope = p.vendor_id;
      admin
        .from("vendor_access_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", p.id)
        .then(({ error }) => {
          if (error) console.error("[vendora-mcp] pat last_used bump failed", error);
        });
    }
  }

  if (!userId || !authMethod) {
    return unauthorized(id, "invalid token");
  }

  // prompts/get: render a pre-filled prompt the vendor invoked
  // from Claude.ai's slash menu. No DB writes, no MCP call_log
  // entry — this is a templating call.
  if (method === "prompts/get") {
    const promptName = String(params?.name ?? "");
    const promptArgs = (params?.arguments ?? {}) as Record<string, any>;
    const rendered = renderPrompt(promptName, promptArgs);
    if (!rendered) {
      return rpcError(id, -32602, `Unknown prompt or missing required arguments: ${promptName}`);
    }
    return rpcResult(id, rendered);
  }

  // resources/read: fetch the content for a referenced URI. Subject
  // to the same ownership rules as the underlying tools — we route
  // through the same handlers and serialize the result as a JSON
  // text block. Logged so vendors can see in the activity panel
  // when Claude reads a resource.
  if (method === "resources/read") {
    const uri = String(params?.uri ?? "");
    const startedAt = Date.now();
    const logResourceRead = (ok: boolean, error: string | null) => {
      admin
        .from("mcp_call_log")
        .insert({
          user_id: userId,
          client_id: clientId,
          auth_method: authMethod,
          tool_name: `resources/read`,
          args: { uri },
          ok,
          error,
          duration_ms: Date.now() - startedAt,
        })
        .then(({ error: e }) => {
          if (e) console.error("[vendora-mcp] resource log insert failed", e);
        });
    };
    try {
      const payload = await readResource(admin, userId, uri);
      logResourceRead(true, null);
      return rpcResult(id, {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[vendora-mcp] resource error", uri, err);
      logResourceRead(false, msg);
      return rpcError(id, -32602, msg);
    }
  }

  // completion/complete: when Claude is filling a prompt argument
  // or a resource-template variable, the server can suggest values.
  // We respect vendor scope so completions on a listing-scoped
  // token only see that listing's data.
  if (method === "completion/complete") {
    try {
      const completion = await completeArgument(admin, userId, vendorScope, params ?? {});
      return rpcResult(id, { completion });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return rpcError(id, -32602, msg);
    }
  }

  if (method !== "tools/call") {
    return rpcError(id, -32601, `Method not found: ${method}`);
  }

  const toolName = String(params?.name ?? "");
  const args = (params?.arguments ?? {}) as Record<string, any>;
  const startedAt = Date.now();

  // Best-effort audit logger. Fires once per tool/call regardless
  // of outcome. We strip giant text fields from args (body, detail)
  // to keep the jsonb compact. Idempotency key + result message id
  // are extra columns that let sendReply replay safely on retry.
  const logCall = (
    ok: boolean,
    error: string | null,
    extras: { idempotency_key?: string | null; result_message_id?: string | null } = {},
  ) => {
    const safeArgs: Record<string, any> = {};
    for (const [k, v] of Object.entries(args)) {
      if (typeof v === "string" && v.length > 200) {
        safeArgs[k] = `${v.slice(0, 200)}…(${v.length} chars)`;
      } else {
        safeArgs[k] = v;
      }
    }
    admin
      .from("mcp_call_log")
      .insert({
        user_id: userId,
        client_id: clientId,
        auth_method: authMethod,
        tool_name: toolName,
        args: safeArgs,
        ok,
        error,
        duration_ms: Date.now() - startedAt,
        idempotency_key: extras.idempotency_key ?? null,
        result_message_id: extras.result_message_id ?? null,
      })
      .then(({ error: e }) => {
        if (e) console.error("[vendora-mcp] call log insert failed", e);
      });
  };

  // Scope check: read-only tokens cannot call write tools. We log
  // the rejected call so the vendor sees "tried to send_reply with
  // a read-only token" in their activity log.
  if (scope === "read_only" && WRITE_TOOLS.has(toolName)) {
    const msg = `Scope: this token is read_only and cannot call '${toolName}'.`;
    logCall(false, msg);
    return rpcError(id, -32030, msg);
  }

  // Rate-limit BEFORE running the tool. Log the rejected call so
  // the vendor can see "Claude was rate-limited at 3:14pm" in the
  // activity log. We return HTTP 429 with RateLimit-* headers so
  // clients can back off intelligently.
  const limit = await checkRateLimit(admin, userId, toolName);
  if (limit) {
    logCall(false, limit.message);
    return rateLimited(id, limit.message, limit.info);
  }

  try {
    const result = await runTool(admin, userId, toolName, args, vendorScope);
    // Pluck the internal fields (prefixed with _) before logging
    // and serializing — they're plumbing, not user-facing output.
    const r = result as Record<string, any> | null;
    const idemKey = (r?._idempotency_key as string | null | undefined) ?? null;
    const resultMessageId =
      (r?._result_message_id as string | null | undefined) ?? null;
    if (r) {
      delete r._idempotency_key;
      delete r._result_message_id;
    }
    logCall(true, null, {
      idempotency_key: idemKey,
      result_message_id: resultMessageId,
    });
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    });
  } catch (err) {
    console.error("[vendora-mcp] tool error", toolName, err);
    const msg = err instanceof Error ? err.message : String(err);
    logCall(false, msg);
    return rpcError(id, -32603, msg);
  }
});

async function runTool(
  admin: any,
  userId: string,
  name: string,
  args: Record<string, any>,
  vendorScope: string | null,
): Promise<unknown> {
  switch (name) {
    case "list_inquiries":
      return await listInquiries(admin, userId, args, vendorScope);
    case "get_inquiry":
      return await getInquiry(admin, userId, String(args.inquiry_id ?? ""), vendorScope);
    case "get_hilux_settings":
      return await getHiluxSettings(admin, userId);
    case "list_listings":
      return await listListings(admin, userId, vendorScope);
    case "send_reply":
      return await sendReply(admin, userId, args, vendorScope);
    case "pause_hilux_thread":
      return await setHiluxPause(admin, userId, String(args.thread_id ?? ""), true, vendorScope);
    case "resume_hilux_thread":
      return await setHiluxPause(admin, userId, String(args.thread_id ?? ""), false, vendorScope);
    case "update_hilux_settings":
      return await updateHiluxSettings(admin, userId, args);
    case "mark_inquiry":
      return await markInquiry(admin, userId, args, vendorScope);
    case "get_action_log":
      return await getActionLog(admin, userId, args);
    case "get_mcp_call_log":
      return await getMcpCallLog(admin, userId, args);
    case "compose_draft_reply":
      return await composeDraftReply(admin, userId, args, vendorScope);
    case "regenerate_last_hilux_reply":
      return await regenerateLastHiluxReply(admin, userId, String(args.thread_id ?? ""), vendorScope);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function listInquiries(
  admin: any,
  userId: string,
  args: Record<string, any>,
  vendorScope: string | null,
) {
  // Resolve vendor_profiles the caller owns, then filter inquiries
  // to those vendor_ids. Service-role bypasses RLS, so we enforce
  // ownership explicitly here. When the token is bound to a single
  // vendor we narrow the list to just that one.
  const { data: vendors } = await admin
    .from("vendor_profiles")
    .select("id, business_name")
    .eq("user_id", userId);
  let vendorIds = ((vendors ?? []) as Array<{ id: string }>).map((v) => v.id);
  if (vendorScope) {
    vendorIds = vendorIds.filter((id) => id === vendorScope);
  }
  if (vendorIds.length === 0) return { inquiries: [], next_cursor: null };

  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  // Cursor: ISO of last_message_at on the last row returned in
  // the previous page. We fetch limit+1 so we know whether there's
  // another page; the +1 is dropped before returning and its
  // last_message_at becomes the next_cursor.
  // lead_score lives on inquiry_scores. Embed via the FK so each
  // returned inquiry carries its score inline; the filter on
  // args.lead_score applies through the embed.
  const baseCols =
    "id, vendor_id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status, last_message_at, created_at";
  const scoreEmbed =
    "inquiry_scores(lead_score, lead_score_reason, lead_score_updated_at, booking_intent_at, booking_intent_reason)";
  let q = admin
    .from("inquiries")
    .select(`${baseCols}, ${scoreEmbed}`)
    .in("vendor_id", vendorIds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);
  if (typeof args.status === "string") q = q.eq("status", args.status);
  if (typeof args.lead_score === "string") {
    q = q.eq("inquiry_scores.lead_score", args.lead_score);
  }
  if (typeof args.cursor === "string" && args.cursor) {
    q = q.lt("last_message_at", args.cursor);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = ((data as Array<any> | null) ?? []).map((r) => {
    const s = Array.isArray(r.inquiry_scores) ? r.inquiry_scores[0] : r.inquiry_scores;
    const { inquiry_scores: _drop, ...rest } = r;
    return { ...rest, ...(s ?? {}) };
  });
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    nextCursor = (rows[rows.length - 1] as { last_message_at?: string })?.last_message_at ?? null;
  }
  return { inquiries: rows, next_cursor: nextCursor };
}

async function getInquiry(
  admin: any,
  userId: string,
  inquiryId: string,
  vendorScope: string | null,
) {
  if (!inquiryId) throw new Error("inquiry_id is required");

  // Ownership: load the inquiry's vendor and check the user owns it.
  // Embed inquiry_scores so the score arrives inline.
  const { data: inq, error } = await admin
    .from("inquiries")
    .select(
      "*, vendor_profiles!inner(user_id, business_name), inquiry_scores(lead_score, lead_score_reason, lead_score_updated_at, booking_intent_at, booking_intent_reason)",
    )
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) throw error;
  if (!inq) throw new Error("inquiry not found");
  const ownerId = (inq as any).vendor_profiles?.user_id;
  if (ownerId !== userId) throw new Error("not_your_inquiry");
  if (vendorScope && (inq as any).vendor_id !== vendorScope) {
    throw new Error("not_your_vendor: token is bound to a different vendor");
  }
  // Flatten the score embed onto the inquiry for response shape parity
  // with the old columns.
  const s = (inq as any).inquiry_scores;
  const score = Array.isArray(s) ? s[0] : s;
  if (score) Object.assign(inq as object, score);
  delete (inq as any).inquiry_scores;

  // Pull thread + last 30 messages.
  const { data: thread } = await admin
    .from("direct_threads")
    .select("id, host_id, hilux_paused, hilux_typing_until, created_at")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();

  let messages: any[] = [];
  if (thread) {
    const { data: msgs } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, is_hilux_generated, created_at")
      .eq("thread_id", (thread as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(30);
    messages = ((msgs ?? []) as any[]).slice().reverse();
  }

  return {
    inquiry: { ...(inq as any), vendor_profiles: undefined },
    thread,
    messages,
  };
}

async function getHiluxSettings(admin: any, userId: string) {
  // Profile holds the toggles; private config holds instructions +
  // voice samples (separate table with owner-only RLS).
  const [profRes, privRes] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "hilux_enabled, hilux_action_follow_up, hilux_action_quiet_hours, hilux_action_pause_weekends, hilux_action_skip_when_active, hilux_action_use_calendar, hilux_action_detect_frustration, hilux_action_mention_starting_price, hilux_action_suggest_package, hilux_action_decline_negotiation, hilux_action_avoid_competitors, hilux_action_send_portfolio_link, hilux_action_offer_call, hilux_action_share_booking_process, hilux_action_echo_question, hilux_action_acknowledge_emotion, hilux_action_lead_with_question, hilux_action_refuse_legal, hilux_action_refuse_competitor_pricing, hilux_action_no_other_clients, hilux_action_redact_contact, hilux_action_auto_mark_replied, hilux_action_notify_on_reply, hilux_action_update_inquiry_fields, hilux_action_notify_on_escalation, hilux_action_notify_on_hot_lead, hilux_action_email_reply_copies, hilux_action_auto_archive_cold, hilux_action_daily_summary, hilux_action_cap_replies_per_inquiry, hilux_action_detect_booking_intent, hilux_action_log_actions",
      )
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("hilux_private_config")
      .select("hilux_instructions, hilux_voice_samples")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profRes.error) throw profRes.error;
  if (privRes.error) throw privRes.error;
  return {
    hilux: profRes.data ?? null,
    private: privRes.data ?? null,
  };
}

async function listListings(
  admin: any,
  userId: string,
  vendorScope: string | null,
) {
  let q = admin
    .from("vendor_profiles")
    .select(
      "id, business_name, category, location, base_price_cents, application_status, slug, verified_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (vendorScope) q = q.eq("id", vendorScope);
  const { data, error } = await q;
  if (error) throw error;
  return { listings: data ?? [] };
}

async function getActionLog(
  admin: any,
  userId: string,
  args: Record<string, any>,
) {
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  // Cursor pagination: fetch limit+1; if extra row present, its
  // created_at becomes the next_cursor. Clients pass it back via
  // args.cursor on the subsequent call.
  let q = admin
    .from("hilux_action_log")
    .select("id, vendor_id, thread_id, inquiry_id, message_id, action, detail, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (typeof args.action === "string") q = q.eq("action", args.action);
  if (typeof args.cursor === "string" && args.cursor) {
    q = q.lt("created_at", args.cursor);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = ((data as Array<{ created_at: string }> | null) ?? []);
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    nextCursor = rows[rows.length - 1]?.created_at ?? null;
  }
  return { entries: rows, next_cursor: nextCursor };
}

// Mirror of getActionLog but for Claude's own MCP call log. Lets
// Claude introspect what it has done via this connector when the
// vendor asks "what have you been doing for me?".
async function getMcpCallLog(
  admin: any,
  userId: string,
  args: Record<string, any>,
) {
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  let q = admin
    .from("mcp_call_log")
    .select("id, tool_name, args, ok, error, duration_ms, auth_method, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (typeof args.tool_name === "string") q = q.eq("tool_name", args.tool_name);
  if (typeof args.cursor === "string" && args.cursor) {
    q = q.lt("created_at", args.cursor);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = ((data as Array<{ created_at: string }> | null) ?? []);
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    nextCursor = rows[rows.length - 1]?.created_at ?? null;
  }
  return { entries: rows, next_cursor: nextCursor };
}

// Read a resource by URI. Reuses the existing handlers so
// ownership + RLS semantics are identical to the corresponding
// tools — vendora://inquiry/<id> calls the same getInquiry the
// get_inquiry tool does.
async function readResource(
  admin: any,
  userId: string,
  uri: string,
): Promise<unknown> {
  if (!uri.startsWith("vendora://")) {
    throw new Error("invalid uri scheme; expected vendora://...");
  }
  const path = uri.slice("vendora://".length);
  if (path === "settings") {
    return await getHiluxSettings(admin, userId);
  }
  if (path === "activity") {
    return await getActionLog(admin, userId, {});
  }
  if (path === "listings") {
    return await listListings(admin, userId);
  }
  if (path.startsWith("inquiry/")) {
    const inquiryId = path.slice("inquiry/".length);
    if (!inquiryId) throw new Error("inquiry id required");
    return await getInquiry(admin, userId, inquiryId);
  }
  if (path.startsWith("thread/")) {
    const threadId = path.slice("thread/".length);
    if (!threadId) throw new Error("thread id required");
    const thread = await loadOwnedThread(admin, userId, threadId);
    const { data: messages } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, created_at, is_hilux_generated, edited_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const ordered = ((messages ?? []) as any[]).slice().reverse();
    return { thread_id: thread.id, vendor_id: thread.vendor_id, messages: ordered };
  }
  throw new Error(`unknown resource: ${uri}`);
}

// -------- Write tools --------

// Verify that a thread belongs to a vendor_profile this user owns.
// Returns the loaded thread row on success; throws on miss/foreign.
async function loadOwnedThread(
  admin: any,
  userId: string,
  threadId: string,
  vendorScope: string | null = null,
) {
  if (!threadId) throw new Error("thread_id is required");
  const { data: thread, error } = await admin
    .from("direct_threads")
    .select("id, vendor_id, host_id, inquiry_id, hilux_paused, vendor_profiles!inner(user_id)")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw error;
  if (!thread) throw new Error("thread not found");
  const ownerId = (thread as any).vendor_profiles?.user_id;
  if (ownerId !== userId) throw new Error("not_your_thread");
  if (vendorScope && (thread as any).vendor_id !== vendorScope) {
    throw new Error("not_your_vendor: token is bound to a different vendor");
  }
  return thread as {
    id: string;
    vendor_id: string;
    host_id: string;
    inquiry_id: string | null;
    hilux_paused: boolean;
  };
}

async function sendReply(
  admin: any,
  userId: string,
  args: Record<string, any>,
  vendorScope: string | null,
) {
  const body = String(args.body ?? "").trim();
  if (!body) throw new Error("body is required");
  const thread = await loadOwnedThread(admin, userId, String(args.thread_id ?? ""), vendorScope);
  const idempotencyKey =
    typeof args.idempotency_key === "string" && args.idempotency_key.trim()
      ? args.idempotency_key.trim().slice(0, 80)
      : null;

  // Idempotency replay: if we've seen this key from this user in
  // the last 10 minutes AND it succeeded, return the original
  // message instead of inserting a duplicate. The mcp_call_log row
  // for THAT prior call carries the result_message_id we wrote
  // alongside it.
  if (idempotencyKey) {
    const sinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: prior } = await admin
      .from("mcp_call_log")
      .select("result_message_id, ok")
      .eq("user_id", userId)
      .eq("tool_name", "send_reply")
      .eq("idempotency_key", idempotencyKey)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1);
    const priorRow = (prior ?? [])[0] as
      | { result_message_id: string | null; ok: boolean }
      | undefined;
    if (priorRow?.ok && priorRow.result_message_id) {
      const { data: msg } = await admin
        .from("direct_messages")
        .select("id, created_at")
        .eq("id", priorRow.result_message_id)
        .maybeSingle();
      if (msg) {
        return {
          sent: true,
          message_id: (msg as { id: string }).id,
          created_at: (msg as { created_at: string }).created_at,
          replayed: true,
        };
      }
    }
  }

  const { data, error } = await admin
    .from("direct_messages")
    .insert({
      thread_id: thread.id,
      sender_id: userId,
      sender_role: "vendor",
      body,
      is_hilux_generated: false,
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return {
    sent: true,
    message_id: (data as { id: string }).id,
    created_at: (data as { created_at: string }).created_at,
    // surfaced to the call-log writer so it can store this on the row
    _idempotency_key: idempotencyKey,
    _result_message_id: (data as { id: string }).id,
  };
}

async function setHiluxPause(
  admin: any,
  userId: string,
  threadId: string,
  paused: boolean,
  vendorScope: string | null,
) {
  const thread = await loadOwnedThread(admin, userId, threadId, vendorScope);
  const { error } = await admin
    .from("direct_threads")
    .update({ hilux_paused: paused })
    .eq("id", thread.id);
  if (error) throw error;
  return { thread_id: thread.id, hilux_paused: paused };
}

async function updateHiluxSettings(
  admin: any,
  userId: string,
  args: Record<string, any>,
) {
  const patch: Record<string, any> = {};
  if (typeof args.enabled === "boolean") patch.hilux_enabled = args.enabled;
  if (args.actions && typeof args.actions === "object") {
    for (const [k, v] of Object.entries(args.actions)) {
      if (typeof v !== "boolean") continue;
      if (!ALLOWED_ACTION_KEYS.has(k)) continue;
      patch[`hilux_action_${k}`] = v;
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("no recognised fields in update");
  }
  const { error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", userId);
  if (error) throw error;
  return { updated: Object.keys(patch) };
}

async function markInquiry(
  admin: any,
  userId: string,
  args: Record<string, any>,
  vendorScope: string | null,
) {
  const inquiryId = String(args.inquiry_id ?? "");
  const status = String(args.status ?? "");
  if (!inquiryId) throw new Error("inquiry_id is required");
  if (!INQUIRY_STATUSES.includes(status as typeof INQUIRY_STATUSES[number])) {
    throw new Error(`status must be one of ${INQUIRY_STATUSES.join(", ")}`);
  }
  // Ownership: load via vendor_profiles join.
  const { data: inq, error } = await admin
    .from("inquiries")
    .select("id, vendor_id, vendor_profiles!inner(user_id)")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) throw error;
  if (!inq) throw new Error("inquiry not found");
  if ((inq as any).vendor_profiles?.user_id !== userId) {
    throw new Error("not_your_inquiry");
  }
  if (vendorScope && (inq as any).vendor_id !== vendorScope) {
    throw new Error("not_your_vendor: token is bound to a different vendor");
  }
  const { error: updErr } = await admin
    .from("inquiries")
    .update({ status })
    .eq("id", inquiryId);
  if (updErr) throw updErr;
  return { inquiry_id: inquiryId, status };
}

async function regenerateLastHiluxReply(
  admin: any,
  userId: string,
  threadId: string,
  vendorScope: string | null,
) {
  const thread = await loadOwnedThread(admin, userId, threadId, vendorScope);

  // Latest message must be HILUX-generated. Once the host has
  // replied, regen is moot.
  const { data: latest } = await admin
    .from("direct_messages")
    .select("id, sender_role, is_hilux_generated, body, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const target = (latest ?? [])[0];
  if (!target) throw new Error("thread has no messages");
  if (
    target.sender_role !== "vendor" ||
    target.is_hilux_generated !== true
  ) {
    throw new Error("not_the_latest_hilux_message");
  }

  const ctx = await loadVendorContext(admin, thread.vendor_id);
  if (!ctx.vendor) throw new Error("vendor not found");

  // History before the target — what HILUX should re-derive a reply from.
  const { data: history } = await admin
    .from("direct_messages")
    .select("sender_role, body, created_at")
    .eq("thread_id", thread.id)
    .lt("created_at", target.created_at)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const orderedHistory = (history ?? []).slice().reverse();
  const claudeMessages = orderedHistory.map((m: any) => ({
    role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
    content: m.body,
  }));
  if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
    throw new Error("no host message to reply to");
  }

  let inquiryCtx: any = null;
  if (thread.inquiry_id) {
    const { data: inq } = await admin
      .from("inquiries")
      .select(
        "event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests",
      )
      .eq("id", thread.inquiry_id)
      .maybeSingle();
    if (inq) {
      const min = priceUsd(inq.budget_min_cents);
      const max = priceUsd(inq.budget_max_cents);
      const range = min && max ? `${min}–${max}` : min ?? max ?? null;
      inquiryCtx = {
        eventType: inq.event_type,
        eventDate: inq.event_date,
        guestCount: inq.guest_count,
        location: inq.location,
        budgetRangeUsd: range,
        specialRequests: inq.special_requests,
      };
    }
  }

  const actions = ctx.profile?.actions ?? DEFAULT_ACTIONS;
  const systemText = buildSystemPrompt({
    businessName: ctx.vendor.business_name ?? "this vendor",
    category: ctx.vendor.category,
    bio: ctx.vendor.bio,
    location: ctx.vendor.location,
    startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
    customInstructions: ctx.profile?.hilux_instructions ?? null,
    voiceSamples: ctx.profile?.hilux_voice_samples ?? [],
    packages: ctx.packages,
    faqs: ctx.faqs,
    inquiry: inquiryCtx,
    availability: ctx.availability,
    actions,
    hostFirstName: null,
    isFirstReply: !orderedHistory.some(
      (m: any) => m.sender_role === "vendor" && m.is_hilux_generated === true,
    ),
  });

  const seasoned = systemText +
    "\n\nIMPORTANT: The vendor has just asked you to RE-DRAFT a reply because they didn't love the previous version. Take a noticeably different angle — different opener, different emphasis — while still answering the host's most recent message. Don't apologize or reference the previous draft.";

  const reply = await callClaude(ANTHROPIC_API_KEY, seasoned, claudeMessages);
  if (/^\s*ESCALATE\s*:/i.test(reply)) {
    throw new Error("would_escalate — Claude declined; vendor should reply manually");
  }

  const { error: updErr } = await admin
    .from("direct_messages")
    .update({ body: reply, edited_at: new Date().toISOString() })
    .eq("id", target.id);
  if (updErr) throw updErr;
  return { regenerated: true, message_id: target.id, length: reply.length };
}

async function composeDraftReply(
  admin: any,
  userId: string,
  args: Record<string, any>,
  vendorScope: string | null,
) {
  const thread = await loadOwnedThread(admin, userId, String(args.thread_id ?? ""), vendorScope);
  const overrideInstructions =
    typeof args.instructions === "string" ? args.instructions.slice(0, 1000) : null;

  const ctx = await loadVendorContext(admin, thread.vendor_id);
  if (!ctx.vendor) throw new Error("vendor not found");

  // Pull the full recent transcript (oldest→newest) so HILUX
  // builds the draft from the same context the auto-reply path
  // sees. We include is_hilux_generated so isFirstReply keys off
  // the correct column.
  const { data: history } = await admin
    .from("direct_messages")
    .select("sender_role, body, created_at, is_hilux_generated")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const orderedHistory = ((history ?? []) as Array<{
    sender_role: string;
    body: string;
    is_hilux_generated: boolean;
  }>).slice().reverse();
  if (
    orderedHistory.length === 0 ||
    orderedHistory[orderedHistory.length - 1].sender_role !== "host"
  ) {
    throw new Error("no host message to reply to");
  }
  const claudeMessages = orderedHistory.map((m) => ({
    role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
    content: m.body,
  }));

  let inquiryCtx: any = null;
  if (thread.inquiry_id) {
    const { data: inq } = await admin
      .from("inquiries")
      .select(
        "event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests",
      )
      .eq("id", thread.inquiry_id)
      .maybeSingle();
    if (inq) {
      const min = priceUsd(inq.budget_min_cents);
      const max = priceUsd(inq.budget_max_cents);
      const range = min && max ? `${min}–${max}` : min ?? max ?? null;
      inquiryCtx = {
        eventType: inq.event_type,
        eventDate: inq.event_date,
        guestCount: inq.guest_count,
        location: inq.location,
        budgetRangeUsd: range,
        specialRequests: inq.special_requests,
      };
    }
  }

  const actions = ctx.profile?.actions ?? DEFAULT_ACTIONS;
  // Stack the per-call override on top of the vendor's saved
  // instructions so Claude can nudge the draft without permanently
  // changing the agent's voice.
  const baseInstructions = ctx.profile?.hilux_instructions ?? null;
  const customInstructions = overrideInstructions
    ? `${baseInstructions ?? ""}\n\nFor this draft only: ${overrideInstructions}`.trim()
    : baseInstructions;

  const systemText = buildSystemPrompt({
    businessName: ctx.vendor.business_name ?? "this vendor",
    category: ctx.vendor.category,
    bio: ctx.vendor.bio,
    location: ctx.vendor.location,
    startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
    customInstructions,
    voiceSamples: ctx.profile?.hilux_voice_samples ?? [],
    packages: ctx.packages,
    faqs: ctx.faqs,
    inquiry: inquiryCtx,
    availability: ctx.availability,
    actions,
    hostFirstName: null,
    isFirstReply: !orderedHistory.some(
      (m) => m.is_hilux_generated === true,
    ),
  });

  const reply = await callClaude(ANTHROPIC_API_KEY, systemText, claudeMessages);
  // Strip the ESCALATE token if HILUX would have escalated — for
  // a draft, we still want Claude to see the text.
  const sanitized = reply.replace(/^\s*ESCALATE\s*:.*$/im, "").trim() || reply.trim();
  return {
    draft: sanitized,
    length: sanitized.length,
    would_escalate: /^\s*ESCALATE\s*:/i.test(reply),
    thread_id: thread.id,
  };
}
