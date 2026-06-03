// POST /document-ai-draft { kind: "contract"|"proposal", prompt, businessName? }
//
// Drafts a contract or proposal body from a free-text description using Claude
// (structured tool output). Returns { name, body }. Body uses the app's merge
// placeholders ([Client Name], [Event Date], [Venue / Location], [Total Amount])
// so it renders on the public pages. verify_jwt=true. Metered: charges
// document_ai_draft credits before the call, refunds on failure; logs COGS.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  consumeCredits,
  insufficientCreditsResponse,
  refundCredits,
} from "../_shared/credits.ts";
import { logClaudeUsage } from "../_shared/ai-usage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-sonnet-4-6";
const ACTION = "document_ai_draft" as const;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const TOOL = {
  name: "draft_document",
  description: "Return a drafted contract or proposal.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short title for the document." },
      body: { type: "string", description: "The full document body as plain text." },
    },
    required: ["name", "body"],
  },
} as const;

const PROPOSAL_GUIDE =
  "Draft an event-vendor PROPOSAL. Use EXACTLY this structure and these literal " +
  "placeholders so the app can fill them:\n\n" +
  "Prepared for [Client Name] · [Event Date] · [Venue / Location]\n\n" +
  "<one short thank-you/intro sentence naming the business>\n\n" +
  "What's included\n- <item>\n- <item>\n- <item>\n\n" +
  "Investment\n<Package name> — [Total Amount]\n\n" +
  "A 30% retainer reserves your date; the balance is due 14 days before the event. " +
  "This proposal is valid for 30 days.\n\n" +
  "Keep [Client Name], [Event Date], [Venue / Location] and [Total Amount] as " +
  "literal placeholders. Do not invent a real price.";

const CONTRACT_GUIDE =
  "Draft an event-vendor SERVICE CONTRACT. Use the literal placeholders " +
  "[Client Name], [Event Date], [Venue / Location] and [Total Amount] where " +
  "appropriate. Include concise numbered sections (Parties, Services, Payment, " +
  "Cancellation & Refunds, Rescheduling, Liability, Agreement). Keep it " +
  "professional and reasonably brief. Do NOT include any 'Signature: ____' lines " +
  "or a title heading line — the platform adds the title and e-signature block.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!ANTHROPIC_API_KEY) return json(500, { error: "anthropic_key_missing" });
  try {
    const reqBody = await req.json();
    const kind = reqBody?.kind === "contract" ? "contract" : "proposal";
    const prompt = String(reqBody?.prompt ?? "").trim();
    const businessName = String(reqBody?.businessName ?? "").trim().slice(0, 120);
    if (prompt.length < 3) return json(400, { error: "prompt_required" });

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json(401, { error: "unauthorized" });

    const ref = `document_ai_${crypto.randomUUID()}`;
    const consume = await consumeCredits(userId, ACTION, ref);
    if (!consume.ok) {
      if (consume.reason === "insufficient_credits") {
        return insufficientCreditsResponse(consume.cost, cors);
      }
      return json(503, { error: "credit_service_unavailable" });
    }

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          tools: [TOOL],
          tool_choice: { type: "tool", name: "draft_document" },
          system:
            (kind === "contract" ? CONTRACT_GUIDE : PROPOSAL_GUIDE) +
            (businessName ? `\n\nThe vendor's business name is "${businessName}".` : ""),
          messages: [{ role: "user", content: prompt.slice(0, 2000) }],
        }),
      });
    } catch (e) {
      await refundCredits(userId, ACTION, ref, "network");
      throw e;
    }
    if (!res.ok) {
      const t = await res.text();
      console.error("[document-ai-draft] anthropic error", res.status, t.slice(0, 240));
      await refundCredits(userId, ACTION, ref, `anthropic_${res.status}`);
      return json(502, { error: "ai_failed" });
    }
    const data = await res.json();
    const usage = data.usage ?? {};
    await logClaudeUsage({
      userId,
      actionType: ACTION,
      model: MODEL,
      tokens: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      },
      refId: ref,
    });

    const block = (data.content ?? []).find((c: any) => c.type === "tool_use");
    const out = block?.input;
    if (!out?.body) {
      await refundCredits(userId, ACTION, ref, "no_draft");
      return json(502, { error: "no_draft" });
    }
    return json(200, {
      name: String(out.name ?? "").trim().slice(0, 120) || (kind === "contract" ? "Service Contract" : "Proposal"),
      body: String(out.body).trim().slice(0, 8000),
      credits_remaining: consume.balance,
    });
  } catch (e) {
    return json(500, { error: "server_error", detail: String(e).slice(0, 200) });
  }
});
