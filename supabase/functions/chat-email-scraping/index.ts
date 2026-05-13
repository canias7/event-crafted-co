// Email scraping chat — admin sends a message ("find 10 photographers
// in Charlotte and email them"), this function runs a Claude tool-use
// loop with two tools:
//   - web_search (Anthropic native) — finds real businesses + emails
//   - add_lead (custom)             — writes a row to email_leads
// then returns the final assistant text. The transcript is persisted
// in email_scraping_messages on both sides.
//
// Auth: admin-only. We pull the caller's auth.uid() via the JWT they
// pass in the Authorization header, then check profiles.role='admin'.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const MODEL = "claude-sonnet-4-6";
const MAX_LOOPS = 8;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are an outreach assistant inside an admin tool. The admin will ask
you to find specific kinds of small businesses (photographers, florists,
DJs, etc.) in a given area and add them as outreach leads.

Use the web_search tool to find real businesses. For each one you want
to track, call the add_lead tool with their email, name, source (a
short phrase like "Charlotte photographers scrape, 2026-05"), and any
useful notes (website URL, specialty, phone).

Rules:
- Only add a lead when you have a real email address you found on the
  web. Don't fabricate emails.
- When the admin asks for "N" results, aim for N but don't pad with
  bad data — quality over quantity.
- After adding leads, summarize what you did in plain text: how many
  leads added, where they came from, anything notable.
- The admin can review and edit each lead in the Email leads tab. You
  do NOT send actual emails in this version — that's a future tool.
- Keep prose short. Bullet points if needed.`;

interface AnthropicTool {
  type?: string;
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  max_uses?: number;
}

const TOOLS: AnthropicTool[] = [
  {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 4,
  },
  {
    name: "add_lead",
    description:
      "Add a new outreach lead to the email_leads table. Use this once per business you want to track.",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address you found for this business.",
        },
        name: {
          type: "string",
          description: "Business or contact name.",
        },
        source: {
          type: "string",
          description:
            "Short phrase identifying where this lead came from, e.g. 'Charlotte photographers scrape 2026-05'.",
        },
        notes: {
          type: "string",
          description:
            "Optional context: website, specialty, phone, anything useful.",
        },
      },
      required: ["email"],
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Verify caller is admin via their JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", who.user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { message } = (await req.json()) as { message?: string };
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Save the user message first.
    const { data: userMsg, error: userErr } = await admin
      .from("email_scraping_messages")
      .insert({ user_id: who.user.id, role: "user", content: message })
      .select("id, role, content, created_at")
      .single();
    if (userErr) {
      return new Response(JSON.stringify({ error: userErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Load full history (sans the message we just inserted — we'll
    // append it ourselves to the Anthropic conversation).
    const { data: history } = await admin
      .from("email_scraping_messages")
      .select("role, content")
      .eq("user_id", who.user.id)
      .order("created_at", { ascending: true })
      .limit(200);

    // Build Anthropic-style messages. Only user + assistant turns;
    // skip system rows (we send the system prompt separately).
    const conversation: any[] = (history ?? [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({
        role: m.role,
        content: m.content,
      }));

    // Tool-use loop. We accumulate Claude's reply (text + tool calls)
    // and any tool results, looping until Claude stops asking for
    // more tools or we hit the cap.
    let leadsAdded = 0;
    let finalText = "";

    for (let i = 0; i < MAX_LOOPS; i++) {
      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: conversation,
        }),
      });
      if (!apiRes.ok) {
        const errText = await apiRes.text();
        return new Response(
          JSON.stringify({
            error: `Anthropic API ${apiRes.status}: ${errText.slice(0, 500)}`,
          }),
          {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }
      const apiBody = (await apiRes.json()) as any;
      const stopReason = apiBody.stop_reason;
      const contentBlocks = (apiBody.content ?? []) as any[];

      // Append Claude's assistant message verbatim to conversation
      // (preserves tool_use blocks for the next turn's tool_result).
      conversation.push({ role: "assistant", content: contentBlocks });

      // If Claude returned tool calls, execute them and add tool_result.
      const toolUses = contentBlocks.filter(
        (b: any) => b.type === "tool_use",
      );
      if (toolUses.length > 0) {
        const toolResults: any[] = [];
        for (const tu of toolUses) {
          if (tu.name === "add_lead") {
            const args = tu.input ?? {};
            const { data: insertedLead, error: leadErr } = await admin
              .from("email_leads")
              .insert({
                email: String(args.email ?? "").trim(),
                name: args.name ? String(args.name).trim() : null,
                source: args.source ? String(args.source).trim() : null,
                notes: args.notes ? String(args.notes).trim() : null,
                created_by: who.user.id,
              })
              .select("id, email")
              .single();
            if (leadErr) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `Error adding lead: ${leadErr.message}`,
                is_error: true,
              });
            } else {
              leadsAdded++;
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `Lead added (id=${insertedLead?.id}, email=${insertedLead?.email}).`,
              });
            }
          }
          // web_search tool calls are handled by Anthropic natively;
          // we never see them as tool_use blocks to execute.
        }
        if (toolResults.length > 0) {
          conversation.push({ role: "user", content: toolResults });
          continue; // Loop again with results in context.
        }
      }

      // If we got here, Claude didn't ask for any custom tool calls
      // we need to handle. Collect text and break.
      finalText = contentBlocks
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n\n")
        .trim();
      if (stopReason === "end_turn" || stopReason === "stop_sequence") break;
      // Otherwise (e.g. max_tokens), still break — we'll show what we got.
      break;
    }

    if (!finalText) {
      finalText =
        leadsAdded > 0
          ? `Added ${leadsAdded} lead(s). Check the Email leads tab.`
          : "I wasn't able to find any leads for that request. Try a more specific query.";
    }

    // Save assistant reply and return.
    const { data: asstMsg, error: asstErr } = await admin
      .from("email_scraping_messages")
      .insert({
        user_id: who.user.id,
        role: "assistant",
        content: finalText,
        metadata: { leads_added: leadsAdded },
      })
      .select("id, role, content, created_at")
      .single();
    if (asstErr) {
      return new Response(JSON.stringify({ error: asstErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        user_message: userMsg,
        assistant_message: asstMsg,
        leads_added: leadsAdded,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
});
