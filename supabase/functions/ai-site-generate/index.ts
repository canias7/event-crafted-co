// AI Website Builder — generate a small event microsite from a chat
// prompt. Claude Opus 4.7 returns one self-contained HTML document
// (inline <style>, no external JS, no <script>) optimized for a
// looks-first single-page event site: weddings, birthdays, baby
// showers, etc.
//
// Auth: public (verify_jwt = false) — testing flow per project lead.
// Inserts run with service role so RLS doesn't need an insert policy.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL = "claude-opus-4-7";

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

const SYSTEM_PROMPT = `You design beautiful single-page event websites — weddings, birthday parties, baby showers, engagement parties, anniversaries, graduation parties, bridal showers, gender reveals, holiday parties. The vibe is small, cute, personal — not corporate.

Output rules — these are strict:
1. Reply with ONE complete HTML document and nothing else. No prose before or after, no markdown fences, no explanations. Start with <!DOCTYPE html> and end with </html>.
2. ALL CSS goes in a single <style> tag in the <head>. No external CSS, no Tailwind, no Bootstrap, no Google Fonts <link> tags — system font stacks only.
3. Absolutely NO <script> tags. NO JavaScript. NO inline event handlers. The page must work with JS disabled.
4. Use real, working image URLs from images.unsplash.com (use the format https://images.unsplash.com/photo-XXXXXXXXXX?w=1600&auto=format&fit=crop — pick photo IDs you actually know exist; do not invent IDs that 404). When in doubt, prefer CSS gradients, large emoji as decoration, or SVG illustrations over photos.
5. The page must feel handcrafted: thoughtful typography (serif display + sans body is a safe default), generous whitespace, warm color palette appropriate to the occasion (pastels for showers, deep jewel tones for elegant weddings, bright pop for birthdays). Add subtle CSS animations (fade-ins, gentle floating) where they add charm, but never gimmicky.
6. Include these sections by default unless the user asked for something different: hero with event title + date + names, "Our story" / "About" short copy, key details (when / where / dress code), schedule or itinerary if relevant, RSVP call-to-action (mailto: link is fine), and a closing thank-you note. Adapt copy to the specific event type and tone.
7. Be specific. If the user gives names, dates, locations — use them verbatim. If they don't, invent plausible placeholder details that match the vibe (e.g. "Sarah & James", "October 14th, 2026", "Casa Bella, Tulum") rather than leaving "[Your Name Here]" blanks.
8. Mobile-first responsive. Use clamp() for font sizes, flexbox/grid for layout, max-width container 1200px.
9. Keep total HTML under ~80KB. Don't pad with filler sections.

After the HTML, return nothing. Just the document. The next line after </html> must be the end of your response.

Also, before generating the page, internally pick a short title (3-6 words) for the event. Include it as the <title> tag in <head> AND as an HTML comment on the very first line: <!-- TITLE: Your Chosen Title -->`;

function extractTitle(html: string): string {
  const commentMatch = html.match(/<!--\s*TITLE:\s*([^>-]+?)\s*-->/i);
  if (commentMatch) return commentMatch[1].trim().slice(0, 80);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim().slice(0, 80);
  return "Untitled event";
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "site";
  // Collision-resistant suffix — 6 hex chars = 16M space, plenty for testing.
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${base}-${suffix}`;
}

function stripCodeFences(text: string): string {
  // Models sometimes wrap output in ```html ... ``` despite instructions.
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "");
  }
  return t.trim();
}

async function callClaude(
  userPrompt: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const messages = [
    ...conversation,
    { role: "user" as const, content: userPrompt },
  ];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[ai-site-generate] anthropic error", res.status, errText);
    throw new Error(`anthropic_${res.status}`);
  }
  const body = (await res.json()) as any;
  const text = (body.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("empty_response");
  return stripCodeFences(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const payload = await req.json().catch(() => ({}));
    const userPrompt = String(payload?.prompt ?? "").trim();
    if (!userPrompt) return json(400, { error: "missing_prompt" });
    if (userPrompt.length > 4000) {
      return json(400, { error: "prompt_too_long" });
    }

    const rawConv = Array.isArray(payload?.conversation)
      ? payload.conversation
      : [];
    const conversation = rawConv
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
      .slice(-10)
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content).slice(0, 8000),
      }));

    const html = await callClaude(userPrompt, conversation);
    if (!html.toLowerCase().includes("<!doctype html")) {
      console.error("[ai-site-generate] non-html reply", html.slice(0, 200));
      return json(502, { error: "invalid_generation" });
    }

    const title = extractTitle(html);
    const slug = slugify(title);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: insertErr } = await admin.from("ai_sites").insert({
      slug,
      title,
      prompt: userPrompt,
      html,
    });
    if (insertErr) {
      console.error("[ai-site-generate] insert error", insertErr);
      return json(500, { error: "save_failed" });
    }

    return json(200, { slug, title, html });
  } catch (e) {
    console.error("[ai-site-generate] uncaught", e);
    return json(500, { error: "generation_failed" });
  }
});
