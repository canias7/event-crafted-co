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

Read tools (use freely):
- \`search_inquiries\` — find specific leads (filter by status / lead score)
- \`get_inquiry\` — full thread + budget + special requests + last 10 messages
- \`check_availability\` — any future date (the snapshot below only covers 30 days)
- \`list_faqs\` — the vendor's saved Q&A pairs (use when drafting host replies)
- \`list_portfolio_images\` — vendor's portfolio photos with captions
- \`list_appointments\` — upcoming consultations / walkthroughs / tastings / calls
- \`list_recent_notifications\` — recent platform notifications for the vendor
- \`search_messages\` — full-text search across the vendor's host conversations

Write tools (require an explicit go-ahead from the vendor before calling):
- \`send_host_reply\` — sends a message to a host on the vendor's behalf
- \`create_appointment\` — proposes a consultation / tasting / call to a host
- \`update_inquiry_status\` — marks an inquiry replied / closed / declined
- \`block_calendar_date\` / \`unblock_calendar_date\` — single-date calendar edits
- \`mark_notifications_read\` — clears notification badges
- \`create_payment_link\` — creates a VendoraPay link the vendor can share with a host

Confirmation rule for writes:
- If the vendor said the exact action AND the parameters in their last message ("yes send it", "reply to inquiry X saying we're free July 14", "block Aug 1 for me"), proceed without re-asking.
- Otherwise, write out the proposed action in plain text (e.g. "I'll send: 'Hi Jamie — yes, July 14 works…' to your Aug-3 wedding lead — OK?") and WAIT for the vendor's reply before calling the tool.
- For \`send_host_reply\` specifically, ALWAYS show the exact body text first and get confirmation unless the vendor literally said "send X" with the full message included.

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
  {
    name: "list_faqs",
    description:
      "Return the vendor's saved FAQs (Q&A pairs the vendor has set up to help answer host questions). Use when drafting a reply where one of the FAQs is relevant.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_portfolio_images",
    description:
      "Return the vendor's portfolio images (storage paths + captions, ordered by display_order). Use when the vendor asks about their portfolio or wants to reference a specific photo.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max images to return. Default 12.",
        },
      },
    },
  },
  {
    name: "list_appointments",
    description:
      "List the vendor's appointments (consultations, walkthroughs, tastings, fittings, calls). Default returns upcoming ones in the next 30 days.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 180,
          description: "Look-ahead window in days. Default 30.",
        },
        status: {
          type: "string",
          enum: ["proposed", "accepted", "declined", "cancelled", "completed", "any"],
          description: "Filter by status. Default 'any' (excludes cancelled + declined).",
        },
      },
    },
  },
  {
    name: "list_recent_notifications",
    description:
      "Return the signed-in vendor's most recent notifications (new inquiries, hot-lead alerts, reply notifications, etc.).",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Max notifications to return. Default 10.",
        },
        only_unread: {
          type: "boolean",
          description: "If true, return only notifications that haven't been read.",
        },
      },
    },
  },
  {
    name: "search_messages",
    description:
      "Full-text search across all of the vendor's host-conversation messages (both sides). Returns matching messages with surrounding context.",
    input_schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Free-text query. Matched case-insensitively against message bodies.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Max matches to return. Default 10.",
        },
      },
    },
  },
  {
    name: "send_host_reply",
    description:
      "Send a message to a host on the vendor's behalf, posted into the host-vendor direct message thread for an inquiry. WRITE ACTION — only call after the vendor has confirmed the exact reply text. The message is attributed to the vendor (not flagged as AI-generated).",
    input_schema: {
      type: "object",
      required: ["inquiry_id", "body"],
      properties: {
        inquiry_id: { type: "string", description: "UUID of the inquiry." },
        body: {
          type: "string",
          description: "The exact message body to send to the host.",
        },
      },
    },
  },
  {
    name: "create_appointment",
    description:
      "Create a new appointment with a host (consultation, walkthrough, tasting, fitting, or phone call). WRITE ACTION — confirm the date, time, and kind with the vendor first.",
    input_schema: {
      type: "object",
      required: ["inquiry_id", "kind", "scheduled_at"],
      properties: {
        inquiry_id: { type: "string", description: "UUID of the inquiry." },
        kind: {
          type: "string",
          enum: ["consultation", "walkthrough", "tasting", "fitting", "phone_call"],
        },
        scheduled_at: {
          type: "string",
          description:
            "Full ISO-8601 datetime, e.g. 2026-07-14T15:00:00Z (use the vendor's local time if known; otherwise ask).",
        },
        duration_minutes: {
          type: "integer",
          minimum: 5,
          maximum: 480,
          description: "Default 60.",
        },
        title: { type: "string" },
        location: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "update_inquiry_status",
    description:
      "Change the status on an inquiry (e.g. mark as replied, closed, declined). WRITE ACTION.",
    input_schema: {
      type: "object",
      required: ["inquiry_id", "status"],
      properties: {
        inquiry_id: { type: "string", description: "UUID of the inquiry." },
        status: {
          type: "string",
          enum: ["new", "replied", "closed", "declined"],
        },
      },
    },
  },
  {
    name: "block_calendar_date",
    description:
      "Mark a single date as unavailable on the vendor's calendar. WRITE ACTION. Use for vacation days, personal events, etc.",
    input_schema: {
      type: "object",
      required: ["date"],
      properties: {
        date: { type: "string", description: "YYYY-MM-DD." },
      },
    },
  },
  {
    name: "unblock_calendar_date",
    description:
      "Remove a manual block on a date so it becomes available again. WRITE ACTION. Doesn't affect recurring closed days or actual bookings.",
    input_schema: {
      type: "object",
      required: ["date"],
      properties: {
        date: { type: "string", description: "YYYY-MM-DD." },
      },
    },
  },
  {
    name: "mark_notifications_read",
    description:
      "Mark notifications as read. Either pass specific notification IDs OR set all_unread=true to clear everything in one go. WRITE ACTION.",
    input_schema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Specific notification IDs to mark read.",
        },
        all_unread: {
          type: "boolean",
          description:
            "If true, mark every unread notification for this vendor as read.",
        },
      },
    },
  },
  {
    name: "create_payment_link",
    description:
      "Create a shareable VendoraPay payment link the vendor can send to a host (deposit, balance, retainer, etc.). Returns the public URL. WRITE ACTION — confirm amount + title with the vendor before calling.",
    input_schema: {
      type: "object",
      required: ["title", "amount_usd"],
      properties: {
        title: {
          type: "string",
          description:
            "Short label shown on the checkout page (e.g. 'Wedding photography deposit').",
        },
        amount_usd: {
          type: "number",
          description:
            "Amount in US dollars (e.g. 2000 for $2,000). Will be converted to cents server-side.",
        },
        description: {
          type: "string",
          description:
            "Optional longer description shown on the checkout page.",
        },
        host_email: {
          type: "string",
          description:
            "Optional email for the host paying — pre-fills checkout.",
        },
        expires_in_days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description:
            "Optional expiry; link expires this many days from now.",
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

async function toolListFaqs(
  admin: any,
  vendorId: string,
): Promise<unknown> {
  const { data, error } = await admin
    .from("vendor_faqs")
    .select("question, answer, display_order")
    .eq("vendor_id", vendorId)
    .order("display_order", { ascending: true })
    .limit(30);
  if (error) return { error: error.message };
  return {
    faqs: ((data ?? []) as Array<any>).map((f) => ({
      question: f.question,
      answer: f.answer,
    })),
  };
}

async function toolListPortfolioImages(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const limit = Math.min(Math.max(Number(input?.limit) || 12, 1), 50);
  const { data, error } = await admin
    .from("vendor_portfolio_images")
    .select("id, storage_path, caption, display_order, created_at")
    .eq("vendor_id", vendorId)
    .order("display_order", { ascending: true })
    .limit(limit);
  if (error) return { error: error.message };
  const rows = (data ?? []) as Array<any>;
  // Convert storage paths to public URLs so the vendor can click
  // through if they want to reference a specific image.
  const images = rows.map((r) => {
    const { data: pub } = admin.storage
      .from("vendor-portfolios")
      .getPublicUrl(r.storage_path);
    return {
      id: r.id,
      caption: r.caption,
      url: pub?.publicUrl ?? null,
      order: r.display_order,
    };
  });
  return { images, count: images.length };
}

async function toolListAppointments(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const days = Math.min(Math.max(Number(input?.days) || 30, 1), 180);
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86400000);
  let query = admin
    .from("appointments")
    .select(
      "id, inquiry_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, notes",
    )
    .eq("vendor_id", vendorId)
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", horizon.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);
  const status = String(input?.status ?? "any");
  if (status === "any") {
    query = query.not("status", "in", "(cancelled,declined)");
  } else if (
    ["proposed", "accepted", "declined", "cancelled", "completed"].includes(
      status,
    )
  ) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) return { error: error.message };
  const rows = (data ?? []) as Array<any>;
  // Hydrate host display names.
  const hostIds = Array.from(new Set(rows.map((r) => r.host_id))).filter(
    Boolean,
  );
  const { data: hosts } = hostIds.length > 0
    ? await admin.from("profiles").select("id, display_name").in("id", hostIds)
    : { data: [] };
  const hostMap = new Map(
    ((hosts ?? []) as Array<any>).map((h) => [h.id, h.display_name]),
  );
  return {
    appointments: rows.map((r) => ({
      id: r.id,
      inquiry_id: r.inquiry_id,
      host_name: hostMap.get(r.host_id) ?? "(unknown host)",
      kind: r.kind,
      title: r.title,
      location: r.location,
      scheduled_at: r.scheduled_at,
      duration_minutes: r.duration_minutes,
      status: r.status,
      notes: r.notes,
    })),
    count: rows.length,
  };
}

async function toolListRecentNotifications(
  admin: any,
  userId: string,
  input: any,
): Promise<unknown> {
  const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 30);
  let query = admin
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (input?.only_unread === true) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) return { error: error.message };
  return {
    notifications: ((data ?? []) as Array<any>).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      is_read: n.read_at != null,
      created_at: n.created_at,
    })),
  };
}

async function toolSearchMessages(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const q = String(input?.query ?? "").trim();
  if (!q) return { error: "query required" };
  const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 30);
  // Scope to threads owned by this vendor, then ILIKE the body.
  const { data: threads } = await admin
    .from("direct_threads")
    .select("id, inquiry_id, host_id")
    .eq("vendor_id", vendorId);
  const threadRows = (threads ?? []) as Array<any>;
  const threadIds = threadRows.map((t) => t.id);
  if (threadIds.length === 0) return { matches: [], count: 0 };
  const { data: msgs, error } = await admin
    .from("direct_messages")
    .select("id, thread_id, sender_role, body, created_at")
    .in("thread_id", threadIds)
    .ilike("body", `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  const threadMap = new Map(threadRows.map((t) => [t.id, t]));
  // Hydrate host names.
  const hostIds = Array.from(
    new Set(threadRows.map((t) => t.host_id)),
  ).filter(Boolean);
  const { data: hosts } = hostIds.length > 0
    ? await admin.from("profiles").select("id, display_name").in("id", hostIds)
    : { data: [] };
  const hostMap = new Map(
    ((hosts ?? []) as Array<any>).map((h) => [h.id, h.display_name]),
  );
  return {
    matches: ((msgs ?? []) as Array<any>).map((m) => {
      const t = threadMap.get(m.thread_id);
      return {
        message_id: m.id,
        inquiry_id: t?.inquiry_id ?? null,
        host_name: hostMap.get(t?.host_id) ?? "(unknown host)",
        from: m.sender_role,
        at: m.created_at,
        body: m.body,
      };
    }),
    count: (msgs ?? []).length,
  };
}

// ─── Write tools ──────────────────────────────────────────────────

async function toolSendHostReply(
  admin: any,
  vendorId: string,
  userId: string,
  input: any,
): Promise<unknown> {
  const inquiryId = String(input?.inquiry_id ?? "");
  const body = String(input?.body ?? "").trim();
  if (!inquiryId) return { error: "inquiry_id required" };
  if (!body) return { error: "body required" };
  // Verify ownership + find the thread.
  const { data: inq } = await admin
    .from("inquiries")
    .select("id, vendor_id")
    .eq("id", inquiryId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!inq) return { error: "inquiry_not_found_or_not_owned" };
  const { data: thread } = await admin
    .from("direct_threads")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();
  if (!(thread as any)?.id) {
    return { error: "no_thread_for_inquiry" };
  }
  const now = new Date().toISOString();
  const { data: msg, error } = await admin
    .from("direct_messages")
    .insert({
      thread_id: (thread as any).id,
      sender_id: userId,
      sender_role: "vendor",
      body,
      is_hilux_generated: false,
    })
    .select("id, created_at")
    .single();
  if (error) return { error: error.message };
  await admin
    .from("direct_threads")
    .update({ last_message_at: now })
    .eq("id", (thread as any).id);
  await admin
    .from("inquiries")
    .update({ last_message_at: now })
    .eq("id", inquiryId);
  return {
    sent: true,
    message_id: (msg as any).id,
    sent_at: (msg as any).created_at,
  };
}

async function toolCreateAppointment(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const inquiryId = String(input?.inquiry_id ?? "");
  const kind = String(input?.kind ?? "");
  const scheduledAt = String(input?.scheduled_at ?? "");
  if (!inquiryId) return { error: "inquiry_id required" };
  if (
    !["consultation", "walkthrough", "tasting", "fitting", "phone_call"]
      .includes(kind)
  ) {
    return { error: "invalid_kind" };
  }
  if (!scheduledAt) return { error: "scheduled_at required" };
  const dt = new Date(scheduledAt);
  if (Number.isNaN(dt.getTime())) return { error: "scheduled_at_unparseable" };
  // Verify ownership + grab host_id from the inquiry.
  const { data: inq } = await admin
    .from("inquiries")
    .select("id, vendor_id, host_id")
    .eq("id", inquiryId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!inq) return { error: "inquiry_not_found_or_not_owned" };
  const { data, error } = await admin
    .from("appointments")
    .insert({
      vendor_id: vendorId,
      inquiry_id: inquiryId,
      host_id: (inq as any).host_id,
      kind,
      scheduled_at: dt.toISOString(),
      duration_minutes: Math.min(
        Math.max(Number(input?.duration_minutes) || 60, 5),
        480,
      ),
      title: input?.title ? String(input.title) : null,
      location: input?.location ? String(input.location) : null,
      notes: input?.notes ? String(input.notes) : null,
      status: "proposed",
      proposed_by: "vendor",
    })
    .select("id, scheduled_at, status")
    .single();
  if (error) return { error: error.message };
  return {
    created: true,
    appointment: data,
  };
}

async function toolUpdateInquiryStatus(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const inquiryId = String(input?.inquiry_id ?? "");
  const status = String(input?.status ?? "");
  if (!inquiryId) return { error: "inquiry_id required" };
  if (!["new", "replied", "closed", "declined"].includes(status)) {
    return { error: "invalid_status" };
  }
  const { data, error } = await admin
    .from("inquiries")
    .update({ status })
    .eq("id", inquiryId)
    .eq("vendor_id", vendorId)
    .select("id, status")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "inquiry_not_found_or_not_owned" };
  return { updated: true, inquiry: data };
}

async function toolBlockCalendarDate(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const date = String(input?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date must be YYYY-MM-DD" };
  }
  const { error } = await admin
    .from("vendor_unavailable_dates")
    .upsert(
      { vendor_id: vendorId, date },
      { onConflict: "vendor_id,date", ignoreDuplicates: true },
    );
  if (error) return { error: error.message };
  return { blocked: true, date };
}

async function toolUnblockCalendarDate(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const date = String(input?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date must be YYYY-MM-DD" };
  }
  const { error } = await admin
    .from("vendor_unavailable_dates")
    .delete()
    .eq("vendor_id", vendorId)
    .eq("date", date);
  if (error) return { error: error.message };
  return { unblocked: true, date };
}

async function toolCreatePaymentLink(
  admin: any,
  vendorId: string,
  userId: string,
  input: any,
): Promise<unknown> {
  const title = String(input?.title ?? "").trim();
  if (!title) return { error: "title required" };
  const amountUsd = Number(input?.amount_usd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { error: "amount_usd must be a positive number" };
  }
  const amountCents = Math.round(amountUsd * 100);
  let expiresAt: string | null = null;
  if (input?.expires_in_days != null) {
    const days = Math.min(Math.max(Number(input.expires_in_days), 1), 365);
    expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  }
  const { data, error } = await admin
    .from("payment_links")
    .insert({
      vendor_id: vendorId,
      title,
      description: input?.description ? String(input.description) : null,
      amount_cents: amountCents,
      host_email: input?.host_email ? String(input.host_email) : null,
      expires_at: expiresAt,
      created_by: userId,
    })
    .select("id, slug, amount_cents, title")
    .single();
  if (error) return { error: error.message };
  const slug = (data as any).slug as string;
  return {
    created: true,
    payment_link: {
      id: (data as any).id,
      title: (data as any).title,
      amount_usd: ((data as any).amount_cents as number) / 100,
      checkout_url: `https://eventvendora.com/pay/link/${slug}`,
    },
  };
}

async function toolMarkNotificationsRead(
  admin: any,
  userId: string,
  input: any,
): Promise<unknown> {
  const now = new Date().toISOString();
  if (input?.all_unread === true) {
    const { error, count } = await admin
      .from("notifications")
      .update({ read_at: now }, { count: "exact" })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) return { error: error.message };
    return { marked_read: count ?? 0, scope: "all_unread" };
  }
  const ids = Array.isArray(input?.ids)
    ? (input.ids as unknown[]).map(String).filter(Boolean)
    : [];
  if (ids.length === 0) {
    return { error: "pass ids[] or all_unread=true" };
  }
  const { error, count } = await admin
    .from("notifications")
    .update({ read_at: now }, { count: "exact" })
    .eq("user_id", userId)
    .in("id", ids);
  if (error) return { error: error.message };
  return { marked_read: count ?? 0, ids };
}

async function executeTool(
  admin: any,
  vendorId: string,
  userId: string,
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
    if (name === "list_faqs") {
      return await toolListFaqs(admin, vendorId);
    }
    if (name === "list_portfolio_images") {
      return await toolListPortfolioImages(admin, vendorId, input);
    }
    if (name === "list_appointments") {
      return await toolListAppointments(admin, vendorId, input);
    }
    if (name === "list_recent_notifications") {
      return await toolListRecentNotifications(admin, userId, input);
    }
    if (name === "search_messages") {
      return await toolSearchMessages(admin, vendorId, input);
    }
    if (name === "send_host_reply") {
      return await toolSendHostReply(admin, vendorId, userId, input);
    }
    if (name === "create_appointment") {
      return await toolCreateAppointment(admin, vendorId, input);
    }
    if (name === "update_inquiry_status") {
      return await toolUpdateInquiryStatus(admin, vendorId, input);
    }
    if (name === "block_calendar_date") {
      return await toolBlockCalendarDate(admin, vendorId, input);
    }
    if (name === "unblock_calendar_date") {
      return await toolUnblockCalendarDate(admin, vendorId, input);
    }
    if (name === "mark_notifications_read") {
      return await toolMarkNotificationsRead(admin, userId, input);
    }
    if (name === "create_payment_link") {
      return await toolCreatePaymentLink(admin, vendorId, userId, input);
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
  userId: string,
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
          const out = await executeTool(
            admin,
            vendorId,
            userId,
            tu.name,
            tu.input,
          );
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
      userId,
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
