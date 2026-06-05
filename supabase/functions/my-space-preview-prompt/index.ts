// Returns the actual system prompt My Space would use for the caller's
// vendor listing. Used by the AI Super Agents page to display the
// prompt next to the toggle controls — gives vendors transparency
// into what My Space is told.
//
// Auth: vendor JWT. Resolves the caller's primary listing
// automatically (highest-tier listing they own).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  DEFAULT_ACTIONS,
  loadVendorContext,
  priceUsd,
} from "../_shared/hilux-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

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

    // Audit #13: gate on vendor role. Logged-in hosts shouldn't
    // be able to hit this — they'd just get a "no listing" 404
    // anyway, but each call still does multiple DB roundtrips.
    const { data: profileRow } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if ((profileRow as { role?: string } | null)?.role !== "vendor") {
      return json(403, { error: "vendor_only" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Caller's primary listing — same ranking the cap functions use
    // (studio > pro > starter > free), then any listing with a
    // stripe customer wins ties.
    // Audit #2: vendor_profiles.subscription_tier + stripe_customer_id
    // were deprecated by the per-user state-to-profiles migration.
    // Both columns are NULL for any vendor onboarded after that
    // migration, so the old "highest-tier first" ranking always fell
    // through to created_at anyway. Pick the oldest listing
    // explicitly — that's the most likely "primary" one anyway, and
    // doesn't depend on dead columns.
    const { data: listingsRaw } = await admin
      .from("vendor_profiles")
      .select("id, created_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    const listings = (listingsRaw ?? []) as Array<{
      id: string;
      created_at: string | null;
    }>;
    if (listings.length === 0) {
      return json(404, { error: "no_listing" });
    }
    const vendorId = listings[0].id;

    const ctx = await loadVendorContext(admin, vendorId);
    if (!ctx.vendor) return json(404, { error: "vendor_not_found" });

    const actions = ctx.profile?.actions ?? DEFAULT_ACTIONS;

    const prompt = buildSystemPrompt({
      businessName: ctx.vendor.business_name ?? "this vendor",
      category: ctx.vendor.category,
      bio: ctx.vendor.bio,
      location: ctx.vendor.location,
      startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
      customInstructions: ctx.profile?.hilux_instructions ?? null,
      voiceSamples: ctx.profile?.hilux_voice_samples ?? [],
      packages: ctx.packages,
      faqs: ctx.faqs,
      // No inquiry in preview — this is the generic system prompt
      // shape, not tied to a specific host conversation.
      inquiry: null,
      availability: ctx.availability,
      actions,
      hostFirstName: null,
      isFirstReply: true,
    });

    return json(200, {
      prompt,
      vendor_id: vendorId,
      business_name: ctx.vendor.business_name,
    });
  } catch (err) {
    console.error("[my-space-preview-prompt] uncaught", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
