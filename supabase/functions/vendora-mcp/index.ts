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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
const TOOLS = [
  {
    name: "list_inquiries",
    description:
      "List the vendor's inquiries, newest first. Filter by status (new/replied/won/lost/expired) or lead_score (hot/warm/cold/unknown).",
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
      },
    },
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
  },
  {
    name: "get_hilux_settings",
    description:
      "Return the vendor's current HILUX configuration: master enabled flag, custom greeting, reply length, and every action toggle. Useful when the vendor asks Claude what HILUX is set to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_listings",
    description:
      "Return the vendor's listings (vendor_profiles rows they own) with category, location, base price, and approval status.",
    inputSchema: { type: "object", properties: {} },
  },
];

// Initialize handshake response. Capabilities tell the client what
// this server supports; tools-only for now.
const INITIALIZE_RESULT = {
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: { listChanged: false },
  },
  serverInfo: {
    name: "vendora",
    version: "0.1.0",
  },
  instructions:
    "Vendora exposes a vendor's marketplace inbox + HILUX configuration to Claude. Use list_inquiries to see what's waiting, get_inquiry to drill in, and get_hilux_settings to inspect the always-on agent's setup.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
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

  // `tools/list` is technically auth-required by spec, but
  // returning the catalog publicly is harmless and improves DX.
  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  // Beyond this point: bearer token required.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) {
    return rpcError(id, -32001, "Unauthorized: missing bearer token");
  }
  const tokenHash = await sha256Hex(bearer);
  const { data: tokenRow } = await admin
    .from("vendor_access_tokens")
    .select("id, user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!tokenRow) {
    return rpcError(id, -32001, "Unauthorized: invalid token");
  }
  const userId = (tokenRow as { user_id: string }).user_id;
  // Best-effort last_used bump; ignore failures.
  admin
    .from("vendor_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", (tokenRow as { id: string }).id)
    .then(({ error }) => {
      if (error) console.error("[vendora-mcp] last_used bump failed", error);
    });

  if (method !== "tools/call") {
    return rpcError(id, -32601, `Method not found: ${method}`);
  }

  const toolName = String(params?.name ?? "");
  const args = (params?.arguments ?? {}) as Record<string, any>;

  try {
    const result = await runTool(admin, userId, toolName, args);
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    });
  } catch (err) {
    console.error("[vendora-mcp] tool error", toolName, err);
    return rpcError(
      id,
      -32603,
      err instanceof Error ? err.message : String(err),
    );
  }
});

async function runTool(
  admin: any,
  userId: string,
  name: string,
  args: Record<string, any>,
): Promise<unknown> {
  switch (name) {
    case "list_inquiries":
      return await listInquiries(admin, userId, args);
    case "get_inquiry":
      return await getInquiry(admin, userId, String(args.inquiry_id ?? ""));
    case "get_hilux_settings":
      return await getHiluxSettings(admin, userId);
    case "list_listings":
      return await listListings(admin, userId);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function listInquiries(
  admin: any,
  userId: string,
  args: Record<string, any>,
) {
  // Resolve vendor_profiles the caller owns, then filter inquiries
  // to those vendor_ids. Service-role bypasses RLS, so we enforce
  // ownership explicitly here.
  const { data: vendors } = await admin
    .from("vendor_profiles")
    .select("id, business_name")
    .eq("user_id", userId);
  const vendorIds = ((vendors ?? []) as Array<{ id: string }>).map((v) => v.id);
  if (vendorIds.length === 0) return { inquiries: [] };

  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  let q = admin
    .from("inquiries")
    .select(
      "id, vendor_id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status, last_message_at, lead_score, lead_score_reason, lead_score_updated_at, created_at",
    )
    .in("vendor_id", vendorIds)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (typeof args.status === "string") q = q.eq("status", args.status);
  if (typeof args.lead_score === "string") q = q.eq("lead_score", args.lead_score);
  const { data, error } = await q;
  if (error) throw error;
  return { inquiries: data ?? [] };
}

async function getInquiry(admin: any, userId: string, inquiryId: string) {
  if (!inquiryId) throw new Error("inquiry_id is required");

  // Ownership: load the inquiry's vendor and check the user owns it.
  const { data: inq, error } = await admin
    .from("inquiries")
    .select("*, vendor_profiles!inner(user_id, business_name)")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) throw error;
  if (!inq) throw new Error("inquiry not found");
  const ownerId = (inq as any).vendor_profiles?.user_id;
  if (ownerId !== userId) throw new Error("not_your_inquiry");

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
  const { data, error } = await admin
    .from("profiles")
    .select(
      "hilux_enabled, hilux_instructions, hilux_greeting_line, hilux_reply_length, hilux_action_follow_up, hilux_action_quiet_hours, hilux_action_pause_weekends, hilux_action_skip_when_active, hilux_action_use_calendar, hilux_action_escalate, hilux_action_detect_frustration, hilux_action_mention_starting_price, hilux_action_suggest_package, hilux_action_decline_negotiation, hilux_action_avoid_competitors, hilux_action_send_portfolio_link, hilux_action_offer_call, hilux_action_share_booking_process, hilux_action_echo_question, hilux_action_acknowledge_emotion, hilux_action_lead_with_question, hilux_action_refuse_legal, hilux_action_refuse_competitor_pricing, hilux_action_no_other_clients, hilux_action_redact_contact, hilux_action_auto_mark_replied, hilux_action_notify_on_reply, hilux_action_update_inquiry_fields, hilux_action_notify_on_escalation, hilux_action_notify_on_hot_lead, hilux_action_email_reply_copies, hilux_action_auto_archive_cold, hilux_action_daily_summary, hilux_action_cap_replies_per_inquiry, hilux_action_detect_booking_intent, hilux_action_log_actions",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return { hilux: data ?? null };
}

async function listListings(admin: any, userId: string) {
  const { data, error } = await admin
    .from("vendor_profiles")
    .select(
      "id, business_name, category, location, base_price_cents, application_status, slug, verified_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return { listings: data ?? [] };
}
