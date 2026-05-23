import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Live-reads the vendor's current subscription tier from profiles
// (subscription state moved off vendor_profiles in migration
// 20260524000000_subscription_state_to_profiles — was per-listing,
// is per-user now). Subscribes to postgres_changes on the row so
// the label flips the moment the Stripe webhook writes a new tier
// back — no refetch-on-mount, no waiting for the user to navigate.
//
// Tier values mirror VendorSubscriptionPage's PlanState['tier']:
// free | starter | pro | studio. Anything else falls back to 'free'.
//
// IMPORTANT: callers pass userId (auth.users.id) — NOT a
// vendor_profiles.id. Migration 0524 means tier no longer lives
// per-listing.

export type VendorTier = "free" | "starter" | "pro" | "studio";

const VALID_TIERS = new Set<VendorTier>(["free", "starter", "pro", "studio"]);

// Per-vendor tier cache. DashboardSidebar remounts on every route
// change in the vendor portal (each page mounts its own sidebar
// instance), so without this cache the plan badge under "Vendora"
// flickers from "Free plan" to the real tier on every navigation
// while the fetch is in flight.
//
// Cleared on auth SIGNED_OUT (audit #16) so a re-login of a
// different account doesn't briefly paint with the previous user's
// tier.
const tierCache = new Map<string, VendorTier>();

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") tierCache.clear();
});

export function useVendorPlan(userId: string | null | undefined): {
  tier: VendorTier;
  loading: boolean;
} {
  const cached = userId ? tierCache.get(userId) : undefined;
  const [tier, setTier] = useState<VendorTier>(cached ?? "free");
  const [loading, setLoading] = useState<boolean>(
    Boolean(userId) && cached === undefined,
  );
  // useId gives every mounting consumer a unique suffix so two
  // pages (sidebar + page) using the same userId don't collide on
  // the same supabase channel — supabase's client reuses a channel
  // by name, and calling .on() on an already-subscribed channel
  // throws "cannot add postgres_changes callbacks ... after
  // subscribe()".
  const instanceKey = useId();

  useEffect(() => {
    if (!userId) {
      setTier("free");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fromCache = tierCache.get(userId);
    if (fromCache !== undefined) {
      setTier(fromCache);
      setLoading(false);
    } else {
      setLoading(true);
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      const raw = (data as { subscription_tier?: string } | null)?.subscription_tier;
      const next: VendorTier =
        raw && VALID_TIERS.has(raw as VendorTier) ? (raw as VendorTier) : "free";
      tierCache.set(userId, next);
      setTier(next);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`profile-plan:${userId}:${instanceKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const next = (payload.new as { subscription_tier?: string } | null)
            ?.subscription_tier;
          const resolved: VendorTier =
            next && VALID_TIERS.has(next as VendorTier)
              ? (next as VendorTier)
              : "free";
          tierCache.set(userId, resolved);
          setTier(resolved);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, instanceKey]);

  return { tier, loading };
}
