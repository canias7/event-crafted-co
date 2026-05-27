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
  // Titles of the vendor's recent OTHER chat threads, so the AI can
  // reference past conversations ("you mentioned in the cake tasting
  // chat that…").
  recentChats: Array<{ title: string | null; updated_at: string }>;
}

async function buildVendorSnapshot(
  admin: any,
  vendorId: string,
  userId: string,
  excludeThreadId: string | null,
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
    { data: recentThreadRows },
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
    (() => {
      let q = admin
        .from("my_space_threads")
        .select("title, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (excludeThreadId) q = q.neq("id", excludeThreadId);
      return q;
    })(),
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
    recentChats: ((recentThreadRows ?? []) as Array<any>).map((t) => ({
      title: t.title,
      updated_at: t.updated_at,
    })),
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
- Reply in whatever language the vendor wrote their last message in (English, Spanish, Portuguese, French, etc.). Mirror their tone.
- Format with light Markdown — bold for emphasis, bullet lists for options, fenced code blocks when literally showing code or templated text the vendor will paste.

Read tools (use freely):
- \`search_inquiries\` · \`get_inquiry\` · \`check_availability\`
- \`list_faqs\` · \`list_portfolio_images\` · \`list_appointments\`
- \`list_recent_notifications\` · \`search_messages\`
- \`list_reviews\` · \`list_past_bookings\` · \`list_team_members\`
- \`get_subscription_status\` · \`get_verification_status\`

Write tools (require an explicit go-ahead from the vendor before calling):
- \`send_host_reply\` — sends a message to a host on the vendor's behalf
- \`create_appointment\` · \`update_appointment\`
- \`update_inquiry_status\` · \`mark_notifications_read\`
- \`block_calendar_date\` · \`unblock_calendar_date\` · \`block_calendar_range\`
- \`create_payment_link\` · \`send_email\`
- \`toggle_auto_reply\` — flips inbox auto-reply settings
- \`manage_faq\` · \`manage_package\` · \`update_profile\`

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

Recent chats (other threads in My Space — you can reference them if the vendor brings something up):
${
    snap.recentChats.length === 0
      ? "  (no other chats yet)"
      : snap.recentChats
        .map((c) => `  • ${c.title || "(untitled)"} — ${c.updated_at.slice(0, 10)}`)
        .join("\n")
  }
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
  // ─── More read tools ────────────────────────────────────────────
  {
    name: "list_reviews",
    description:
      "List the vendor's reviews (rating + body + host name). Most recent first. Visible (released) reviews only.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 30 },
      },
    },
  },
  {
    name: "list_past_bookings",
    description:
      "List completed appointments (past events the vendor delivered). Useful for context like 'how did Sarah's wedding go?'",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 30 },
      },
    },
  },
  {
    name: "list_team_members",
    description:
      "List the vendor's team members (user_id + role + display_name).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_subscription_status",
    description:
      "Return the vendor's current subscription tier, status, period end, and cancel-at-period-end flag.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_verification_status",
    description:
      "Return the vendor's verification documents and their states (insurance, license, ID, etc.).",
    input_schema: { type: "object", properties: {} },
  },
  // ─── More write tools ───────────────────────────────────────────
  {
    name: "update_appointment",
    description:
      "Modify an existing appointment (reschedule, change status, edit notes). WRITE ACTION — confirm the change with the vendor first.",
    input_schema: {
      type: "object",
      required: ["appointment_id"],
      properties: {
        appointment_id: { type: "string" },
        status: {
          type: "string",
          enum: ["proposed", "accepted", "declined", "cancelled", "completed"],
        },
        scheduled_at: {
          type: "string",
          description: "Full ISO datetime if rescheduling.",
        },
        duration_minutes: { type: "integer", minimum: 5, maximum: 480 },
        title: { type: "string" },
        location: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "block_calendar_range",
    description:
      "Block a contiguous range of dates on the calendar at once (e.g. vacation). WRITE ACTION.",
    input_schema: {
      type: "object",
      required: ["start_date", "end_date"],
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD inclusive." },
        end_date: { type: "string", description: "YYYY-MM-DD inclusive." },
      },
    },
  },
  {
    name: "toggle_auto_reply",
    description:
      "Flip the vendor's inbox auto-reply settings: either the master `enabled` switch or one of the action toggles (use_calendar, use_first_name, detect_frustration, decline_negotiation, offer_call, notify_on_reply, notify_on_hot_lead, daily_summary, cap_replies_per_inquiry). WRITE ACTION.",
    input_schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        action_key: {
          type: "string",
          enum: [
            "use_calendar",
            "use_first_name",
            "detect_frustration",
            "decline_negotiation",
            "offer_call",
            "notify_on_reply",
            "notify_on_hot_lead",
            "daily_summary",
            "cap_replies_per_inquiry",
          ],
        },
        value: { type: "boolean" },
      },
    },
  },
  {
    name: "manage_faq",
    description:
      "Add, update, or delete a vendor FAQ entry. WRITE ACTION — confirm the question + answer with the vendor first.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["add", "update", "delete"] },
        id: { type: "string", description: "Required for update/delete." },
        question: { type: "string" },
        answer: { type: "string" },
      },
    },
  },
  {
    name: "manage_package",
    description:
      "Add, update, or delete a vendor service package. WRITE ACTION — confirm name + price with the vendor first.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["add", "update", "delete"] },
        id: { type: "string", description: "Required for update/delete." },
        name: { type: "string" },
        description: { type: "string" },
        price_usd: { type: "number" },
        is_active: { type: "boolean" },
      },
    },
  },
  {
    name: "update_profile",
    description:
      "Edit fields on the vendor's profile (business name, bio, location, category, base price, cancellation policy, deposit pct, policy notes). WRITE ACTION — confirm the change with the vendor first.",
    input_schema: {
      type: "object",
      properties: {
        business_name: { type: "string" },
        bio: { type: "string" },
        location: { type: "string" },
        category: { type: "string" },
        base_price_usd: { type: "number" },
        cancellation_policy: { type: "string" },
        deposit_pct: { type: "integer", minimum: 0, maximum: 100 },
        policy_notes: { type: "string" },
      },
    },
  },
  {
    name: "send_email",
    description:
      "Send an off-platform email via Resend on behalf of the vendor (from noreply@eventvendora.com). WRITE ACTION — show recipient + subject + body to the vendor before calling.",
    input_schema: {
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to: { type: "string", description: "Recipient email." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text body." },
      },
    },
  },
  {
    name: "get_usage_stats",
    description:
      "Return the vendor's AI usage stats: total tokens + USD cost over the requested window, plus a per-model breakdown.",
    input_schema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          enum: ["today", "week", "month", "all_time"],
        },
      },
    },
  },
  {
    name: "schedule_action",
    description:
      "Queue an action to run at a future time (\"at 5pm send Jamie the contract\"). Use kind=send_host_reply for vendor-to-host replies, kind=send_email for off-platform emails, kind=mark_notifications_read to clear badges. The args shape matches the corresponding immediate tool. WRITE ACTION — confirm everything (when, kind, content) with the vendor before scheduling.",
    input_schema: {
      type: "object",
      required: ["run_at", "kind", "args"],
      properties: {
        run_at: {
          type: "string",
          description: "Full ISO datetime, e.g. 2026-05-27T17:00:00Z.",
        },
        kind: {
          type: "string",
          enum: ["send_host_reply", "send_email", "mark_notifications_read"],
        },
        args: {
          type: "object",
          description:
            "Same input shape as the immediate version of the tool. e.g. for send_host_reply: { inquiry_id, body }.",
        },
      },
    },
  },
  {
    name: "list_scheduled_actions",
    description:
      "List the vendor's pending scheduled actions (so they can review or cancel them).",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "cancel_scheduled_action",
    description:
      "Cancel a pending scheduled action by id. WRITE ACTION.",
    input_schema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "get_tool_usage_stats",
    description:
      "Return how many times each My Space tool has fired for this vendor (analytics: which tools the AI is reaching for).",
    input_schema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          enum: ["today", "week", "month", "all_time"],
        },
      },
    },
  },
  {
    name: "create_invoice",
    description:
      "Create a proper line-item invoice (separate from a simple payment link). Computes subtotal + tax + total server-side. Returns the public checkout URL. WRITE ACTION — confirm bill-to + items with the vendor first.",
    input_schema: {
      type: "object",
      required: ["bill_to_name", "items"],
      properties: {
        bill_to_name: { type: "string" },
        bill_to_email: { type: "string" },
        bill_to_phone: { type: "string" },
        bill_to_address: { type: "string" },
        due_date: {
          type: "string",
          description: "YYYY-MM-DD (optional).",
        },
        notes: { type: "string" },
        tax_rate_pct: {
          type: "number",
          description:
            "Tax percent applied to subtotal (e.g. 8.5 for 8.5%). Default 0.",
        },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description: "Line items.",
          items: {
            type: "object",
            required: ["description", "quantity", "unit_price_usd"],
            properties: {
              description: { type: "string" },
              quantity: { type: "number", minimum: 0 },
              unit_price_usd: { type: "number", minimum: 0 },
            },
          },
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

// ─── More read tools ────────────────────────────────────────────

async function toolListReviews(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 30);
  const { data, error } = await admin
    .from("reviews")
    .select(
      "id, rating, body, host_id, kind, created_at, released_at, hidden_at",
    )
    .eq("vendor_id", vendorId)
    .is("hidden_at", null)
    .not("released_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  const rows = (data ?? []) as Array<any>;
  const hostIds = Array.from(new Set(rows.map((r) => r.host_id))).filter(
    Boolean,
  );
  const { data: hosts } = hostIds.length > 0
    ? await admin.from("profiles").select("id, display_name").in("id", hostIds)
    : { data: [] };
  const hostMap = new Map(
    ((hosts ?? []) as Array<any>).map((h) => [h.id, h.display_name]),
  );
  const reviews = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    kind: r.kind,
    host_name: hostMap.get(r.host_id) ?? "(unknown host)",
    created_at: r.created_at,
  }));
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length
    : null;
  return { reviews, count: reviews.length, average_rating: avg };
}

async function toolListPastBookings(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 30);
  const { data, error } = await admin
    .from("appointments")
    .select(
      "id, inquiry_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, notes",
    )
    .eq("vendor_id", vendorId)
    .eq("status", "completed")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  const rows = (data ?? []) as Array<any>;
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
    bookings: rows.map((r) => ({
      id: r.id,
      host_name: hostMap.get(r.host_id) ?? "(unknown host)",
      kind: r.kind,
      title: r.title,
      location: r.location,
      scheduled_at: r.scheduled_at,
      duration_minutes: r.duration_minutes,
      notes: r.notes,
    })),
  };
}

async function toolListTeamMembers(
  admin: any,
  vendorId: string,
): Promise<unknown> {
  const { data: members, error } = await admin
    .from("vendor_team_members")
    .select("user_id, role, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };
  const rows = (members ?? []) as Array<any>;
  const userIds = rows.map((r) => r.user_id);
  const { data: profs } = userIds.length > 0
    ? await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds)
    : { data: [] };
  const nameMap = new Map(
    ((profs ?? []) as Array<any>).map((p) => [p.id, p.display_name]),
  );
  return {
    team: rows.map((r) => ({
      user_id: r.user_id,
      role: r.role,
      display_name: nameMap.get(r.user_id) ?? "(unknown)",
      since: r.created_at,
    })),
  };
}

async function toolGetSubscriptionStatus(
  admin: any,
  userId: string,
): Promise<unknown> {
  const { data, error } = await admin
    .from("profiles")
    .select(
      "subscription_tier, subscription_status, subscription_current_period_end, subscription_cancel_at_period_end, monthly_grant",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "profile_not_found" };
  return {
    tier: (data as any).subscription_tier,
    status: (data as any).subscription_status,
    current_period_end: (data as any).subscription_current_period_end,
    cancel_at_period_end:
      (data as any).subscription_cancel_at_period_end === true,
    monthly_grant: (data as any).monthly_grant,
  };
}

async function toolGetVerificationStatus(
  admin: any,
  vendorId: string,
): Promise<unknown> {
  const { data, error } = await admin
    .from("vendor_verifications")
    .select("kind, status, expires_at, submitted_at, reviewed_at, notes")
    .eq("vendor_id", vendorId)
    .order("submitted_at", { ascending: false });
  if (error) return { error: error.message };
  return { verifications: (data ?? []) as Array<any> };
}

// ─── More write tools ───────────────────────────────────────────

async function toolUpdateAppointment(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const apptId = String(input?.appointment_id ?? "");
  if (!apptId) return { error: "appointment_id required" };
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) {
    if (
      !["proposed", "accepted", "declined", "cancelled", "completed"]
        .includes(String(input.status))
    ) {
      return { error: "invalid_status" };
    }
    patch.status = String(input.status);
  }
  if (input.scheduled_at !== undefined) {
    const dt = new Date(String(input.scheduled_at));
    if (Number.isNaN(dt.getTime())) {
      return { error: "scheduled_at_unparseable" };
    }
    patch.scheduled_at = dt.toISOString();
  }
  if (input.duration_minutes !== undefined) {
    patch.duration_minutes = Math.min(
      Math.max(Number(input.duration_minutes), 5),
      480,
    );
  }
  if (input.title !== undefined) patch.title = String(input.title);
  if (input.location !== undefined) patch.location = String(input.location);
  if (input.notes !== undefined) patch.notes = String(input.notes);
  if (Object.keys(patch).length === 0) return { error: "nothing_to_update" };
  const { data, error } = await admin
    .from("appointments")
    .update(patch)
    .eq("id", apptId)
    .eq("vendor_id", vendorId)
    .select("id, status, scheduled_at")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "appointment_not_found_or_not_owned" };
  return { updated: true, appointment: data };
}

async function toolBlockCalendarRange(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const start = String(input?.start_date ?? "");
  const end = String(input?.end_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return { error: "start_date must be YYYY-MM-DD" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { error: "end_date must be YYYY-MM-DD" };
  }
  if (end < start) return { error: "end_date must be >= start_date" };
  const dates: Array<{ vendor_id: string; date: string }> = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= stop.getTime()) {
    dates.push({
      vendor_id: vendorId,
      date: cursor.toISOString().slice(0, 10),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dates.length > 366) break; // safety cap
  }
  const { error } = await admin
    .from("vendor_unavailable_dates")
    .upsert(dates, {
      onConflict: "vendor_id,date",
      ignoreDuplicates: true,
    });
  if (error) return { error: error.message };
  return { blocked: true, count: dates.length, start_date: start, end_date: end };
}

async function toolToggleAutoReply(
  admin: any,
  vendorId: string,
  userId: string,
  input: any,
): Promise<unknown> {
  // Auto-reply settings live on profiles keyed by user_id (the
  // vendor's owner record). Resolve owner if the caller is a team
  // member.
  let ownerUserId = userId;
  const { data: vendor } = await admin
    .from("vendor_profiles")
    .select("user_id")
    .eq("id", vendorId)
    .maybeSingle();
  if ((vendor as any)?.user_id) ownerUserId = (vendor as any).user_id;

  const patch: Record<string, boolean> = {};
  if (typeof input?.enabled === "boolean") {
    patch.hilux_enabled = input.enabled;
  }
  if (
    typeof input?.action_key === "string" &&
    typeof input?.value === "boolean"
  ) {
    const key = `hilux_action_${input.action_key}`;
    patch[key] = input.value;
  }
  if (Object.keys(patch).length === 0) {
    return { error: "pass enabled or (action_key + value)" };
  }
  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", ownerUserId)
    .select(
      "hilux_enabled, hilux_action_use_calendar, hilux_action_use_first_name, hilux_action_detect_frustration, hilux_action_decline_negotiation, hilux_action_offer_call, hilux_action_notify_on_reply, hilux_action_notify_on_hot_lead, hilux_action_daily_summary, hilux_action_cap_replies_per_inquiry",
    )
    .maybeSingle();
  if (error) return { error: error.message };
  return { updated: true, settings: data };
}

async function toolManageFaq(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const action = String(input?.action ?? "");
  if (action === "add") {
    const q = String(input?.question ?? "").trim();
    const a = String(input?.answer ?? "").trim();
    if (!q || !a) return { error: "question and answer required" };
    const { data, error } = await admin
      .from("vendor_faqs")
      .insert({ vendor_id: vendorId, question: q, answer: a })
      .select("id, question, answer")
      .single();
    if (error) return { error: error.message };
    return { added: true, faq: data };
  }
  if (action === "update") {
    const id = String(input?.id ?? "");
    if (!id) return { error: "id required" };
    const patch: Record<string, string> = {};
    if (input?.question !== undefined) patch.question = String(input.question);
    if (input?.answer !== undefined) patch.answer = String(input.answer);
    if (Object.keys(patch).length === 0) return { error: "nothing_to_update" };
    const { data, error } = await admin
      .from("vendor_faqs")
      .update(patch)
      .eq("id", id)
      .eq("vendor_id", vendorId)
      .select("id, question, answer")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "faq_not_found_or_not_owned" };
    return { updated: true, faq: data };
  }
  if (action === "delete") {
    const id = String(input?.id ?? "");
    if (!id) return { error: "id required" };
    const { error } = await admin
      .from("vendor_faqs")
      .delete()
      .eq("id", id)
      .eq("vendor_id", vendorId);
    if (error) return { error: error.message };
    return { deleted: true, id };
  }
  return { error: `unknown_action: ${action}` };
}

async function toolManagePackage(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const action = String(input?.action ?? "");
  if (action === "add") {
    const name = String(input?.name ?? "").trim();
    if (!name) return { error: "name required" };
    const priceUsd = Number(input?.price_usd);
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      return { error: "price_usd required (>= 0)" };
    }
    const { data, error } = await admin
      .from("vendor_packages")
      .insert({
        vendor_id: vendorId,
        name,
        description: input?.description ? String(input.description) : null,
        price_cents: Math.round(priceUsd * 100),
        is_active: input?.is_active === false ? false : true,
      })
      .select("id, name, price_cents, is_active")
      .single();
    if (error) return { error: error.message };
    return { added: true, package: data };
  }
  if (action === "update") {
    const id = String(input?.id ?? "");
    if (!id) return { error: "id required" };
    const patch: Record<string, unknown> = {};
    if (input?.name !== undefined) patch.name = String(input.name);
    if (input?.description !== undefined) {
      patch.description = String(input.description);
    }
    if (input?.price_usd !== undefined) {
      const p = Number(input.price_usd);
      if (Number.isFinite(p) && p >= 0) patch.price_cents = Math.round(p * 100);
    }
    if (input?.is_active !== undefined) patch.is_active = !!input.is_active;
    if (Object.keys(patch).length === 0) return { error: "nothing_to_update" };
    const { data, error } = await admin
      .from("vendor_packages")
      .update(patch)
      .eq("id", id)
      .eq("vendor_id", vendorId)
      .select("id, name, price_cents, is_active")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "package_not_found_or_not_owned" };
    return { updated: true, package: data };
  }
  if (action === "delete") {
    const id = String(input?.id ?? "");
    if (!id) return { error: "id required" };
    const { error } = await admin
      .from("vendor_packages")
      .delete()
      .eq("id", id)
      .eq("vendor_id", vendorId);
    if (error) return { error: error.message };
    return { deleted: true, id };
  }
  return { error: `unknown_action: ${action}` };
}

async function toolUpdateProfile(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const patch: Record<string, unknown> = {};
  if (input?.business_name !== undefined) {
    patch.business_name = String(input.business_name);
  }
  if (input?.bio !== undefined) patch.bio = String(input.bio);
  if (input?.location !== undefined) patch.location = String(input.location);
  if (input?.category !== undefined) patch.category = String(input.category);
  if (input?.base_price_usd !== undefined) {
    const p = Number(input.base_price_usd);
    if (Number.isFinite(p) && p >= 0) {
      patch.base_price_cents = Math.round(p * 100);
    }
  }
  if (input?.cancellation_policy !== undefined) {
    patch.cancellation_policy = String(input.cancellation_policy);
  }
  if (input?.deposit_pct !== undefined) {
    const d = Number(input.deposit_pct);
    if (Number.isFinite(d) && d >= 0 && d <= 100) patch.deposit_pct = d;
  }
  if (input?.policy_notes !== undefined) {
    patch.policy_notes = String(input.policy_notes);
  }
  if (Object.keys(patch).length === 0) return { error: "nothing_to_update" };
  const { data, error } = await admin
    .from("vendor_profiles")
    .update(patch)
    .eq("id", vendorId)
    .select("id, business_name, bio, location, category, base_price_cents")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "profile_not_found" };
  return { updated: true, profile: data };
}

async function toolSendEmail(
  admin: any,
  vendorId: string,
  input: any,
): Promise<unknown> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!RESEND_API_KEY) return { error: "resend_key_missing" };
  const to = String(input?.to ?? "").trim();
  const subject = String(input?.subject ?? "").trim();
  const body = String(input?.body ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { error: "invalid_to" };
  if (!subject) return { error: "subject required" };
  if (!body) return { error: "body required" };

  // Tag the email with the vendor business name when available so the
  // recipient knows who it's from.
  const { data: vendor } = await admin
    .from("vendor_profiles")
    .select("business_name")
    .eq("id", vendorId)
    .maybeSingle();
  const fromName = (vendor as any)?.business_name ?? "Vendora";
  const FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") ??
    `${fromName} <noreply@eventvendora.com>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to,
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: `resend ${res.status}: ${t.slice(0, 240)}` };
  }
  const out = (await res.json()) as any;
  return { sent: true, to, subject, resend_id: out?.id ?? null };
}

async function toolGetUsageStats(
  admin: any,
  userId: string,
  input: any,
): Promise<unknown> {
  const since = String(input?.since ?? "month");
  let gte: string | null = null;
  const now = new Date();
  if (since === "today") {
    gte = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toISOString();
  } else if (since === "week") {
    gte = new Date(now.getTime() - 7 * 86400000).toISOString();
  } else if (since === "month") {
    gte = new Date(now.getTime() - 30 * 86400000).toISOString();
  }
  let q = admin
    .from("ai_call_usage")
    .select("model, provider, input_tokens, output_tokens, cost_micros")
    .eq("user_id", userId);
  if (gte) q = q.gte("created_at", gte);
  const { data, error } = await q;
  if (error) return { error: error.message };
  const rows = (data ?? []) as Array<any>;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostMicros = 0;
  const byModel: Record<string, {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }> = {};
  for (const r of rows) {
    totalInputTokens += Number(r.input_tokens) || 0;
    totalOutputTokens += Number(r.output_tokens) || 0;
    totalCostMicros += Number(r.cost_micros) || 0;
    const key = `${r.provider}:${r.model}`;
    if (!byModel[key]) {
      byModel[key] = {
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
      };
    }
    byModel[key].calls += 1;
    byModel[key].input_tokens += Number(r.input_tokens) || 0;
    byModel[key].output_tokens += Number(r.output_tokens) || 0;
    byModel[key].cost_usd += (Number(r.cost_micros) || 0) / 1_000_000;
  }
  return {
    since,
    total_calls: rows.length,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cost_usd: totalCostMicros / 1_000_000,
    by_model: byModel,
  };
}

async function toolCreateInvoice(
  admin: any,
  vendorId: string,
  userId: string,
  input: any,
): Promise<unknown> {
  if (!vendorId) return { error: "no_vendor_profile" };
  const billTo = String(input?.bill_to_name ?? "").trim();
  if (!billTo) return { error: "bill_to_name required" };
  const rawItems = Array.isArray(input?.items) ? input.items : [];
  if (rawItems.length === 0) return { error: "at least one item required" };
  const items = rawItems.map((it: any) => {
    const qty = Number(it?.quantity);
    const unit = Number(it?.unit_price_usd);
    return {
      description: String(it?.description ?? "").slice(0, 200),
      quantity: Number.isFinite(qty) && qty >= 0 ? qty : 0,
      unit_price_cents: Number.isFinite(unit) && unit >= 0
        ? Math.round(unit * 100)
        : 0,
    };
  });
  const subtotalCents = items.reduce(
    (s: number, it: any) => s + Math.round(it.quantity * it.unit_price_cents),
    0,
  );
  const taxRatePct = Number(input?.tax_rate_pct);
  const taxRateBps = Number.isFinite(taxRatePct) && taxRatePct >= 0
    ? Math.round(taxRatePct * 100)
    : 0;
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  const totalCents = subtotalCents + taxCents;

  // Generate a simple invoice number like INV-2026-XXXX from the
  // count of the vendor's existing invoices this year.
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { count } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .gte("created_at", yearStart);
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const invoiceNumber = `INV-${new Date().getFullYear()}-${seq}`;

  const { data, error } = await admin
    .from("invoices")
    .insert({
      vendor_id: vendorId,
      invoice_number: invoiceNumber,
      bill_to_name: billTo,
      bill_to_email: input?.bill_to_email
        ? String(input.bill_to_email)
        : null,
      bill_to_phone: input?.bill_to_phone
        ? String(input.bill_to_phone)
        : null,
      bill_to_address: input?.bill_to_address
        ? String(input.bill_to_address)
        : null,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: typeof input?.due_date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(input.due_date)
        ? input.due_date
        : null,
      notes: input?.notes ? String(input.notes) : null,
      line_items: items,
      subtotal_cents: subtotalCents,
      tax_rate_bps: taxRateBps,
      tax_cents: taxCents,
      total_cents: totalCents,
      currency: "usd",
      status: "draft",
      created_by: userId,
    })
    .select("id, slug, invoice_number, total_cents")
    .single();
  if (error) return { error: error.message };
  const slug = (data as any).slug as string;
  return {
    created: true,
    invoice: {
      id: (data as any).id,
      invoice_number: (data as any).invoice_number,
      total_usd: ((data as any).total_cents as number) / 100,
      checkout_url: `https://eventvendora.com/pay/invoice/${slug}`,
    },
  };
}

async function toolGetToolUsageStats(
  admin: any,
  userId: string,
  input: any,
): Promise<unknown> {
  const since = String(input?.since ?? "month");
  let gte: string | null = null;
  const now = new Date();
  if (since === "today") {
    gte = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toISOString();
  } else if (since === "week") {
    gte = new Date(now.getTime() - 7 * 86400000).toISOString();
  } else if (since === "month") {
    gte = new Date(now.getTime() - 30 * 86400000).toISOString();
  }
  let q = admin
    .from("ai_call_usage")
    .select("action_type, success")
    .eq("user_id", userId)
    .like("action_type", "my_space_tool:%");
  if (gte) q = q.gte("created_at", gte);
  const { data, error } = await q;
  if (error) return { error: error.message };
  const counts: Record<string, { calls: number; failures: number }> = {};
  for (const r of (data ?? []) as Array<any>) {
    const name = String(r.action_type).replace("my_space_tool:", "");
    if (!counts[name]) counts[name] = { calls: 0, failures: 0 };
    counts[name].calls += 1;
    if (r.success === false) counts[name].failures += 1;
  }
  const sorted = Object.entries(counts)
    .map(([name, v]) => ({ tool: name, ...v }))
    .sort((a, b) => b.calls - a.calls);
  return { since, total_tool_calls: (data ?? []).length, by_tool: sorted };
}

async function toolScheduleAction(
  admin: any,
  vendorId: string,
  userId: string,
  input: any,
): Promise<unknown> {
  const runAt = String(input?.run_at ?? "");
  const dt = new Date(runAt);
  if (Number.isNaN(dt.getTime())) return { error: "run_at_unparseable" };
  if (dt.getTime() < Date.now() - 60_000) {
    return { error: "run_at_must_be_in_future" };
  }
  const kind = String(input?.kind ?? "");
  if (
    !["send_host_reply", "send_email", "mark_notifications_read"].includes(
      kind,
    )
  ) {
    return { error: "invalid_kind" };
  }
  const args = input?.args && typeof input.args === "object" ? input.args : {};
  const { data, error } = await admin
    .from("my_space_scheduled_actions")
    .insert({
      user_id: userId,
      vendor_id: vendorId || null,
      run_at: dt.toISOString(),
      kind,
      args,
    })
    .select("id, run_at, kind, status")
    .single();
  if (error) return { error: error.message };
  return { scheduled: true, action: data };
}

async function toolListScheduledActions(
  admin: any,
  userId: string,
  input: any,
): Promise<unknown> {
  const limit = Math.min(Math.max(Number(input?.limit) || 20, 1), 50);
  const { data, error } = await admin
    .from("my_space_scheduled_actions")
    .select("id, run_at, kind, args, status, executed_at, error_message")
    .eq("user_id", userId)
    .order("run_at", { ascending: true })
    .limit(limit);
  if (error) return { error: error.message };
  return { actions: (data ?? []) as Array<any> };
}

async function toolCancelScheduledAction(
  admin: any,
  userId: string,
  input: any,
): Promise<unknown> {
  const id = String(input?.id ?? "");
  if (!id) return { error: "id required" };
  const { data, error } = await admin
    .from("my_space_scheduled_actions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id, status")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "action_not_found_or_not_pending" };
  return { cancelled: true };
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
    if (name === "list_reviews") {
      return await toolListReviews(admin, vendorId, input);
    }
    if (name === "list_past_bookings") {
      return await toolListPastBookings(admin, vendorId, input);
    }
    if (name === "list_team_members") {
      return await toolListTeamMembers(admin, vendorId);
    }
    if (name === "get_subscription_status") {
      return await toolGetSubscriptionStatus(admin, userId);
    }
    if (name === "get_verification_status") {
      return await toolGetVerificationStatus(admin, vendorId);
    }
    if (name === "update_appointment") {
      return await toolUpdateAppointment(admin, vendorId, input);
    }
    if (name === "block_calendar_range") {
      return await toolBlockCalendarRange(admin, vendorId, input);
    }
    if (name === "toggle_auto_reply") {
      return await toolToggleAutoReply(admin, vendorId, userId, input);
    }
    if (name === "manage_faq") {
      return await toolManageFaq(admin, vendorId, input);
    }
    if (name === "manage_package") {
      return await toolManagePackage(admin, vendorId, input);
    }
    if (name === "update_profile") {
      return await toolUpdateProfile(admin, vendorId, input);
    }
    if (name === "send_email") {
      return await toolSendEmail(admin, vendorId, input);
    }
    if (name === "get_usage_stats") {
      return await toolGetUsageStats(admin, userId, input);
    }
    if (name === "schedule_action") {
      return await toolScheduleAction(admin, vendorId, userId, input);
    }
    if (name === "list_scheduled_actions") {
      return await toolListScheduledActions(admin, userId, input);
    }
    if (name === "cancel_scheduled_action") {
      return await toolCancelScheduledAction(admin, userId, input);
    }
    if (name === "get_tool_usage_stats") {
      return await toolGetToolUsageStats(admin, userId, input);
    }
    if (name === "create_invoice") {
      return await toolCreateInvoice(admin, vendorId, userId, input);
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

// ─── Usage logging ────────────────────────────────────────────────

interface ClaudeTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

// Claude Sonnet 4.6 list pricing (May 2026, USD per million tokens).
// Fire-and-forget — telemetry failure must never fail the chat.
async function logChatUsage(
  admin: any,
  userId: string,
  tokens: ClaudeTokens,
): Promise<void> {
  try {
    const usd =
      (tokens.input_tokens * 3.0 +
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

// Parse Anthropic's SSE format into a stream of typed events.
async function* parseAnthropicSSE(
  body: ReadableStream<Uint8Array>,
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

// Streaming version of the tool loop. Calls `send` for each event:
//   { type: "delta", text }
//   { type: "tool_start", name }
//   { type: "tool_done", name }
// Returns the assembled final text. Uses Anthropic's streaming API on
// every iteration so text shows up immediately, even on turns that
// also call tools (Claude often emits a sentence before invoking a
// tool — that should be visible to the vendor).
async function streamClaudeWithTools(
  systemPrompt: string,
  initialMessages: ClaudeMessage[],
  admin: any,
  vendorId: string,
  userId: string,
  send: (ev: Record<string, unknown>) => void,
): Promise<string> {
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
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const t = res.body ? await res.text() : "";
      throw new Error(`anthropic ${res.status}: ${t.slice(0, 240)}`);
    }

    // Reassemble content blocks as the stream arrives. We need them
    // to round-trip back to Claude on tool-use turns.
    const blocks: Array<any> = [];
    let stopReason: string | null = null;
    let turnText = "";

    for await (const ev of parseAnthropicSSE(res.body)) {
      if (ev.type === "content_block_start") {
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

    if (stopReason === "tool_use") {
      const toolUses = blocks.filter((b) => b?.type === "tool_use");
      const toolResults = await Promise.all(
        toolUses.map(async (tu) => {
          const out = await executeTool(
            admin,
            vendorId,
            userId,
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
              success: !(out as any)?.error,
              error_message: (out as any)?.error ?? null,
            })
            .then(() => {}, (e: any) =>
              console.warn("[my-space-chat] tool log failed", e));
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
  void logChatUsage(admin, userId, totalTokens);
  return "(I made too many tool calls without finishing. Try rephrasing.)";
}

// ─── Persistence ──────────────────────────────────────────────────

// Build the Claude content array for a persisted user message,
// inlining any attachments as image / document blocks. Anthropic
// fetches URL sources server-side, so the attachments bucket must be
// publicly readable (it is — see message-attachments bucket).
function userContentWithAttachments(
  text: string,
  attachments: Array<{ url: string; mime: string; name: string }> | null,
): any {
  if (!attachments || attachments.length === 0) return text;
  const blocks: any[] = [];
  if (text && text.trim().length > 0) {
    blocks.push({ type: "text", text });
  }
  for (const a of attachments) {
    const mime = (a.mime ?? "").toLowerCase();
    if (mime.startsWith("image/")) {
      blocks.push({
        type: "image",
        source: { type: "url", url: a.url },
      });
    } else if (mime === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "url", url: a.url },
        title: a.name,
      });
    } else {
      // Fall through with a text reference so Claude knows it exists
      // even if it can't read the body directly.
      blocks.push({
        type: "text",
        text: `[attachment: ${a.name} (${mime || "unknown type"}) → ${a.url}]`,
      });
    }
  }
  return blocks.length > 0 ? blocks : text;
}

async function loadThreadMessages(
  admin: any,
  threadId: string,
): Promise<ClaudeMessage[]> {
  const { data } = await admin
    .from("my_space_messages")
    .select("role, type, content, image_prompt, attachments, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = (data ?? []) as Array<any>;
  return rows
    .filter((r) => r.type === "text" && typeof r.content === "string")
    .map((r) => ({
      role: r.role,
      content: r.role === "user"
        ? userContentWithAttachments(r.content, r.attachments)
        : r.content,
    }));
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
    | {
      role: "user" | "assistant";
      type: "text";
      content: string;
      attachments?:
        | Array<{ url: string; mime: string; name: string; size?: number }>
        | null;
    }
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
      attachments: msg.attachments && msg.attachments.length > 0
        ? msg.attachments
        : null,
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

  // Auth + payload validation up-front so we can return a clean
  // non-stream error instead of an empty SSE stream on bad requests.
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
  const threadIdIn = payload?.thread_id ? String(payload.thread_id) : null;
  // Attachments are { url, mime, name, size? }. We trust the client
  // to upload them to message-attachments first (RLS-gated bucket).
  const rawAttachments = Array.isArray(payload?.attachments)
    ? (payload.attachments as Array<any>)
        .map((a) => ({
          url: String(a?.url ?? ""),
          mime: String(a?.mime ?? ""),
          name: String(a?.name ?? "file"),
          size: Number(a?.size) || undefined,
        }))
        .filter((a) => a.url.startsWith("http"))
        .slice(0, 5)
    : [];
  const regenerate = payload?.regenerate === true;
  // Edit-and-resend: replace an existing user message in-place and
  // re-run Claude from that point. The server deletes the target
  // message + every later message in the thread, then inserts a new
  // user row with the new content and runs the normal flow.
  const replaceMessageId = typeof payload?.replace_message_id === "string"
    ? String(payload.replace_message_id)
    : null;
  if (regenerate && !threadIdIn) {
    return json(400, { error: "regenerate_requires_thread_id" });
  }
  if (replaceMessageId && !threadIdIn) {
    return json(400, { error: "replace_requires_thread_id" });
  }
  if (!regenerate && !userText && rawAttachments.length === 0) {
    return json(400, { error: "no_text_or_attachments" });
  }

  // Open an SSE stream. Everything from here is best-effort: errors
  // are sent as `{ type: "error" }` events so the frontend can still
  // surface them after partial output.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Controller may have been closed by the client disconnect.
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      try {
        let threadId: string;
        let isNew = false;
        if (regenerate) {
          // Verify ownership of the existing thread, then drop the
          // most recent assistant message so we re-roll from the same
          // history the user saw.
          const { data: t } = await admin
            .from("my_space_threads")
            .select("id")
            .eq("id", threadIdIn)
            .eq("user_id", userId)
            .maybeSingle();
          if (!t) {
            send({ type: "error", message: "thread_not_found" });
            close();
            return;
          }
          threadId = (t as any).id;
          const { data: lastAssistant } = await admin
            .from("my_space_messages")
            .select("id")
            .eq("thread_id", threadId)
            .eq("role", "assistant")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if ((lastAssistant as any)?.id) {
            await admin
              .from("my_space_messages")
              .delete()
              .eq("id", (lastAssistant as any).id);
          }
          send({ type: "thread", thread_id: threadId, thread_is_new: false });
        } else {
          // Edit-and-resend: drop the target message + all later
          // messages first, so the user message we're about to insert
          // takes its place.
          if (replaceMessageId) {
            const { data: target } = await admin
              .from("my_space_messages")
              .select("created_at, thread_id, user_id")
              .eq("id", replaceMessageId)
              .maybeSingle();
            if (
              !target ||
              (target as any).user_id !== userId ||
              (target as any).thread_id !== threadIdIn
            ) {
              send({ type: "error", message: "message_not_found" });
              close();
              return;
            }
            await admin
              .from("my_space_messages")
              .delete()
              .eq("thread_id", threadIdIn)
              .gte("created_at", (target as any).created_at);
          }
          const ensured = await ensureThread(
            admin,
            userId,
            threadIdIn,
            userText,
          );
          threadId = ensured.threadId;
          isNew = ensured.isNew;
          const userMsg = await insertMessage(admin, userId, threadId, {
            role: "user",
            type: "text",
            content: userText,
            attachments: rawAttachments.length > 0 ? rawAttachments : null,
          });
          send({
            type: "thread",
            thread_id: threadId,
            thread_is_new: isNew,
          });
          send({
            type: "user_message",
            id: userMsg.id,
            role: "user",
            msg_type: "text",
            content: userText,
            attachments: rawAttachments.length > 0 ? rawAttachments : null,
            created_at: userMsg.created_at,
            replaced: replaceMessageId,
          });
        }

        // Image dispatch — short-circuit before Claude. Skip if the
        // vendor attached a file; in that case they likely want
        // analysis ("what's this contract say?"), not generation.
        if (
          !regenerate &&
          rawAttachments.length === 0 &&
          looksLikeImageRequest(userText)
        ) {
          send({ type: "image_pending" });
          const { imageUrl } = await callOpenAIImage(userText);
          const assistantMsg = await insertMessage(admin, userId, threadId, {
            role: "assistant",
            type: "image",
            image_url: imageUrl,
            image_prompt: userText,
          });
          send({
            type: "done",
            assistant_message: {
              id: assistantMsg.id,
              role: "assistant",
              type: "image",
              image_url: imageUrl,
              image_prompt: userText,
              created_at: assistantMsg.created_at,
            },
          });
          close();
          return;
        }

        // Resolve vendor + build snapshot.
        const vendorId = await findVendorIdForUser(admin, userId);
        let systemPrompt: string;
        if (vendorId) {
          const snap = await buildVendorSnapshot(
            admin,
            vendorId,
            userId,
            threadId,
          );
          systemPrompt = buildSystemPrompt(snap);
        } else {
          systemPrompt =
            "You are My Space, the in-app AI assistant for an event vendor. The caller doesn't yet have a vendor profile, so you can answer general questions but can't reference their inquiries, calendar, or packages. Encourage them to finish setting up their vendor profile.";
        }

        const history = await loadThreadMessages(admin, threadId);
        const text = await streamClaudeWithTools(
          systemPrompt,
          history,
          admin,
          vendorId ?? "",
          userId,
          send,
        );
        const assistantMsg = await insertMessage(admin, userId, threadId, {
          role: "assistant",
          type: "text",
          content: text,
        });
        send({
          type: "done",
          assistant_message: {
            id: assistantMsg.id,
            role: "assistant",
            type: "text",
            content: text,
            created_at: assistantMsg.created_at,
          },
        });
        close();
      } catch (err) {
        console.error("[my-space-chat] stream error", err);
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: message.slice(0, 240) });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      // Prevent any intermediary (Cloudflare, etc.) from buffering.
      "x-accel-buffering": "no",
    },
  });
});
