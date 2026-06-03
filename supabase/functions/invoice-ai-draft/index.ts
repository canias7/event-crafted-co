// POST /invoice-ai-draft { description }
//
// Drafts invoice line items from a free-text job description using Claude
// (structured tool output). Returns { items: [{name, qty, unit_price}], notes }.
// verify_jwt=true: only authenticated users (the vendor in the composer) can
// call it, so the Anthropic key isn't exposed to anonymous traffic.

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
  name: "draft_invoice",
  description: "Return drafted invoice line items for an event vendor.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "1-12 line items inferred from the description.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Concise line item name." },
            qty: { type: "number", description: "Whole-number quantity, >= 1." },
            unit_price: { type: "number", description: "Unit price in USD dollars (not cents)." },
          },
          required: ["name", "qty", "unit_price"],
        },
      },
      notes: { type: "string", description: "Optional short note for the invoice (scope/terms)." },
    },
    required: ["items"],
  },
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!ANTHROPIC_API_KEY) return json(500, { error: "anthropic_key_missing" });
  try {
    const { description } = await req.json();
    const desc = String(description ?? "").trim();
    if (desc.length < 3) return json(400, { error: "description_required" });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "draft_invoice" },
        system:
          "You draft professional invoice line items for an event-services vendor. " +
          "Infer reasonable line items, whole-number quantities, and unit prices in USD " +
          "from the vendor's description. If the vendor gives a single total, split it into " +
          "sensible line items that sum to it. Keep names concise and professional. " +
          "Do not add taxes or fees unless explicitly mentioned.",
        messages: [{ role: "user", content: desc.slice(0, 2000) }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[invoice-ai-draft] anthropic error", res.status, t.slice(0, 240));
      return json(502, { error: "ai_failed" });
    }
    const data = await res.json();
    const block = (data.content ?? []).find((c: any) => c.type === "tool_use");
    if (!block?.input?.items) return json(502, { error: "no_draft" });
    const items = (block.input.items as any[])
      .filter((it) => it && typeof it.name === "string" && it.name.trim())
      .slice(0, 12)
      .map((it) => ({
        name: String(it.name).trim().slice(0, 200),
        qty: Math.max(1, Math.round(Number(it.qty) || 1)),
        unit_price: Math.max(0, Number(it.unit_price) || 0),
      }));
    if (items.length === 0) return json(502, { error: "no_draft" });
    return json(200, { items, notes: typeof block.input.notes === "string" ? block.input.notes.slice(0, 600) : null });
  } catch (e) {
    return json(500, { error: "server_error", detail: String(e).slice(0, 200) });
  }
});
