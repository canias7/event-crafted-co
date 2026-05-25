// My Space chat — vendor-side conversational AI surface, served from
// the /vendor/ai-superagents page. Single endpoint that decides per
// request whether to route to:
//
//   • OpenAI gpt-image-1 (when the latest user message reads as an
//     image-generation ask — "draw…", "make a picture of…", etc.)
//   • Claude Sonnet (everything else: drafts, brainstorms, advice)
//
// The auth gate is "signed-in user only" via the access token from
// the supabase-js client. We don't gate on hilux_enabled or anything
// else — the chatbox is always available to any signed-in vendor.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const SONNET_MODEL = "claude-sonnet-4-6";
const IMAGE_MODEL = "gpt-image-1";

const SYSTEM_PROMPT = `You are My Space, the in-app AI assistant for an event vendor on the Vendora platform.

You help the vendor:
- Draft replies to host inquiries (warm, professional, concise)
- Brainstorm pricing, packages, and upsells
- Plan their day, summarize their inbox, suggest follow-ups
- Generate images on request (if the user asks for an image, image generation will be handled separately — focus on text)

Style:
- Direct and helpful. Short paragraphs. No filler.
- When drafting a reply to a host, write the reply text itself — don't preface with "here's a draft."
- If you need more info to do the job, ask one specific follow-up question instead of guessing.

You are NOT writing on the vendor's behalf to a host in this thread — you are talking to the vendor themselves.`;

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

// Heuristic: does the latest user message read as an image request?
// We keep this on the keyword side rather than asking Claude — every
// classification roundtrip would double latency on every send.
function looksLikeImageRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return false;
  // Strong signals: an explicit image verb followed by an "image"-y noun
  // within the first ~120 chars (covers "draw me a logo", "generate a
  // moody product shot of...", "create an image of a cake").
  const head = t.slice(0, 120);
  const verbs = /(draw|generate|create|make|paint|design|render|sketch|illustrate|produce|show me|give me)/;
  const nouns = /(image|picture|photo|photograph|illustration|art(work)?|render|graphic|logo|mockup|poster|flyer|product shot|scene|portrait|painting)/;
  return verbs.test(head) && nouns.test(head);
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function callClaude(messages: ChatMessage[]): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("anthropic_key_missing");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 1024,
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
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 240)}`);
  }
  const body = (await res.json()) as any;
  const text = (body.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  return text || "(no response)";
}

async function callOpenAIImage(
  prompt: string,
): Promise<{ imageUrl: string }> {
  if (!OPENAI_API_KEY) throw new Error("openai_key_missing");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      n: 1,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`openai ${res.status}: ${t.slice(0, 240)}`);
  }
  const body = (await res.json()) as any;
  // gpt-image-1 returns either a URL or base64 depending on the
  // response_format param; default is base64 (b64_json). Wrap as a
  // data URL so the frontend can drop it straight into <img src>.
  const first = body?.data?.[0];
  if (first?.url) return { imageUrl: first.url };
  if (first?.b64_json) {
    return { imageUrl: `data:image/png;base64,${first.b64_json}` };
  }
  throw new Error("openai_no_image_in_response");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    // Gate on a signed-in user. We use the anon client + the caller's
    // access token so RLS still applies if we later read tables here.
    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await client.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const payload = await req.json().catch(() => ({}));
    const messages = Array.isArray(payload?.messages)
      ? (payload.messages as ChatMessage[])
      : [];
    if (messages.length === 0) {
      return json(400, { error: "no_messages" });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return json(400, { error: "no_user_message" });

    if (looksLikeImageRequest(lastUser.content)) {
      const { imageUrl } = await callOpenAIImage(lastUser.content);
      return json(200, {
        type: "image",
        imageUrl,
        prompt: lastUser.content,
      });
    }

    const text = await callClaude(messages);
    return json(200, { type: "text", text });
  } catch (err) {
    console.error("[my-space-chat] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "chat_failed", detail: message.slice(0, 240) });
  }
});
