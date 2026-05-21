// HILUX sandbox — vendor preview chat.
//
// Lets a vendor pressure-test HILUX's voice from /vendor/super-agents
// without HILUX actually messaging real hosts. Same prompt wiring as
// hilux-respond (shared module) but reads the vendor's listing context
// + an OPTIONAL instructions_override (so the vendor can preview
// different custom-instruction drafts before saving them) and replies
// to a transient message list passed in the request — nothing is
// persisted to direct_messages.
//
// verify_jwt = true. The vendor's session token authenticates the
// caller; we then require that the requested vendor_id belongs to
// that user (or that they're a team member of that listing).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  callClaude,
  loadVendorContext,
  priceUsd,
} from "../_shared/hilux-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

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

interface SandboxMessage {
  role: "user" | "assistant";
  content: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Authenticate the caller via their Supabase session JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json(401, { error: "missing_authorization" });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { error: "invalid_session" });
    }
    const userId = userData.user.id;

    const payload = await req.json().catch(() => ({}));
    const vendorId = String(payload?.vendor_id ?? "").trim();
    const messagesIn = Array.isArray(payload?.messages) ? payload.messages : [];
    const instructionsOverride =
      typeof payload?.instructions_override === "string"
        ? payload.instructions_override
        : null;

    if (!vendorId) return json(400, { error: "missing_vendor_id" });
    if (messagesIn.length === 0) {
      return json(400, { error: "missing_messages" });
    }

    // Normalize + validate the message list.
    const messages: SandboxMessage[] = [];
    for (const m of messagesIn) {
      const role = m?.role === "assistant" ? "assistant" : "user";
      const content = String(m?.content ?? "").trim();
      if (!content) continue;
      messages.push({ role, content });
    }
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return json(400, { error: "last_message_must_be_user" });
    }
    if (messages.length > 30) {
      return json(400, { error: "too_many_messages" });
    }

    // Ownership check: the caller must own the listing (or be a team
    // member). We re-use the user-scoped client so RLS enforces it
    // automatically — if they can't read this row, they can't preview it.
    const { data: ownership } = await userClient
      .from("vendor_profiles")
      .select("id")
      .eq("id", vendorId)
      .maybeSingle();
    if (!ownership) {
      return json(403, { error: "not_your_listing" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ctx = await loadVendorContext(admin, vendorId);
    if (!ctx.vendor) {
      return json(404, { error: "vendor_not_found" });
    }

    const customInstructions =
      instructionsOverride !== null
        ? instructionsOverride
        : ctx.vendor.hilux_instructions;

    const systemText = buildSystemPrompt({
      businessName: ctx.vendor.business_name ?? "this vendor",
      category: ctx.vendor.category,
      bio: ctx.vendor.bio,
      location: ctx.vendor.location,
      startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
      customInstructions,
      packages: ctx.packages,
      faqs: ctx.faqs,
      inquiry: null,
      availability: ctx.availability,
    });

    const reply = await callClaude(ANTHROPIC_API_KEY, systemText, messages);

    console.log("[hilux-sandbox] replied", {
      user: userId,
      vendor: vendorId,
      reply_len: reply.length,
    });

    return json(200, { reply });
  } catch (err) {
    console.error("[hilux-sandbox] uncaught:", err);
    return json(500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
