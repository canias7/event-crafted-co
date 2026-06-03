// POST /document-ai-draft { kind: "contract"|"proposal", prompt, businessName? }
//
// Drafts a contract or proposal body from a free-text description using Claude
// (structured tool output). Returns { name, body }. The body uses the same
// merge placeholders the app fills from the inquiry ([Client Name],
// [Event Date], [Venue / Location], [Total Amount]) so it renders correctly on
// the public proposal / sign pages. verify_jwt=true.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-sonnet-4-6";

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
    const body = await req.json();
    const kind = body?.kind === "contract" ? "contract" : "proposal";
    const prompt = String(body?.prompt ?? "").trim();
    const businessName = String(body?.businessName ?? "").trim().slice(0, 120);
    if (prompt.length < 3) return json(400, { error: "prompt_required" });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    if (!res.ok) {
      const t = await res.text();
      console.error("[document-ai-draft] anthropic error", res.status, t.slice(0, 240));
      return json(502, { error: "ai_failed" });
    }
    const data = await res.json();
    const block = (data.content ?? []).find((c: any) => c.type === "tool_use");
    const out = block?.input;
    if (!out?.body) return json(502, { error: "no_draft" });
    return json(200, {
      name: String(out.name ?? "").trim().slice(0, 120) || (kind === "contract" ? "Service Contract" : "Proposal"),
      body: String(out.body).trim().slice(0, 8000),
    });
  } catch (e) {
    return json(500, { error: "server_error", detail: String(e).slice(0, 200) });
  }
});
