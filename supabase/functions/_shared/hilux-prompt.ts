// Shared HILUX prompt builder + Claude caller. Imported by both
// hilux-respond (production trigger path) and hilux-sandbox (vendor
// preview path). Keeps prompt drift impossible: a sandbox reply uses
// the EXACT same wiring as a real one.

// deno-lint-ignore-file no-explicit-any

export const MODEL = "claude-sonnet-4-6";

export interface PackageCtx {
  name: string;
  description: string | null;
  priceUsd: string | null;
}

export interface FaqCtx {
  question: string;
  answer: string;
}

export interface InquiryCtx {
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  location: string | null;
  budgetRangeUsd: string | null;
  specialRequests: string | null;
}

export interface AvailabilityCtx {
  // ISO yyyy-mm-dd dates that are booked or blocked over the next
  // ~180 days. Pre-merged from appointments + vendor_unavailable_dates.
  busyDates: string[];
  // 0=Sun..6=Sat day-of-week numbers that are fully closed every week.
  recurringClosedDays: number[];
  // ISO yyyy-mm-dd of "today" in vendor's expected timezone (UTC for
  // now; we don't track vendor TZ on the listing yet).
  today: string;
  // ISO yyyy-mm-dd of the last day the busy list is authoritative for.
  // Beyond this we don't claim certainty.
  horizon: string;
}

export interface HiluxPromptCtx {
  businessName: string;
  category: string | null;
  bio: string | null;
  location: string | null;
  startingPriceUsd: string | null;
  customInstructions: string | null;
  packages: PackageCtx[];
  faqs: FaqCtx[];
  inquiry: InquiryCtx | null;
  availability: AvailabilityCtx | null;
}

const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

export function priceUsd(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

export function buildSystemPrompt(ctx: HiluxPromptCtx): string {
  const lines: string[] = [];
  lines.push(
    `You are HILUX, the always-on AI inbox agent for ${ctx.businessName}${ctx.category ? `, a ${ctx.category} vendor` : ""}${ctx.location ? ` based in ${ctx.location}` : ""}. You are replying to a host (potential customer) who messaged this listing. Speak in the FIRST PERSON as the vendor's team (use "we" / "our" naturally). Keep replies warm, professional, and concise — 2 to 4 short sentences, no markdown headings, no bullet lists, no emojis.`,
  );
  lines.push("");
  lines.push("RULES:");
  lines.push(
    "- Detect the language of the host's most recent message and reply in that same language. If they write in Spanish, reply in Spanish; if French, French; etc. Match dialect (US Spanish vs Mexican Spanish, Brazilian vs European Portuguese) when it's clearly signaled.",
  );
  lines.push(
    "- Only answer using the listing context below. If the host asks about something you don't know (custom pricing, off-menu services), say you'll check and follow up rather than inventing an answer.",
  );
  lines.push(
    "- For DATE AVAILABILITY questions, use the AVAILABILITY block below — you have the live calendar. Don't say \"let me check\" for date questions; answer directly.",
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

  if (ctx.availability) {
    const av = ctx.availability;
    lines.push("");
    lines.push(
      `AVAILABILITY (today is ${av.today}; calendar is authoritative through ${av.horizon}):`,
    );
    if (av.recurringClosedDays.length > 0) {
      const names = av.recurringClosedDays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d])
        .filter(Boolean);
      lines.push(`- Closed every week on: ${names.join(", ")}.`);
    }
    if (av.busyDates.length > 0) {
      lines.push(`- Booked or blocked dates: ${av.busyDates.join(", ")}.`);
    } else {
      lines.push(`- No individual dates booked or blocked in that window.`);
    }
    lines.push(
      `- For dates AFTER ${av.horizon}, you don't have confirmed data — say you'll need to confirm.`,
    );
    lines.push(
      `- For dates in range that are NOT in the busy list and NOT a recurring closed day, treat them as open and confirm availability directly.`,
    );
  }

  if (ctx.customInstructions && ctx.customInstructions.trim().length > 0) {
    lines.push("");
    lines.push(
      "VENDOR'S CUSTOM INSTRUCTIONS (these take priority over the generic rules above — follow them precisely):",
    );
    lines.push(ctx.customInstructions.trim());
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

export async function callClaude(
  apiKey: string,
  systemText: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set in edge function env");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
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

// Loads the listing-side context (business + packages + FAQs +
// availability) for HILUX. Used by both hilux-respond and hilux-sandbox.
// Caller provides an authenticated Supabase admin client.
export async function loadVendorContext(
  admin: any,
  vendorId: string,
): Promise<{
  vendor: {
    id: string;
    user_id: string | null;
    business_name: string | null;
    category: string | null;
    bio: string | null;
    location: string | null;
    base_price_cents: number | null;
    hilux_enabled: boolean;
    hilux_instructions: string | null;
  } | null;
  packages: PackageCtx[];
  faqs: FaqCtx[];
  availability: AvailabilityCtx | null;
}> {
  const { data: vendor } = await admin
    .from("vendor_profiles")
    .select(
      "id, user_id, business_name, category, bio, base_price_cents, location, hilux_enabled, hilux_instructions",
    )
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) {
    return { vendor: null, packages: [], faqs: [], availability: null };
  }

  // Run independent queries in parallel: packages, faqs, blocked
  // dates, recurring rules, booked dates RPC.
  const horizonDays = 180;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const horizonDate = new Date(today.getTime() + horizonDays * 86400000);
  const horizonIso = horizonDate.toISOString().slice(0, 10);

  const [
    { data: packages },
    { data: faqs },
    { data: unavailableRows },
    { data: rules },
    { data: bookedRows },
  ] = await Promise.all([
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
    admin
      .from("vendor_unavailable_dates")
      .select("date")
      .eq("vendor_id", vendor.id)
      .gte("date", todayIso)
      .lte("date", horizonIso),
    admin
      .from("vendor_availability_rules")
      .select("day_of_week, is_unavailable")
      .eq("vendor_id", vendor.id),
    admin.rpc("vendor_booked_dates", { p_vendor_id: vendor.id }),
  ]);

  const busySet = new Set<string>();
  for (const row of (unavailableRows ?? []) as Array<{ date: string }>) {
    if (row.date) busySet.add(row.date.slice(0, 10));
  }
  for (const row of (bookedRows ?? []) as Array<{ vendor_booked_dates?: string } | string>) {
    // RPC returns setof date — supabase-js returns a flat array of
    // strings or an array of objects depending on version. Handle both.
    const value = typeof row === "string" ? row : row.vendor_booked_dates;
    if (value) busySet.add(String(value).slice(0, 10));
  }
  const busyDates = Array.from(busySet)
    .filter((d) => d >= todayIso && d <= horizonIso)
    .sort();

  const recurringClosedDays = ((rules ?? []) as Array<{
    day_of_week: number;
    is_unavailable: boolean;
  }>)
    .filter((r) => r.is_unavailable === true)
    .map((r) => r.day_of_week);

  return {
    vendor,
    packages: ((packages ?? []) as Array<{
      name: string;
      description: string | null;
      price_cents: number | null;
    }>).map((p) => ({
      name: p.name,
      description: p.description,
      priceUsd: priceUsd(p.price_cents),
    })),
    faqs: ((faqs ?? []) as Array<{ question: string; answer: string }>).map(
      (f) => ({ question: f.question, answer: f.answer }),
    ),
    availability: {
      busyDates,
      recurringClosedDays,
      today: todayIso,
      horizon: horizonIso,
    },
  };
}
