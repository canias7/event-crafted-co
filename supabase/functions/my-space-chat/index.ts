// My Space chat — vendor-side conversational AI surface, served from
// the /vendor/ai-superagents page.
//
// What it does now:
//   • Persists conversations in my_space_threads + my_space_messages
//     so vendors can keep multiple named chats and pick up where they
//     left off.
//   • Always-injects a vendor context snapshot (profile, active
//     packages, calendar summary, inquiry counts, hot-lead count) into
//     the system prompt so Claude can answer common "what's on my
//     plate" questions without a tool call.
//   • Exposes deeper-lookup tools (search_inquiries, get_inquiry,
//     check_availability) that Claude can call on demand for specifics
//     that don't fit in always-context.
//   • Image asks ("draw…", "generate a moody product shot…") still
//     route to gpt-image-2 (with gpt-image-1 fallback). Image
//     generation does NOT go through the tool loop — we detect upfront
//     so we don't burn a Claude turn just to dispatch.
//
// Auth: signed-in user only. We resolve the caller's vendor_id from
// vendor_team_members (or vendor_profiles.user_id as a fallback), and
// all data tools are scoped to that vendor.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const SONNET_MODEL = "claude-sonnet-4-6";
const IMAGE_MODEL_PRIMARY = "gpt-image-2";
const IMAGE_MODEL_FALLBACK = "gpt-image-1";
const MAX_TOOL_ITERATIONS = 6;
const CONTEXT_HORIZON_DAYS = 30;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ─── Image routing ────────────────────────────────────────────────

// Heuristic: does the latest user message read as an image request?
// Kept on the keyword side rather than asking Claude — every
// classification roundtrip would double latency on every send.
function looksLikeImageRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return false;
  const head = t.slice(0, 120);
  const verbs =
    /(draw|generate|create|make|paint|design|render|sketch|illustrate|produce|show me|give me)/;
  const nouns =
    /(image|picture|photo|photograph|illustration|art(work)?|render|graphic|logo|mockup|poster|flyer|product shot|scene|portrait|painting)/;
  return verbs.test(head) && nouns.test(head);
}

async function callOpenAIImage(
  prompt: string,
): Promise<{ imageUrl: string }> {
  if (!OPENAI_API_KEY) throw new Error("openai_key_missing");
  const headers = {
    authorization: `Bearer ${OPENAI_API_KEY}`,
    "content-type": "application/json",
  };
  const body = (model: string) =>
    JSON.stringify({ model, prompt, size: "1024x1024", n: 1 });
  let res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers,
    body: body(IMAGE_MODEL_PRIMARY),
  });
  if (res.status === 400 || res.status === 404) {
    const detail = await res.clone().text().catch(() => "");
    if (/model_not_found|does not exist|invalid_model/i.test(detail)) {
      console.warn(
        `[my-space-chat] ${IMAGE_MODEL_PRIMARY} unavailable, falling back to ${IMAGE_MODEL_FALLBACK}`,
      );
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers,
        body: body(IMAGE_MODEL_FALLBACK),
      });
    }
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`openai ${res.status}: ${t.slice(0, 240)}`);
  }
  const parsed = (await res.json()) as any;
  const first = parsed?.data?.[0];
  if (first?.url) return { imageUrl: first.url };
  if (first?.b64_json) {
    return { imageUrl: `data:image/png;base64,${first.b64_json}` };
  }
  throw new Error("openai_no_image_in_response");
}

// ─── Vendor lookup ────────────────────────────────────────────────

async function findVendorIdForUser(
  admin: any,
  userId: string,
): Promise<string | null> {
  // Team membership wins (covers both owners and invited team members
  // since the owner is also written to vendor_team_members on profile
  // creation).
  const { data: team } = await admin
    .from("vendor_team_members")
    .select("vendor_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (team?.vendor_id) return team.vendor_id as string;
  // Belt-and-suspenders fallback for pre-team-table rows.
  const { data: owned } = await admin
    .from("vendor_profiles")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (owned?.id as string | undefined) ?? null;
}

// ─── Always-context snapshot ──────────────────────────────────────

interface VendorSnapshot {
  vendor: {
    id: string;
    business_name: string | null;
    category: string | null;
    location: string | null;
  };
  packages: Array<{
    name: string;
    description: string | null;
    price_cents: number | null;
  }>;
  calendar: {
    today: string;
    horizonDays: number;
    busyDates: string[];
    recurringClosedDays: number[];
  };
  inquiryCounts: { new: number; replied: number; closed: number };
  hotLeadsCount: number;
}

async function buildVendorSnapshot(
  admin: any,
  vendorId: string,
): Promise<VendorSnapshot> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const horizonIso = new Date(
    today.getTime() + CONTEXT_HORIZON_DAYS * 86400000,
  )
    .toISOString()
    .slice(0, 10);

  const [
    { data: vendor },
    { data: packages },
    { data: unavailable },
    { data: rules },
    { data: booked },
    { data: counts },
    { data: hotLeads },
  ] = await Promise.all([
    admin
      .from("vendor_profiles")
      .select("id, business_name, category, location")
      .eq("id", vendorId)
      .maybeSingle(),
    admin
      .from("vendor_packages")
      .select("name, description, price_cents, display_order")
      .eq("vendor_id", vendorId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(10),
    admin
      .from("vendor_unavailable_dates")
      .select("date")
      .eq("vendor_id", vendorId)
      .gte("date", todayIso)
      .lte("date", horizonIso),
    admin
      .from("vendor_availability_rules")
      .select("day_of_week, is_unavailable")
      .eq("vendor_id", vendorId)
      .eq("is_unavailable", true),
    admin.rpc("vendor_booked_dates", { p_vendor_id: vendorId }),
    admin
      .from("inquiries")
      .select("status")
      .eq("vendor_id", vendorId),
    admin
      .from("inquiry_scores")
      .select("inquiry_id, inquiries!inner(vendor_id)")
      .eq("inquiries.vendor_id", vendorId)
      .eq("lead_score", "hot"),
  ]);

  const busySet = new Set<string>();
  for (const r of (unavailable ?? []) as Array<{ date: string }>) {
    if (r.date) busySet.add(r.date.slice(0, 10));
  }
  for (
    const r of (booked ?? []) as Array<
      { vendor_booked_dates?: string } | string
    >
  ) {
    const v = typeof r === "string" ? r : r.vendor_booked_dates;
    if (v) busySet.add(String(v).slice(0, 10));
  }
  const busyDates = Array.from(busySet)
    .filter((d) => d >= todayIso && d <= horizonIso)
    .sort();

  const closedDays = ((rules ?? []) as Array<{ day_of_week: number }>)
    .map((r) => r.day_of_week);

  const inquiryCounts = { new: 0, replied: 0, closed: 0 };
  for (const row of (counts ?? []) as Array<{ status: string | null }>) {
    const s = row.status ?? "new";
    if (s === "new") inquiryCounts.new++;
    else if (s === "closed" || s === "declined") inquiryCounts.closed++;
    else inquiryCounts.replied++;
  }

  return {
    vendor: vendor as any ?? {
      id: vendorId,
      business_name: null,
      category: null,
      location: null,
    },
    packages: (packages ?? []) as VendorSnapshot["packages"],
    calendar: {
      today: todayIso,
      horizonDays: CONTEXT_HORIZON_DAYS,
      busyDates,
      recurringClosedDays: closedDays,
    },
    inquiryCounts,
    hotLeadsCount: ((hotLeads ?? []) as unknown[]).length,
  };
}

function priceUsd(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildSystemPrompt(snap: VendorSnapshot): string {
  const v = snap.vendor;
  const closedDays = snap.calendar.recurringClosedDays
    .map((d) => DOW[d])
    .filter(Boolean);
  const packagesText = snap.packages.length === 0
    ? "  (none published yet)"
    : snap.packages
      .map((p) =>
        `  • ${p.name} — ${priceUsd(p.price_cents)}${
          p.description ? ` — ${p.description.slice(0, 120)}` : ""
        }`
      )
      .join("\n");
  const busyText = snap.calendar.busyDates.length === 0
    ? "  (no busy dates in the next 30 days)"
    : `  ${snap.calendar.busyDates.slice(0, 20).join(", ")}${
      snap.calendar.busyDates.length > 20 ? "…" : ""
    }`;
  return `You are My Space, the in-app AI assistant for an event vendor on the Vendora platform.

You are talking to the vendor THEMSELVES (the business owner). You are NOT writing on their behalf to a host in this thread.

You help them:
- Draft replies to host inquiries (warm, professional, concise)
- Brainstorm pricing, packages, and upsells
- Plan their day, summarize their inbox, suggest follow-ups
- Answer questions about their schedule, leads, and active inquiries

Style:
- Direct and helpful. Short paragraphs. No filler.
- When drafting a host-facing reply, write the reply text itself — don't preface with "here's a draft."
- If you need more info to do the job, ask one specific follow-up question instead of guessing.
- If you reference an inquiry, give the host's event date + event type so they can identify it.

You have tools for deep lookups: use \`search_inquiries\` to find specific leads,
\`get_inquiry\` for the full message thread, and \`check_availability\` for any date
the vendor asks about (the snapshot below only covers the next 30 days).

═══ VENDOR SNAPSHOT (auto-refreshed each turn) ═══
Business: ${v.business_name ?? "(unnamed)"}${
    v.category ? ` · ${v.category}` : ""
  }${v.location ? ` · ${v.location}` : ""}
Today: ${snap.calendar.today}

Active packages:
${packagesText}

Calendar (next ${snap.calendar.horizonDays} days):
  Recurring closed: ${closedDays.length ? closedDays.join(", ") : "(none)"}
  Busy dates:
${busyText}

Inquiries: ${snap.inquiryCounts.new} new · ${snap.inquiryCounts.replied} in-progress · ${snap.inquiryCounts.closed} closed
Hot leads right now: ${snap.hotLeadsCount}
═══════════════════════════════════════════════════`;
}

// ─── Tools ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_inquiries",
    description:
      "Search the vendor's host inquiries. Returns a list with summary fields (host name, event type, event date, status, lead score). Use when the vendor asks about specific leads, recent activity, or wants to filter by status/quality.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["new", "replied", "closed", "any"],
          description:
            "Filter by inquiry status. 'replied' covers any inquiry that's not new or closed. Default 'any'.",
        },
        lead_score: {
          type: "string",
          enum: ["hot", "warm", "cold", "any"],
          description: "Filter by AI-assessed lead quality. Default 'any'.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Max results to return. Default 10.",
        },
      },
    },
  },
  {
    name: "get_inquiry",
    description:
      "Get full details for a single inquiry: event details, budget, special requests, and the most recent ~10 messages in the thread.",
    input_schema: {
      type: "object",
      required: ["inquiry_id"],
      properties: {
        inquiry_id: {
          type: "string",
          description: "UUID of the inquiry to fetch.",
        },
      },
    },
  },
  {
    name: "check_availability",
    description:
      "Check if the vendor is available on a specific date. Returns whether the day is free, recurring-closed, manually blocked, or has an existing booking.",
    input_schema: {
      type: "object",
      required: ["date"],
      properties: {
        date: {
          type: "string",
          description: "Date to check, format YYYY-MM-DD.",
        },
      },
    },
  },
] as const;

async function toolSearchInquiries(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 30);
  let query = admin
    .from("inquiries")
    .select(
      "id, event_type, event_date, guest_count, location, status, created_at, host_id",
    )
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const status = input?.status;
  if (status === "new") query = query.eq("status", "new");
  else if (status === "closed") {
    query = query.in("status", ["closed", "declined"]);
  } else if (status === "replied") {
    query = query.not("status", "in", "(new,closed,declined)");
  }
  const { data: rows, error } = await query;
  if (error) return { error: error.message };
  const list = (rows ?? []) as Array<any>;

  // Hydrate host display names + lead scores in parallel.
  const ids = list.map((r) => r.id);
  const hostIds = Array.from(new Set(list.map((r) => r.host_id))).filter(
    Boolean,
  );
  const [{ data: scores }, { data: hosts }] = await Promise.all([
    ids.length > 0
      ? admin
        .from("inquiry_scores")
        .select("inquiry_id, lead_score, lead_score_reason")
        .in("inquiry_id", ids)
      : Promise.resolve({ data: [] }),
    hostIds.length > 0
      ? admin
        .from("profiles")
        .select("id, display_name")
        .in("id", hostIds)
      : Promise.resolve({ data: [] }),
  ]);
  const scoreMap = new Map(
    ((scores ?? []) as Array<any>).map((s) => [s.inquiry_id, s]),
  );
  const hostMap = new Map(
    ((hosts ?? []) as Array<any>).map((h) => [h.id, h.display_name]),
  );

  let filtered = list.map((r) => ({
    inquiry_id: r.id,
    host_name: hostMap.get(r.host_id) ?? "(unknown host)",
    event_type: r.event_type,
    event_date: r.event_date,
    guest_count: r.guest_count,
    location: r.location,
    status: r.status,
    lead_score: scoreMap.get(r.id)?.lead_score ?? "unknown",
    lead_score_reason: scoreMap.get(r.id)?.lead_score_reason ?? null,
    created_at: r.created_at,
  }));
  const leadFilter = input?.lead_score;
  if (
    leadFilter && leadFilter !== "any" &&
    ["hot", "warm", "cold"].includes(leadFilter)
  ) {
    filtered = filtered.filter((r) => r.lead_score === leadFilter);
  }
  return { inquiries: filtered, count: filtered.length };
}

async function toolGetInquiry(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const inquiryId = String(input?.inquiry_id ?? "");
  if (!inquiryId) return { error: "inquiry_id required" };
  const { data: inq } = await admin
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!inq) return { error: "not_found_or_not_owned" };
  const [{ data: thread }, { data: score }, { data: host }] = await Promise
    .all([
      admin
        .from("direct_threads")
        .select("id")
        .eq("inquiry_id", inquiryId)
        .maybeSingle(),
      admin
        .from("inquiry_scores")
        .select("lead_score, lead_score_reason")
        .eq("inquiry_id", inquiryId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("display_name")
        .eq("id", (inq as any).host_id)
        .maybeSingle(),
    ]);
  let messages: Array<{ from: string; at: string; body: string }> = [];
  if ((thread as any)?.id) {
    const { data: msgs } = await admin
      .from("direct_messages")
      .select("sender_role, body, created_at")
      .eq("thread_id", (thread as any).id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    messages = (((msgs ?? []) as Array<any>).reverse()).map((m) => ({
      from: m.sender_role,
      at: m.created_at,
      body: m.body,
    }));
  }
  return {
    inquiry: {
      id: (inq as any).id,
      host_name: (host as any)?.display_name ?? "(unknown host)",
      event_type: (inq as any).event_type,
      event_date: (inq as any).event_date,
      guest_count: (inq as any).guest_count,
      location: (inq as any).location,
      budget_min_usd: (inq as any).budget_min_cents
        ? Math.round(((inq as any).budget_min_cents as number) / 100)
        : null,
      budget_max_usd: (inq as any).budget_max_cents
        ? Math.round(((inq as any).budget_max_cents as number) / 100)
        : null,
      special_requests: (inq as any).special_requests,
      status: (inq as any).status,
      created_at: (inq as any).created_at,
      lead_score: (score as any)?.lead_score ?? "unknown",
      lead_score_reason: (score as any)?.lead_score_reason ?? null,
    },
    recent_messages: messages,
  };
}

async function toolCheckAvailability(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const date = String(input?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date must be YYYY-MM-DD" };
  }
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const [{ data: rule }, { data: blocked }, { data: booked }] = await Promise
    .all([
      admin
        .from("vendor_availability_rules")
        .select("is_unavailable")
        .eq("vendor_id", vendorId)
        .eq("day_of_week", dow)
        .eq("is_unavailable", true)
        .maybeSingle(),
      admin
        .from("vendor_unavailable_dates")
        .select("date")
        .eq("vendor_id", vendorId)
        .eq("date", date)
        .maybeSingle(),
      admin.rpc("vendor_booked_dates", { p_vendor_id: vendorId }),
    ]);
  if (rule) {
    return {
      date,
      available: false,
      reason: `recurring_closed (${DOW[dow]})`,
    };
  }
  if (blocked) return { date, available: false, reason: "manually_blocked" };
  const bookedSet = new Set<string>();
  for (
    const r
      of (booked ?? []) as Array<{ vendor_booked_dates?: string } | string>
  ) {
    const v = typeof r === "string" ? r : r.vendor_booked_dates;
    if (v) bookedSet.add(String(v).slice(0, 10));
  }
  if (bookedSet.has(date)) {
    return { date, available: false, reason: "already_booked" };
  }
  return { date, available: true };
}

async function executeTool(
  admin: any,
  vendorId: string,
  name: string,
  input: any,
): Promise<unknown> {
  try {
    if (name === "search_inquiries") {
      return await toolSearchInquiries(admin, vendorId, input);
    }
    if (name === "get_inquiry") {
      return await toolGetInquiry(admin, vendorId, input);
    }
    if (name === "check_availability") {
      return await toolCheckAvailability(admin, vendorId, input);
    }
    return { error: `unknown_tool:${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Claude loop ──────────────────────────────────────────────────

interface ClaudeMessage {
  role: "user" | "assistant";
  content: any;
}

async function callClaudeWithTools(
  systemPrompt: string,
  initialMessages: ClaudeMessage[],
  admin: any,
  vendorId: string,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("anthropic_key_missing");
  let messages = [...initialMessages];
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
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
        tools: TOOLS,
        messages,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`anthropic ${res.status}: ${t.slice(0, 240)}`);
    }
    const parsed = (await res.json()) as any;
    const contentBlocks = (parsed.content ?? []) as Array<any>;
    if (parsed.stop_reason === "tool_use") {
      const toolUses = contentBlocks.filter((b: any) => b.type === "tool_use");
      const toolResults = await Promise.all(
        toolUses.map(async (tu: any) => {
          const out = await executeTool(admin, vendorId, tu.name, tu.input);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(out),
          };
        }),
      );
      messages = [
        ...messages,
        { role: "assistant", content: contentBlocks },
        { role: "user", content: toolResults },
      ];
      continue;
    }
    const text = contentBlocks
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    return text || "(no response)";
  }
  return "(I made too many tool calls without finishing. Try rephrasing.)";
}

// ─── Persistence ──────────────────────────────────────────────────

async function loadThreadMessages(
  admin: any,
  threadId: string,
): Promise<ClaudeMessage[]> {
  const { data } = await admin
    .from("my_space_messages")
    .select("role, type, content, image_prompt, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = (data ?? []) as Array<any>;
  return rows
    .filter((r) => r.type === "text" && typeof r.content === "string")
    .map((r) => ({ role: r.role, content: r.content }));
}

async function ensureThread(
  admin: any,
  userId: string,
  threadId: string | null,
  firstUserText: string,
): Promise<{ threadId: string; isNew: boolean }> {
  if (threadId) {
    const { data } = await admin
      .from("my_space_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return { threadId, isNew: false };
  }
  const title = firstUserText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "New chat";
  const { data, error } = await admin
    .from("my_space_threads")
    .insert({ user_id: userId, title })
    .select("id")
    .single();
  if (error) throw new Error(`thread_create_failed: ${error.message}`);
  return { threadId: (data as any).id as string, isNew: true };
}

async function insertMessage(
  admin: any,
  userId: string,
  threadId: string,
  msg:
    | { role: "user" | "assistant"; type: "text"; content: string }
    | {
      role: "assistant";
      type: "image";
      image_url: string;
      image_prompt: string;
    },
): Promise<{ id: string; created_at: string }> {
  const row = msg.type === "text"
    ? {
      user_id: userId,
      thread_id: threadId,
      role: msg.role,
      type: "text",
      content: msg.content,
    }
    : {
      user_id: userId,
      thread_id: threadId,
      role: msg.role,
      type: "image",
      image_url: msg.image_url,
      image_prompt: msg.image_prompt,
    };
  const { data, error } = await admin
    .from("my_space_messages")
    .insert(row)
    .select("id, created_at")
    .single();
  if (error) throw new Error(`message_insert_failed: ${error.message}`);
  return data as { id: string; created_at: string };
}

// ─── Handler ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json().catch(() => ({}));
    const userText = String(payload?.text ?? "").trim();
    const threadIdIn = payload?.thread_id
      ? String(payload.thread_id)
      : null;
    if (!userText) return json(400, { error: "no_text" });

    // Resolve thread (create one if new chat).
    const { threadId, isNew } = await ensureThread(
      admin,
      userId,
      threadIdIn,
      userText,
    );

    // Persist the user message first so the conversation is durable
    // even if the model call fails.
    const userMsg = await insertMessage(admin, userId, threadId, {
      role: "user",
      type: "text",
      content: userText,
    });

    // Image dispatch — short-circuit before Claude.
    if (looksLikeImageRequest(userText)) {
      const { imageUrl } = await callOpenAIImage(userText);
      const assistantMsg = await insertMessage(admin, userId, threadId, {
        role: "assistant",
        type: "image",
        image_url: imageUrl,
        image_prompt: userText,
      });
      return json(200, {
        thread_id: threadId,
        thread_is_new: isNew,
        user_message: {
          id: userMsg.id,
          role: "user",
          type: "text",
          content: userText,
          created_at: userMsg.created_at,
        },
        assistant_message: {
          id: assistantMsg.id,
          role: "assistant",
          type: "image",
          image_url: imageUrl,
          image_prompt: userText,
          created_at: assistantMsg.created_at,
        },
      });
    }

    // Resolve vendor + build snapshot.
    const vendorId = await findVendorIdForUser(admin, userId);
    let systemPrompt: string;
    if (vendorId) {
      const snap = await buildVendorSnapshot(admin, vendorId);
      systemPrompt = buildSystemPrompt(snap);
    } else {
      systemPrompt =
        "You are My Space, the in-app AI assistant for an event vendor. The caller doesn't yet have a vendor profile, so you can answer general questions but can't reference their inquiries, calendar, or packages. Encourage them to finish setting up their vendor profile.";
    }

    // Load prior turns + run Claude.
    const history = await loadThreadMessages(admin, threadId);
    // history already includes the just-inserted user message.
    const text = await callClaudeWithTools(
      systemPrompt,
      history,
      admin,
      vendorId ?? "",
    );
    const assistantMsg = await insertMessage(admin, userId, threadId, {
      role: "assistant",
      type: "text",
      content: text,
    });

    return json(200, {
      thread_id: threadId,
      thread_is_new: isNew,
      user_message: {
        id: userMsg.id,
        role: "user",
        type: "text",
        content: userText,
        created_at: userMsg.created_at,
      },
      assistant_message: {
        id: assistantMsg.id,
        role: "assistant",
        type: "text",
        content: text,
        created_at: assistantMsg.created_at,
      },
    });
  } catch (err) {
    console.error("[my-space-chat] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "chat_failed", detail: message.slice(0, 240) });
  }
});
