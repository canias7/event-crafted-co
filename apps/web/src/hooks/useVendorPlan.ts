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

export function useVendorPlan(vendorId: string | null | undefined): {
  tier: VendorTier;
  loading: boolean;
} {
  const [tier, setTier] = useState<VendorTier>("free");
  const [loading, setLoading] = useState<boolean>(Boolean(vendorId));
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
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("subscription_tier")
        .eq("id", vendorId)
        .maybeSingle();
      if (cancelled) return;
      const raw = (data as { subscription_tier?: string } | null)?.subscription_tier;
      setTier(raw && VALID_TIERS.has(raw as VendorTier) ? (raw as VendorTier) : "free");
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
          setTier(next && VALID_TIERS.has(next as VendorTier) ? (next as VendorTier) : "free");
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
