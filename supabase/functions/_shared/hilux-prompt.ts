// Shared HILUX prompt builder + Claude caller + lead scorer +
// voice training + per-profile config. Imported by hilux-respond,
// hilux-sandbox, hilux-follow-up, and hilux-regenerate so all four
// see the same prompt construction and config lookup.

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
  busyDates: string[];
  recurringClosedDays: number[];
  recurringHourWindows: Array<{ dayOfWeek: number; start: string; end: string }>;
  today: string;
  horizon: string;
}

// Per-action toggles, sourced from the OWNER profile of the listing
// the conversation is on. All default to true so a vendor who flips
// the master enable on inherits the full agent without having to
// hunt for sub-toggles. Action gating is enforced by buildSystemPrompt
// (e.g. drops the multi-language rule when matchLanguage = false) and
// by the calling edge function (drops the AVAILABILITY block when
// useCalendar = false, suppresses the ESCALATE rule when escalate
// = false, etc.).
export interface HiluxActions {
  // Pacing
  followUp: boolean;
  quietHours: boolean;
  pauseWeekends: boolean;
  skipWhenActive: boolean;
  // Conversation / how HILUX listens
  matchLanguage: boolean;
  useCalendar: boolean;
  escalate: boolean;
  askClarifying: boolean;
  useFirstName: boolean;
  detectFrustration: boolean;
  // Conversation / what HILUX says
  mentionStartingPrice: boolean;
  suggestPackage: boolean;
  declineNegotiation: boolean;
  avoidCompetitors: boolean;
  sendPortfolioLink: boolean;
  offerCall: boolean;
  shareBookingProcess: boolean;
  // Conversation / how HILUX writes
  echoQuestion: boolean;
  useEmojis: boolean;
  acknowledgeEmotion: boolean;
  leadWithQuestion: boolean;
  softCtaSignoff: boolean;
  allowBullets: boolean;
  // Safety / privacy
  refuseLegal: boolean;
  refuseCompetitorPricing: boolean;
  noOtherClients: boolean;
  redactContact: boolean;
  // Operations (code-level)
  autoMarkReplied: boolean;
  notifyOnReply: boolean;
  updateInquiryFields: boolean;
  notifyOnEscalation: boolean;
  notifyOnHotLead: boolean;
  emailReplyCopies: boolean;
  autoArchiveCold: boolean;
  dailySummary: boolean;
  capRepliesPerInquiry: boolean;
  detectBookingIntent: boolean;
  logActions: boolean;
}

export const DEFAULT_ACTIONS: HiluxActions = {
  followUp: true,
  quietHours: false,
  pauseWeekends: false,
  skipWhenActive: true,
  matchLanguage: true,
  useCalendar: true,
  escalate: true,
  askClarifying: true,
  useFirstName: true,
  detectFrustration: true,
  mentionStartingPrice: false,
  suggestPackage: true,
  declineNegotiation: true,
  avoidCompetitors: true,
  sendPortfolioLink: false,
  offerCall: true,
  shareBookingProcess: true,
  echoQuestion: false,
  useEmojis: false,
  acknowledgeEmotion: true,
  leadWithQuestion: false,
  softCtaSignoff: true,
  allowBullets: false,
  refuseLegal: true,
  refuseCompetitorPricing: true,
  noOtherClients: true,
  redactContact: true,
  autoMarkReplied: true,
  notifyOnReply: false,
  updateInquiryFields: false,
  notifyOnEscalation: true,
  notifyOnHotLead: true,
  emailReplyCopies: false,
  autoArchiveCold: false,
  dailySummary: false,
  capRepliesPerInquiry: false,
  detectBookingIntent: true,
  logActions: false,
};

// HILUX is paused during these UTC hours when the quietHours action
// is on. v1 picks an Eastern-ish window (11pm-7am ET ≈ 04:00-12:00
// UTC). Vendors outside ET get a roughly-correct nighttime band;
// per-vendor TZ support is future work.
export const QUIET_HOURS_UTC_START = 4;
export const QUIET_HOURS_UTC_END = 12;

export function isInQuietHours(date: Date = new Date()): boolean {
  const h = date.getUTCHours();
  return h >= QUIET_HOURS_UTC_START && h < QUIET_HOURS_UTC_END;
}

export type HiluxReplyLength = "short" | "medium" | "long";

export interface HiluxPromptCtx {
  businessName: string;
  category: string | null;
  bio: string | null;
  location: string | null;
  startingPriceUsd: string | null;
  customInstructions: string | null;
  voiceSamples: string[];
  packages: PackageCtx[];
  faqs: FaqCtx[];
  inquiry: InquiryCtx | null;
  availability: AvailabilityCtx | null;
  actions: HiluxActions;
  // Host's first name when known (parsed from profiles.display_name).
  // Only included in the prompt when actions.useFirstName is true.
  hostFirstName: string | null;
  // Custom opener used on the FIRST HILUX reply in a thread.
  // Null = HILUX writes its own opener.
  greetingLine: string | null;
  // Reply length target. Drives the "X short sentences" line.
  replyLength: HiluxReplyLength;
  // True when this is the first HILUX-side reply in the thread,
  // i.e. no previous assistant messages. Drives whether the
  // greetingLine and any "first-reply only" rules apply.
  isFirstReply: boolean;
}

export interface LeadScoreResult {
  score: "hot" | "warm" | "cold" | "unknown";
  reason: string;
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
  // Compose the formatting clause. Emojis + bullet lists are now
  // always allowed (the vendor-side toggles for them were removed
  // because HILUX should always make those calls itself in context).
  const formattingNos: string[] = ["no markdown headings"];
  const lengthTarget =
    ctx.replyLength === "short"
      ? "1 to 2 short sentences"
      : ctx.replyLength === "long"
        ? "3 to 6 sentences"
        : "2 to 4 short sentences";
  lines.push(
    `You are HILUX, the always-on AI inbox agent for ${ctx.businessName}${ctx.category ? `, a ${ctx.category} vendor` : ""}${ctx.location ? ` based in ${ctx.location}` : ""}. You are replying to a host (potential customer) who messaged this listing. Speak in the FIRST PERSON as the vendor's team (use "we" / "our" naturally). Keep replies warm, professional, and concise — ${lengthTarget}, ${formattingNos.join(", ")}.`,
  );
  lines.push("");
  lines.push("RULES:");
  if (ctx.greetingLine && ctx.greetingLine.trim().length > 0 && ctx.isFirstReply) {
    lines.push(
      `- This is your FIRST reply in this thread. Start the reply with EXACTLY this opener (verbatim, the vendor wrote it themselves): "${ctx.greetingLine.trim()}" — then continue naturally with your answer in the same paragraph.`,
    );
  }
  lines.push(
    "- Detect the language of the host's most recent message and reply in that same language. If they write in Spanish, reply in Spanish; if French, French; etc. Match dialect (US Spanish vs Mexican Spanish, Brazilian vs European Portuguese) when it's clearly signaled.",
  );
  lines.push(
    "- Only answer using the listing context below. If the host asks about something you don't know (custom pricing, off-menu services), say you'll check and follow up rather than inventing an answer.",
  );
  if (ctx.actions.useCalendar && ctx.availability) {
    lines.push(
      "- For DATE AVAILABILITY questions, use the AVAILABILITY block below — you have the live calendar. Don't say \"let me check\" for date questions; answer directly.",
    );
  } else {
    lines.push(
      "- You don't have calendar access. For any date-availability question, say you'll need to check the calendar and circle back.",
    );
  }
  lines.push(
    "- Never share phone numbers, email addresses, or external links. Keep the conversation in this thread.",
  );
  lines.push(
    "- If the host asks for a quote, anchor to the starting price or the relevant package, and note that final pricing depends on the date and details.",
  );
  lines.push(
    "- When the host's message is vague or missing key details, ask ONE focused clarifying question (event date, guest count, or vibe) instead of guessing or dumping every package.",
  );
  if (ctx.hostFirstName) {
    lines.push(
      `- The host's first name is "${ctx.hostFirstName}". Open the reply by addressing them by first name (e.g. "Hi ${ctx.hostFirstName}," or just "${ctx.hostFirstName} —"). Don't overuse it; once is enough.`,
    );
  }
  lines.push(
    "- Don't sign off with names or signatures. The vendor's profile already shows who you are.",
  );
  if (ctx.actions.escalate) {
    lines.push(
      "- IF YOU CANNOT CONFIDENTLY ANSWER from the context above (e.g., custom pricing the listing doesn't cover, off-menu services, requests that require a human judgment, or facts you'd have to invent), DO NOT REPLY. Instead, output a single line starting with the literal token \"ESCALATE:\" followed by a short reason (max 100 chars). The system will route the conversation to the vendor — your job is to step aside, not to bluff. Use ESCALATE sparingly; if the answer is in the context, just answer.",
    );
  } else {
    lines.push(
      "- The vendor has asked you to ALWAYS reply (never escalate). When uncertain, give your best answer and acknowledge you'll confirm specifics with them.",
    );
  }
  if (ctx.actions.detectFrustration && ctx.actions.escalate) {
    lines.push(
      "- If the host sounds frustrated, angry, or upset (caps, repeated punctuation, \"this is unacceptable\", complaint language), DO NOT try to fix it in the reply. ESCALATE: host_frustrated and let the vendor handle it personally.",
    );
  }
  // What HILUX talks about
  if (ctx.actions.mentionStartingPrice) {
    lines.push(
      "- When the host asks about cost (\"how much\", \"what's the price\"), lead with the starting price directly in the first sentence. Don't qualify-question first.",
    );
  }
  if (ctx.actions.suggestPackage) {
    lines.push(
      "- When the host's ask matches one of the listed packages, recommend it by name in the reply. Don't list every package — just the most relevant one.",
    );
  }
  if (ctx.actions.declineNegotiation) {
    lines.push(
      "- If the host asks for a discount or wants to negotiate the price, politely decline (one short sentence — \"our pricing reflects what goes into the work, we keep it firm\") and offer to discuss what's included instead.",
    );
  }
  if (ctx.actions.avoidCompetitors) {
    lines.push(
      "- If the host mentions, asks about, or compares to other vendors / competitors, do NOT discuss them. Redirect to what makes this vendor's work distinctive without naming names.",
    );
  }
  if (ctx.actions.sendPortfolioLink) {
    lines.push(
      "- On the very first HILUX reply in a thread (no prior assistant messages), mention that there's a full portfolio on the vendor's profile (\"You can see more of our recent work on our profile page\"). Don't include a literal URL — that's against the no-external-links rule.",
    );
  }
  if (ctx.actions.offerCall) {
    lines.push(
      "- Once the lead warms up (host has answered a clarifying question or shared event details), offer to set up a quick call (\"Want to hop on a 15-min call to walk through it?\"). Don't push a call in the first reply.",
    );
  }
  if (ctx.actions.shareBookingProcess) {
    lines.push(
      "- When the host expresses booking intent (\"we want to book\", \"how do we lock this in\"), briefly outline the next step (\"We send a quick proposal, you confirm the date with a deposit, and we lock it in\") — one sentence max.",
    );
  }
  // How HILUX writes
  if (ctx.actions.echoQuestion) {
    lines.push(
      "- Open the reply by briefly restating what the host is asking, so they know you understood (\"So you're looking for coverage from ceremony through cocktail hour — \").",
    );
  }
  lines.push(
    "- Emojis are OK in moderation (max one or two per reply, where they fit the tone). Don't overdo it.",
  );
  if (ctx.actions.acknowledgeEmotion) {
    lines.push(
      "- When the host expresses excitement (\"we're so excited!\", \"can't wait\"), warmly acknowledge it in one beat before answering. Don't gush.",
    );
  }
  if (ctx.actions.leadWithQuestion) {
    lines.push(
      "- On a FIRST HILUX reply to a new conversation, lead with a friendly question that pulls more info (\"Before I dig in — what's the vibe you're going for?\") instead of jumping straight to an answer.",
    );
  }
  lines.push(
    "- End the reply with a soft prompt to keep the conversation moving — e.g. \"Want me to share more details?\" or \"What date are you thinking?\". Skip if you've already asked a clarifying question in this same reply.",
  );
  lines.push(
    "- Bullet lists are OK when listing 2-3 specific things side by side (packages, dates, etc.). Keep them tight; no nested lists.",
  );
  // Safety / privacy
  if (ctx.actions.refuseLegal) {
    lines.push(
      "- Don't discuss legal terms, contracts, cancellation language, or anything that would normally be in writing. Redirect: \"We'll send the contract once you're ready to lock in.\"",
    );
  }
  if (ctx.actions.refuseCompetitorPricing) {
    lines.push(
      "- If the host asks how the vendor's pricing compares to competitors or asks for a price match, politely decline. Redirect to value, not comparison.",
    );
  }
  if (ctx.actions.noOtherClients) {
    lines.push(
      "- Never reference other clients, even anonymously (no \"we just did a wedding for...\"). The host you're talking to is the only client that matters in the reply.",
    );
  }
  if (ctx.actions.redactContact) {
    lines.push(
      "- Belt-and-suspenders contact rule: never write a phone number, email address, or URL. If the host shares theirs, don't echo it back.",
    );
  }
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

  if (ctx.actions.useCalendar && ctx.availability) {
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
    if (av.recurringHourWindows.length > 0) {
      const byDay = new Map<number, string[]>();
      for (const w of av.recurringHourWindows) {
        const slot = `${w.start}–${w.end}`;
        const arr = byDay.get(w.dayOfWeek) ?? [];
        arr.push(slot);
        byDay.set(w.dayOfWeek, arr);
      }
      const parts: string[] = [];
      for (const [day, slots] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
        const name = DAY_NAMES[day];
        if (!name) continue;
        parts.push(`${name} ${slots.join(" & ")}`);
      }
      if (parts.length > 0) {
        lines.push(
          `- Bookable only within these hour windows (outside the listed times those weekdays count as closed): ${parts.join("; ")}.`,
        );
      }
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

  if (ctx.voiceSamples && ctx.voiceSamples.length > 0) {
    lines.push("");
    lines.push(
      "VENDOR'S VOICE — these are real replies this vendor has previously sent. Match this style, cadence, vocabulary, punctuation habits, and personality EXACTLY. Don't quote them, but write like the same person wrote them:",
    );
    for (let i = 0; i < ctx.voiceSamples.length; i++) {
      const sample = (ctx.voiceSamples[i] ?? "").trim();
      if (!sample) continue;
      lines.push(`---`);
      lines.push(`Example ${i + 1}:`);
      lines.push(sample);
    }
    lines.push("---");
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
    if (ctx.inquiry.specialRequests) lines.push(`- Special requests: ${ctx.inquiry.specialRequests.trim()}`);
  }

  return lines.join("\n");
}

export async function scoreLead(
  apiKey: string,
  ctx: {
    businessName: string;
    category: string | null;
    inquiry: InquiryCtx | null;
    transcript: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<LeadScoreResult> {
  if (!apiKey) return { score: "unknown", reason: "no_api_key" };
  const lines: string[] = [];
  lines.push(
    `You are a lead-scoring assistant for ${ctx.businessName}${ctx.category ? `, a ${ctx.category} vendor` : ""}. Read the conversation transcript and the structured inquiry below, then classify the host's current temperature as one of:`,
  );
  lines.push("- hot: explicit booking intent (asked to confirm, requested a contract, picked a package, said 'we want to book', etc.)");
  lines.push("- warm: actively engaged, asking detailed questions, considering — but no firm commitment yet");
  lines.push("- cold: vague, slow, price-shopping signals, low specificity, lukewarm responses");
  lines.push("- unknown: not enough signal yet (e.g. just the initial inquiry with no follow-up)");
  lines.push("");
  lines.push("Output ONLY a JSON object on one line with two fields: score (one of hot/warm/cold/unknown) and reason (one short sentence, max 100 chars, citing the specific signal). No markdown. No prose outside the JSON.");
  lines.push("Example: {\"score\":\"warm\",\"reason\":\"Asking about packages but no date yet.\"}");
  lines.push("");
  if (ctx.inquiry) {
    lines.push("STRUCTURED INQUIRY:");
    if (ctx.inquiry.eventType) lines.push(`- Event type: ${ctx.inquiry.eventType}`);
    if (ctx.inquiry.eventDate) lines.push(`- Event date: ${ctx.inquiry.eventDate}`);
    if (ctx.inquiry.guestCount != null) lines.push(`- Guest count: ${ctx.inquiry.guestCount}`);
    if (ctx.inquiry.budgetRangeUsd) lines.push(`- Budget: ${ctx.inquiry.budgetRangeUsd}`);
    if (ctx.inquiry.location) lines.push(`- Location: ${ctx.inquiry.location}`);
    if (ctx.inquiry.specialRequests) lines.push(`- Special requests: ${ctx.inquiry.specialRequests.trim()}`);
    lines.push("");
  }
  lines.push("TRANSCRIPT (host = user, vendor or HILUX = assistant):");
  const systemText = lines.join("\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
        messages: ctx.transcript.length > 0 ? ctx.transcript : [{ role: "user", content: "(empty transcript)" }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[scoreLead] anthropic non-ok", res.status, errText.slice(0, 300));
      return { score: "unknown", reason: "scoring_api_error" };
    }
    const body = (await res.json()) as any;
    const raw = ((body.content ?? []) as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const jsonish = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonish);
    const score = String(parsed?.score ?? "").toLowerCase();
    if (!["hot", "warm", "cold", "unknown"].includes(score)) return { score: "unknown", reason: "unparseable_score" };
    const reason = String(parsed?.reason ?? "").trim().slice(0, 240);
    return { score: score as LeadScoreResult["score"], reason: reason || "no_reason" };
  } catch (err) {
    console.error("[scoreLead] uncaught", err);
    return { score: "unknown", reason: "scoring_exception" };
  }
}

export interface BookingIntentResult {
  detected: boolean;
  reason: string;
}

// Detect whether the host's LATEST message reads as explicit
// booking commitment ("yes book us", "let's lock it in", "send
// the contract") vs general interest. Bounded JSON response, same
// shape as scoreLead. Never throws — returns detected=false on
// any parse error so the caller can no-op cleanly.
export async function detectBookingIntent(
  apiKey: string,
  ctx: {
    businessName: string;
    transcript: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<BookingIntentResult> {
  if (!apiKey) return { detected: false, reason: "no_api_key" };
  const lastHost = [...ctx.transcript].reverse().find((m) => m.role === "user");
  if (!lastHost) return { detected: false, reason: "no_host_message" };

  const systemText = `You are a binary classifier for ${ctx.businessName}'s inbox. Read the host's MOST RECENT message and decide whether it expresses EXPLICIT BOOKING COMMITMENT — meaning the host is saying "yes, let's do this", "we'd like to book you", "send the contract", "lock us in", or similar. General interest, questions, package shopping, or "let me think about it" do NOT count.

Output ONLY a JSON object on one line: {"detected": true|false, "reason": "<short citation, max 90 chars>"}. Cite the exact phrase or signal. No markdown.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 80,
        system: [
          { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: lastHost.content }],
      }),
    });
    if (!res.ok) return { detected: false, reason: "intent_api_error" };
    const body = (await res.json()) as any;
    const raw = ((body.content ?? []) as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const jsonish = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonish);
    const detected = parsed?.detected === true;
    const reason = String(parsed?.reason ?? "").trim().slice(0, 200);
    return { detected, reason: reason || (detected ? "detected" : "no_signal") };
  } catch (err) {
    console.error("[detectBookingIntent] error", err);
    return { detected: false, reason: "intent_exception" };
  }
}

export interface ExtractedInquiryFields {
  event_type?: string | null;
  event_date?: string | null;
  guest_count?: number | null;
  location?: string | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
  special_requests?: string | null;
}

// Pull structured event details from the conversation that the host
// has dropped in chat ("we're thinking 80 guests for Sept 14, budget
// around $5k"). Returns a partial — only fields the model is
// confident about. Caller should ONLY apply fields that are
// currently null on the inquiry, so vendor-confirmed values are
// never overwritten by a chat-extracted guess.
export async function extractInquiryFields(
  apiKey: string,
  ctx: {
    transcript: Array<{ role: "user" | "assistant"; content: string }>;
    todayIso: string;
  },
): Promise<ExtractedInquiryFields> {
  if (!apiKey) return {};
  if (ctx.transcript.length === 0) return {};

  const systemText = `You extract structured event details from a host's chat with a vendor. Read the whole transcript and report ONLY what the host has explicitly stated.

Output a JSON object on one line. Include a key ONLY if the host clearly stated it. Skip keys for anything implied, guessed, or already-vendor-side. Never invent.

Allowed keys (all optional):
- event_type: lowercase noun ("wedding", "birthday", "corporate", "fundraiser", etc.)
- event_date: ISO yyyy-mm-dd. Resolve relative phrases against today (${ctx.todayIso}). "next September 14" → next year if today is past Sept. "this Saturday" → the next Saturday from today.
- guest_count: integer
- location: city or short place name as stated
- budget_min_cents: integer USD cents. "$5k" → 500000. Skip if only a max is given.
- budget_max_cents: integer USD cents. "around 5k" → 500000 as max.
- special_requests: short string ONLY if the host mentioned a specific accommodation (allergies, accessibility, theme constraints).

Examples:
Host: "We're looking at Sept 14, 80 guests, around 8k" → {"event_date":"2026-09-14","guest_count":80,"budget_max_cents":800000}
Host: "Just exploring options" → {}

No markdown. No prose outside the JSON.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: [
          { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
        ],
        messages: ctx.transcript.length > 0
          ? ctx.transcript
          : [{ role: "user", content: "(empty)" }],
      }),
    });
    if (!res.ok) return {};
    const body = (await res.json()) as any;
    const raw = ((body.content ?? []) as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const jsonish = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonish);
    // Allowlist + light coercion. Skip keys that don't conform.
    const out: ExtractedInquiryFields = {};
    if (typeof parsed?.event_type === "string") out.event_type = parsed.event_type.toLowerCase().slice(0, 40);
    if (typeof parsed?.event_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.event_date)) out.event_date = parsed.event_date;
    if (Number.isInteger(parsed?.guest_count) && parsed.guest_count > 0 && parsed.guest_count < 10000) out.guest_count = parsed.guest_count;
    if (typeof parsed?.location === "string") out.location = parsed.location.slice(0, 200);
    if (Number.isInteger(parsed?.budget_min_cents) && parsed.budget_min_cents >= 0) out.budget_min_cents = parsed.budget_min_cents;
    if (Number.isInteger(parsed?.budget_max_cents) && parsed.budget_max_cents >= 0) out.budget_max_cents = parsed.budget_max_cents;
    if (typeof parsed?.special_requests === "string") out.special_requests = parsed.special_requests.slice(0, 800);
    return out;
  } catch (err) {
    console.error("[extractInquiryFields] error", err);
    return {};
  }
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

export async function callClaude(
  apiKey: string,
  systemText: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const { text } = await callClaudeWithUsage(apiKey, systemText, messages);
  return text;
}

// Same as callClaude but also returns the Anthropic usage object so
// callers can record tokens for cost reporting. Existing callers can
// keep using callClaude; new callers that want token telemetry call
// this variant.
export async function callClaudeWithUsage(
  apiKey: string,
  systemText: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ text: string; usage: ClaudeUsage }> {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in edge function env");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic ${res.status}: ${errText.slice(0, 500)}`);
  }
  const body = (await res.json()) as any;
  const text = (body.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  if (!text) throw new Error("empty reply from claude");
  const u = body.usage ?? {};
  const usage: ClaudeUsage = {
    input_tokens: Number(u.input_tokens) || 0,
    output_tokens: Number(u.output_tokens) || 0,
    cache_creation_tokens: Number(u.cache_creation_input_tokens) || 0,
    cache_read_tokens: Number(u.cache_read_input_tokens) || 0,
  };
  return { text, usage };
}

// Loads listing + owner-profile context for HILUX. Listing-level
// fields (bio, packages, FAQs, availability) come from
// vendor_profiles; agent-level config (enabled, instructions, voice,
// action toggles) comes from the profile that OWNS the listing.
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
  } | null;
  profile: {
    hilux_enabled: boolean;
    hilux_instructions: string | null;
    hilux_voice_samples: string[];
    hilux_greeting_line: string | null;
    hilux_reply_length: HiluxReplyLength;
    actions: HiluxActions;
  } | null;
  packages: PackageCtx[];
  faqs: FaqCtx[];
  availability: AvailabilityCtx | null;
}> {
  const { data: vendor } = await admin
    .from("vendor_profiles")
    .select(
      "id, user_id, business_name, category, bio, base_price_cents, location",
    )
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) {
    return { vendor: null, profile: null, packages: [], faqs: [], availability: null };
  }

  let profile: {
    hilux_enabled: boolean;
    hilux_instructions: string | null;
    hilux_voice_samples: string[];
    actions: HiluxActions;
  } | null = null;
  if (vendor.user_id) {
    // Profile + private config are two separate tables now —
    // hilux_instructions + hilux_voice_samples live on
    // hilux_private_config (owner-only RLS) so hosts can't see
    // them via the cross-user profiles policy.
    const [profRes, privRes] = await Promise.all([
      admin.from("profiles").select("*").eq("id", vendor.user_id).maybeSingle(),
      admin
        .from("hilux_private_config")
        .select("hilux_instructions, hilux_voice_samples")
        .eq("user_id", vendor.user_id)
        .maybeSingle(),
    ]);
    const profRow = profRes.data as any;
    const privRow = (privRes.data ?? null) as {
      hilux_instructions: string | null;
      hilux_voice_samples: string[] | null;
    } | null;
    if (profRow) {
      profile = {
        hilux_enabled: profRow.hilux_enabled === true,
        hilux_instructions: privRow?.hilux_instructions ?? null,
        hilux_voice_samples: privRow?.hilux_voice_samples ?? [],
        hilux_greeting_line: profRow.hilux_greeting_line ?? null,
        hilux_reply_length: (["short", "medium", "long"].includes(profRow.hilux_reply_length) ? profRow.hilux_reply_length : "medium") as HiluxReplyLength,
        actions: {
          followUp: profRow.hilux_action_follow_up !== false,
          quietHours: profRow.hilux_action_quiet_hours === true,
          pauseWeekends: profRow.hilux_action_pause_weekends === true,
          skipWhenActive: profRow.hilux_action_skip_when_active !== false,
          matchLanguage: profRow.hilux_action_match_language !== false,
          useCalendar: profRow.hilux_action_use_calendar !== false,
          escalate: profRow.hilux_action_escalate !== false,
          askClarifying: profRow.hilux_action_ask_clarifying !== false,
          useFirstName: profRow.hilux_action_use_first_name !== false,
          detectFrustration: profRow.hilux_action_detect_frustration !== false,
          mentionStartingPrice: profRow.hilux_action_mention_starting_price === true,
          suggestPackage: profRow.hilux_action_suggest_package !== false,
          declineNegotiation: profRow.hilux_action_decline_negotiation !== false,
          avoidCompetitors: profRow.hilux_action_avoid_competitors !== false,
          sendPortfolioLink: profRow.hilux_action_send_portfolio_link === true,
          offerCall: profRow.hilux_action_offer_call !== false,
          shareBookingProcess: profRow.hilux_action_share_booking_process !== false,
          echoQuestion: profRow.hilux_action_echo_question === true,
          useEmojis: profRow.hilux_action_use_emojis === true,
          acknowledgeEmotion: profRow.hilux_action_acknowledge_emotion !== false,
          leadWithQuestion: profRow.hilux_action_lead_with_question === true,
          softCtaSignoff: profRow.hilux_action_soft_cta_signoff !== false,
          allowBullets: profRow.hilux_action_allow_bullets === true,
          refuseLegal: profRow.hilux_action_refuse_legal !== false,
          refuseCompetitorPricing: profRow.hilux_action_refuse_competitor_pricing !== false,
          noOtherClients: profRow.hilux_action_no_other_clients !== false,
          redactContact: profRow.hilux_action_redact_contact !== false,
          autoMarkReplied: profRow.hilux_action_auto_mark_replied !== false,
          notifyOnReply: profRow.hilux_action_notify_on_reply === true,
          updateInquiryFields: profRow.hilux_action_update_inquiry_fields === true,
          notifyOnEscalation: profRow.hilux_action_notify_on_escalation !== false,
          notifyOnHotLead: profRow.hilux_action_notify_on_hot_lead !== false,
          emailReplyCopies: profRow.hilux_action_email_reply_copies === true,
          autoArchiveCold: profRow.hilux_action_auto_archive_cold === true,
          dailySummary: profRow.hilux_action_daily_summary === true,
          capRepliesPerInquiry: profRow.hilux_action_cap_replies_per_inquiry === true,
          detectBookingIntent: profRow.hilux_action_detect_booking_intent !== false,
          logActions: profRow.hilux_action_log_actions === true,
        },
      };
    }
  }

  const horizonDays = 180;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const horizonIso = new Date(today.getTime() + horizonDays * 86400000).toISOString().slice(0, 10);

  const [
    { data: packages },
    { data: faqs },
    { data: unavailableRows },
    { data: rules },
    { data: bookedRows },
  ] = await Promise.all([
    admin.from("vendor_packages").select("name, description, price_cents, display_order").eq("vendor_id", vendor.id).eq("is_active", true).order("display_order", { ascending: true }).limit(10),
    admin.from("vendor_faqs").select("question, answer, display_order").eq("vendor_id", vendor.id).order("display_order", { ascending: true }).limit(15),
    admin.from("vendor_unavailable_dates").select("date").eq("vendor_id", vendor.id).gte("date", todayIso).lte("date", horizonIso),
    admin.from("vendor_availability_rules").select("day_of_week, is_unavailable, start_time, end_time").eq("vendor_id", vendor.id),
    admin.rpc("vendor_booked_dates", { p_vendor_id: vendor.id }),
  ]);

  const busySet = new Set<string>();
  for (const row of (unavailableRows ?? []) as Array<{ date: string }>) {
    if (row.date) busySet.add(row.date.slice(0, 10));
  }
  for (const row of (bookedRows ?? []) as Array<{ vendor_booked_dates?: string } | string>) {
    const value = typeof row === "string" ? row : row.vendor_booked_dates;
    if (value) busySet.add(String(value).slice(0, 10));
  }
  const busyDates = Array.from(busySet).filter((d) => d >= todayIso && d <= horizonIso).sort();

  const rulesTyped = (rules ?? []) as Array<{
    day_of_week: number;
    is_unavailable: boolean;
    start_time: string | null;
    end_time: string | null;
  }>;
  const recurringClosedDays = rulesTyped.filter((r) => r.is_unavailable === true).map((r) => r.day_of_week);
  const recurringHourWindows = rulesTyped
    .filter((r) => r.is_unavailable !== true && r.start_time != null && r.end_time != null)
    .map((r) => ({
      dayOfWeek: r.day_of_week,
      start: (r.start_time ?? "").slice(0, 5),
      end: (r.end_time ?? "").slice(0, 5),
    }));

  return {
    vendor,
    profile,
    packages: ((packages ?? []) as Array<{ name: string; description: string | null; price_cents: number | null }>).map((p) => ({
      name: p.name,
      description: p.description,
      priceUsd: priceUsd(p.price_cents),
    })),
    faqs: ((faqs ?? []) as Array<{ question: string; answer: string }>).map((f) => ({ question: f.question, answer: f.answer })),
    availability: { busyDates, recurringClosedDays, recurringHourWindows, today: todayIso, horizon: horizonIso },
  };
}
