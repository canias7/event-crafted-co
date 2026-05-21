// HILUX sandbox — vendor preview chat. Reads agent config from the
// caller's profile (HILUX is now per-profile, not per-listing). The
// vendor picks one of their listings so HILUX gets a concrete
// bio/packages/availability to chat about; instructions, voice
// samples, and action toggles all come from the profile.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  callClaude,
  DEFAULT_ACTIONS,
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json(401, { error: "missing_authorization" });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "invalid_session" });
    const userId = userData.user.id;

    const payload = await req.json().catch(() => ({}));
    const vendorId = String(payload?.vendor_id ?? "").trim();
    const messagesIn = Array.isArray(payload?.messages) ? payload.messages : [];
    const instructionsOverride =
      typeof payload?.instructions_override === "string"
        ? payload.instructions_override
        : null;
    if (!vendorId) return json(400, { error: "missing_vendor_id" });
    if (messagesIn.length === 0) return json(400, { error: "missing_messages" });

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
    if (messages.length > 30) return json(400, { error: "too_many_messages" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Ownership check. The old version selected vendor_profiles
    // through the user's RLS, but vendor_profiles is publicly
    // readable for the marketplace — so any authenticated user
    // could pass that check with any vendor_id and preview a
    // competitor's HILUX config. We check vendor_team_members
    // directly via service role here.
    const { data: membership } = await admin
      .from("vendor_team_members")
      .select("user_id")
      .eq("vendor_id", vendorId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return json(403, { error: "not_your_listing" });

    const ctx = await loadVendorContext(admin, vendorId);
    if (!ctx.vendor) return json(404, { error: "vendor_not_found" });

    const customInstructions =
      instructionsOverride !== null
        ? instructionsOverride
        : (ctx.profile?.hilux_instructions ?? null);

    const isFirstReply = !messages.some((m) => m.role === "assistant");
    const systemText = buildSystemPrompt({
      businessName: ctx.vendor.business_name ?? "this vendor",
      category: ctx.vendor.category,
      bio: ctx.vendor.bio,
      location: ctx.vendor.location,
      startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
      customInstructions,
      voiceSamples: ctx.profile?.hilux_voice_samples ?? [],
      packages: ctx.packages,
      faqs: ctx.faqs,
      inquiry: null,
      availability: ctx.availability,
      actions: ctx.profile?.actions ?? DEFAULT_ACTIONS,
      hostFirstName: null,
      isFirstReply,
    });

    const reply = await callClaude(ANTHROPIC_API_KEY, systemText, messages);
    console.log("[hilux-sandbox] replied", { user: userId, vendor: vendorId, reply_len: reply.length });
    return json(200, { reply });
  } catch (err) {
    console.error("[hilux-sandbox] uncaught:", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
