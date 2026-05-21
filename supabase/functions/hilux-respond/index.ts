// HILUX v1 — vendor-side auto-reply agent.
//
// Triggered by an AFTER INSERT trigger on direct_messages (sender_role
// = 'host') when the destination vendor has hilux_enabled = true. The
// trigger POSTs { thread_id, message_id }; this function pulls the
// vendor's listing context + recent conversation history, asks Claude
// to draft a reply in the vendor's voice, and writes the reply back
// into direct_messages as sender_role = 'vendor' with
// is_hilux_generated = true.
//
// Loop guard lives in the trigger (only fires on host messages), so
// HILUX's own replies never re-fire it. Errors are logged + the
// function returns 200 — we never want a HILUX hiccup to bubble back
// into the trigger and surface to the host.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL = "claude-sonnet-4-6";
const HISTORY_LIMIT = 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...extra }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function log(...args: unknown[]) {
  console.log("[hilux-respond]", ...args);
}

function priceUsd(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function buildSystemPrompt(ctx: {
  businessName: string;
  category: string | null;
  bio: string | null;
  location: string | null;
  startingPriceUsd: string | null;
  packages: Array<{ name: string; description: string | null; priceUsd: string | null }>;
  faqs: Array<{ question: string; answer: string }>;
  inquiry: {
    eventType: string | null;
    eventDate: string | null;
    guestCount: number | null;
    location: string | null;
    budgetRangeUsd: string | null;
    specialRequests: string | null;
  } | null;
}): string {
  const lines: string[] = [];
  lines.push(
    `You are HILUX, the always-on AI inbox agent for ${ctx.businessName}${ctx.category ? `, a ${ctx.category} vendor` : ""}${ctx.location ? ` based in ${ctx.location}` : ""}. You are replying to a host (potential customer) who messaged this listing. Speak in the FIRST PERSON as the vendor's team (use "we" / "our" naturally). Keep replies warm, professional, and concise — 2 to 4 short sentences, no markdown headings, no bullet lists, no emojis.`,
  );
  lines.push("");
  lines.push("RULES:");
  lines.push(
    "- Only answer using the listing context below. If the host asks about something you don't know (availability for a specific date, custom pricing, off-menu services), say you'll check and follow up rather than inventing an answer.",
  );
  lines.push(
    "- Never share phone numbers, email addresses, or external links. Keep the conversation in this thread.",
  );
  lines.push(
    "- If the host asks for a quote, anchor to the starting price or the relevant package, and note that final pricing depends on the date and details.",
  );
  lines.push(
    "- When useful, ask one focused clarifying question (event date, guest count, or vibe) instead of dumping every package.",
  );
  lines.push(
    "- Don't sign off with names or signatures. The vendor's profile already shows who you are.",
  );
  lines.push("");
  lines.push("LISTING CONTEXT:");
  lines.push(`- Business: ${ctx.businessName}`);
  if (ctx.category) lines.push(`- Category: ${ctx.category}`);
  if (ctx.location) lines.push(`- Based in: ${ctx.location}`);
  if (ctx.startingPriceUsd) lines.push(`- Starting price: ${ctx.startingPriceUsd}`);
  if (ctx.bio) {
    lines.push(`- Bio (vendor's own words):`);
    lines.push(ctx.bio.trim());
  }

  if (ctx.packages.length > 0) {
    lines.push("");
    lines.push("PACKAGES:");
    for (const p of ctx.packages) {
      const price = p.priceUsd ? ` — ${p.priceUsd}` : "";
      lines.push(`- ${p.name}${price}${p.description ? `: ${p.description.trim()}` : ""}`);
    }
  }

  if (ctx.faqs.length > 0) {
    lines.push("");
    lines.push("FAQs (use these to answer common questions):");
    for (const f of ctx.faqs) {
      lines.push(`Q: ${f.question.trim()}`);
      lines.push(`A: ${f.answer.trim()}`);
    }
  }

  if (ctx.inquiry) {
    lines.push("");
    lines.push("THIS HOST'S INQUIRY DETAILS:");
    if (ctx.inquiry.eventType) lines.push(`- Event type: ${ctx.inquiry.eventType}`);
    if (ctx.inquiry.eventDate) lines.push(`- Event date: ${ctx.inquiry.eventDate}`);
    if (ctx.inquiry.guestCount != null) lines.push(`- Guest count: ${ctx.inquiry.guestCount}`);
    if (ctx.inquiry.location) lines.push(`- Event location: ${ctx.inquiry.location}`);
    if (ctx.inquiry.budgetRangeUsd) lines.push(`- Budget: ${ctx.inquiry.budgetRangeUsd}`);
    if (ctx.inquiry.specialRequests) {
      lines.push(`- Special requests: ${ctx.inquiry.specialRequests.trim()}`);
    }
  }

  return lines.join("\n");
}

async function callClaude(systemText: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set in edge function env");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: [
        { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
      ],
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic ${res.status}: ${errText.slice(0, 500)}`);
  }
  const body = (await res.json()) as any;
  const text = (body.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("empty reply from claude");
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const payload = await req.json().catch(() => ({}));
    const threadId = String(payload?.thread_id ?? "").trim();
    const messageId = String(payload?.message_id ?? "").trim();
    if (!threadId || !messageId) {
      log("missing thread_id or message_id; ignoring");
      return ok({ skipped: "bad_payload" });
    }

    const { data: thread, error: threadErr } = await admin
      .from("direct_threads")
      .select("id, vendor_id, inquiry_id, host_id")
      .eq("id", threadId)
      .maybeSingle();
    if (threadErr) throw threadErr;
    if (!thread) {
      log("thread not found", threadId);
      return ok({ skipped: "no_thread" });
    }

    const { data: vendor, error: vendorErr } = await admin
      .from("vendor_profiles")
      .select(
        "id, user_id, business_name, category, bio, base_price_cents, location, hilux_enabled",
      )
      .eq("id", thread.vendor_id)
      .maybeSingle();
    if (vendorErr) throw vendorErr;
    if (!vendor) {
      log("vendor not found", thread.vendor_id);
      return ok({ skipped: "no_vendor" });
    }
    if (!vendor.hilux_enabled) {
      log("hilux disabled at processing time, skipping", vendor.id);
      return ok({ skipped: "hilux_off" });
    }
    if (!vendor.user_id) {
      log("vendor has no user_id, can't send as them", vendor.id);
      return ok({ skipped: "no_owner" });
    }

    const { data: triggeringMessage, error: msgErr } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!triggeringMessage || triggeringMessage.sender_role !== "host") {
      log("triggering message missing or not from host", messageId);
      return ok({ skipped: "bad_trigger_msg" });
    }

    const { data: latest, error: latestErr } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, created_at, is_hilux_generated")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (latestErr) throw latestErr;
    if (latest && latest.length > 0 && latest[0].id !== messageId) {
      log("a newer message exists since the trigger fired, skipping this run");
      return ok({ skipped: "stale" });
    }

    const { data: history, error: histErr } = await admin
      .from("direct_messages")
      .select("sender_role, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (histErr) throw histErr;
    const orderedHistory = (history ?? []).slice().reverse();

    const [{ data: packages }, { data: faqs }] = await Promise.all([
      admin
        .from("vendor_packages")
        .select("name, description, price_cents, display_order")
        .eq("vendor_id", vendor.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(10),
      admin
        .from("vendor_faqs")
        .select("question, answer, display_order")
        .eq("vendor_id", vendor.id)
        .order("display_order", { ascending: true })
        .limit(15),
    ]);

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

    const systemText = buildSystemPrompt({
      businessName: vendor.business_name ?? "this vendor",
      category: vendor.category,
      bio: vendor.bio,
      location: vendor.location,
      startingPriceUsd: priceUsd(vendor.base_price_cents),
      packages: (packages ?? []).map((p) => ({
        name: p.name,
        description: p.description,
        priceUsd: priceUsd(p.price_cents),
      })),
      faqs: (faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
      inquiry: inquiryCtx,
    });

    const claudeMessages = orderedHistory.map((m) => ({
      role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }));
    if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
      log("no host message at end of history, skipping");
      return ok({ skipped: "no_trailing_host_msg" });
    }

    log("calling claude", { vendor: vendor.id, history_len: claudeMessages.length });
    const reply = await callClaude(systemText, claudeMessages);

    const { error: insertErr } = await admin.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: vendor.user_id,
      sender_role: "vendor",
      body: reply,
      is_hilux_generated: true,
    });
    if (insertErr) throw insertErr;

    log("hilux replied", { thread: threadId, length: reply.length });
    return ok({ replied: true, length: reply.length });
  } catch (err) {
    console.error("[hilux-respond] uncaught:", err);
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
