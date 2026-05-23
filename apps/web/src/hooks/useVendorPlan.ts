import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Live-reads the vendor's current subscription tier from
// vendor_profiles. Subscribes to postgres_changes on the row so the
// label flips the moment the Stripe webhook writes a new tier back —
// no refetch-on-mount, no waiting for the user to navigate.
//
// Tier values mirror VendorSubscriptionPage's PlanState['tier']:
// free | starter | pro | studio. Anything else falls back to 'free'.

export type VendorTier = "free" | "starter" | "pro" | "studio";

const VALID_TIERS = new Set<VendorTier>(["free", "starter", "pro", "studio"]);

// Per-vendor tier cache. DashboardSidebar remounts on every route
// change in the vendor portal (each page mounts its own sidebar
// instance), so without this cache the plan badge under "Vendora"
// flickers from "Free plan" to the real tier on every navigation
// while the fetch is in flight.
const tierCache = new Map<string, VendorTier>();

export function useVendorPlan(vendorId: string | null | undefined): {
  tier: VendorTier;
  loading: boolean;
} {
  const cached = vendorId ? tierCache.get(vendorId) : undefined;
  const [tier, setTier] = useState<VendorTier>(cached ?? "free");
  const [loading, setLoading] = useState<boolean>(
    Boolean(vendorId) && cached === undefined,
  );
  // useId gives every mounting consumer a unique suffix so two pages
  // (sidebar + page) using the same vendorId don't collide on the
  // same supabase channel — supabase's client reuses a channel by
  // name, and calling .on() on an already-subscribed channel throws
  // "cannot add postgres_changes callbacks ... after subscribe()".
  const instanceKey = useId();

  useEffect(() => {
    if (!vendorId) {
      setTier("free");
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Paint with cache if we have it so the label doesn't blink
    // through "Free plan" on every remount; still kick off the
    // refetch in the background to catch any updates we missed.
    const fromCache = tierCache.get(vendorId);
    if (fromCache !== undefined) {
      setTier(fromCache);
      setLoading(false);
    } else {
      setLoading(true);
    }
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("subscription_tier")
        .eq("id", vendorId)
        .maybeSingle();
      if (cancelled) return;
      const raw = (data as { subscription_tier?: string } | null)?.subscription_tier;
      const next: VendorTier =
        raw && VALID_TIERS.has(raw as VendorTier) ? (raw as VendorTier) : "free";
      tierCache.set(vendorId, next);
      setTier(next);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`vendor-plan:${vendorId}:${instanceKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vendor_profiles",
          filter: `id=eq.${vendorId}`,
        },
        (payload) => {
          const next = (payload.new as { subscription_tier?: string } | null)
            ?.subscription_tier;
          const resolved: VendorTier =
            next && VALID_TIERS.has(next as VendorTier)
              ? (next as VendorTier)
              : "free";
          tierCache.set(vendorId, resolved);
          setTier(resolved);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [vendorId, instanceKey]);

  return { tier, loading };
}
