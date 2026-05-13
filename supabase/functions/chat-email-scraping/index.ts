// Email scraping chat. Admin sends a message, this runs a Claude
// tool-use loop with two tools: web_search (Anthropic native) +
// add_lead (writes to email_leads). Transcript persists in
// email_scraping_messages.
//
// Errors are surfaced as visible assistant messages with a 200
// response so the chat UI can show them inline instead of a generic
// "non-2xx" toast.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const MODEL = "claude-sonnet-4-6";
// Tight caps to stay under the org's 30K input TPM. web_search results
// are large (~5–10K tokens each) and accumulate across loop iterations.
const MAX_LOOPS = 4;
const WEB_SEARCH_MAX_USES = 2;
const HISTORY_TURNS = 12;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT =
  `You are an outreach assistant inside an admin tool. The admin will sometimes ask you to find specific kinds of small businesses (photographers, florists, DJs, etc.) in a given area and add them as outreach leads.

When (and ONLY when) the admin explicitly asks you to find / scrape / look up leads, use the web_search tool to find real businesses, then call the add_lead tool once per business with their email, name, source (a short phrase like "Charlotte photographers scrape, 2026-05"), and any useful notes.

If the admin's message is a greeting, a question, a clarification, or anything other than an explicit lead-finding request, do NOT call any tools — just reply briefly in plain text.

Rules:
- Only add a lead when you have a real email address you found on the web. Don't fabricate emails.
- When asked for "N" results, aim for N but don't pad with bad data — quality over quantity.
- After adding leads, summarize in plain text: how many added, where they came from, anything notable.
- The admin can review and edit each lead in the Email leads tab. You do NOT send actual emails in this version.
- Keep prose short. Bullet points if needed.`;

// Prompt caching: system prompt + tools are static, so marking them
// cache_control: ephemeral lets Anthropic cache the prefix and only
// charge ~10% input TPM on subsequent loop iterations within the same
// request, AND on subsequent admin requests within the 5-min cache
// window. This is what stops the 30K input TPM cap from biting.
const SYSTEM_BLOCKS: any[] = [
  { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
];

const TOOLS: any[] = [
  { type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES },
  {
    name: "add_lead",
    description:
      "Add a new outreach lead to the email_leads table. Use this once per business you want to track.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email address." },
        name: { type: "string", description: "Business or contact name." },
        source: { type: "string", description: "Short phrase identifying where this lead came from." },
        notes: { type: "string", description: "Optional context: website, specialty, phone." },
      },
      required: ["email"],
    },
    cache_control: { type: "ephemeral" },
  },
];

async function reply(admin: any, userId: string, userMsg: any, text: string, metadata: Record<string, unknown> = {}) {
  const { data: asstMsg, error } = await admin
    .from("email_scraping_messages")
    .insert({ user_id: userId, role: "assistant", content: text, metadata })
    .select("id, role, content, created_at")
    .single();
  if (error) console.error("[chat-email-scraping] failed to save reply:", error);
  return new Response(
    JSON.stringify({
      user_message: userMsg,
      assistant_message: asstMsg ?? { id: "temp", role: "assistant", content: text, created_at: new Date().toISOString() },
      leads_added: typeof metadata.leads_added === "number" ? metadata.leads_added : 0,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
}

// Trim history to stay under the input TPM cap. Take the most recent
// HISTORY_TURNS messages, drop leading assistant messages (Anthropic
// requires the conversation to start with a user turn), and collapse
// runs of consecutive same-role messages so a prior failed request
// (orphan user msg with no assistant reply) doesn't leave Claude
// re-attempting the previous request when a new one arrives.
function buildConversation(history: { role: string; content: string }[]): any[] {
  const recent = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-HISTORY_TURNS);
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();
  // Collapse consecutive same-role: keep only the last in each run.
  const collapsed: { role: string; content: string }[] = [];
  for (const m of recent) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.role === m.role) collapsed[collapsed.length - 1] = m;
    else collapsed.push(m);
  }
  return collapsed.map((m) => ({ role: m.role, content: m.content }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let userMsg: any = null;
  let admin: any = null;
  let userId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    userId = who.user.id;

    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { message } = (await req.json()) as { message?: string };
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Missing message" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: inserted, error: userErr } = await admin
      .from("email_scraping_messages")
      .insert({ user_id: userId, role: "user", content: message })
      .select("id, role, content, created_at")
      .single();
    if (userErr) {
      return new Response(JSON.stringify({ error: `Save user msg: ${userErr.message}` }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    userMsg = inserted;

    const { data: history } = await admin
      .from("email_scraping_messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(200);

    const conversation = buildConversation(history ?? []);

    let leadsAdded = 0;
    let finalText = "";

    for (let i = 0; i < MAX_LOOPS; i++) {
      console.log(`[chat-email-scraping] loop ${i + 1}, conversation length ${conversation.length}`);

      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: SYSTEM_BLOCKS, tools: TOOLS, messages: conversation }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error(`[chat-email-scraping] anthropic ${apiRes.status}:`, errText.slice(0, 1000));
        const friendly = apiRes.status === 429
          ? "Rate limit hit on the Anthropic API. Wait a minute and try again, or ask for fewer results."
          : `Anthropic API error (${apiRes.status}). ${errText.slice(0, 200)}`;
        return await reply(admin, userId!, userMsg, friendly, { error: true, status: apiRes.status, leads_added: leadsAdded });
      }

      const apiBody = (await apiRes.json()) as any;
      const stopReason = apiBody.stop_reason;
      const contentBlocks = (apiBody.content ?? []) as any[];
      const u = apiBody.usage ?? {};

      console.log(
        `[chat-email-scraping] stop_reason=${stopReason} blocks=${contentBlocks.map((b: any) => b.type).join(",")} usage=in:${u.input_tokens ?? 0}/out:${u.output_tokens ?? 0}/cache_create:${u.cache_creation_input_tokens ?? 0}/cache_read:${u.cache_read_input_tokens ?? 0}`,
      );

      const turnText = contentBlocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n\n").trim();
      if (turnText) finalText = turnText;

      conversation.push({ role: "assistant", content: contentBlocks });

      const toolUses = contentBlocks.filter((b: any) => b.type === "tool_use");
      if (toolUses.length === 0) break;

      const toolResults: any[] = [];
      for (const tu of toolUses) {
        if (tu.name === "add_lead") {
          const args = tu.input ?? {};
          const email = String(args.email ?? "").trim();
          if (!email) {
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "Error: email is required.", is_error: true });
            continue;
          }
          const { data: insertedLead, error: leadErr } = await admin
            .from("email_leads")
            .insert({
              email,
              name: args.name ? String(args.name).trim() : null,
              source: args.source ? String(args.source).trim() : null,
              notes: args.notes ? String(args.notes).trim() : null,
              created_by: userId,
            })
            .select("id, email")
            .single();
          if (leadErr) {
            console.error("[chat-email-scraping] add_lead db error:", leadErr);
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Error adding lead: ${leadErr.message}`, is_error: true });
          } else {
            leadsAdded++;
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Lead added (id=${insertedLead?.id}, email=${insertedLead?.email}).` });
          }
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Unknown tool: ${tu.name}`, is_error: true });
        }
      }

      conversation.push({ role: "user", content: toolResults });
    }

    if (!finalText) {
      finalText = leadsAdded > 0 ? `Added ${leadsAdded} lead(s). Check the Email leads tab.` : "I wasn't able to find any leads for that request. Try a more specific query.";
    }

    return await reply(admin, userId!, userMsg, finalText, { leads_added: leadsAdded });
  } catch (err) {
    console.error("[chat-email-scraping] uncaught:", err);
    const text = `Internal error: ${err instanceof Error ? err.message : String(err)}`;
    if (admin && userId && userMsg) return await reply(admin, userId, userMsg, text, { error: true });
    return new Response(JSON.stringify({ error: text }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
