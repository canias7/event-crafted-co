import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Whether the signed-in vendor has the Pro features (Verification,
// Vendora CRM): Pro or Premium ("studio"), or an account given unlimited
// listings. Same rule as the database's is_pro_user(). The menus hide
// Pro-only rows for everyone else (owner's call, Oct 2026). Cached per
// user so the menus don't flicker on every page change.
const cache = new Map<string, boolean>();

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") cache.clear();
});

export function useIsProVendor(userId: string | null | undefined): boolean {
  const [isPro, setIsPro] = useState<boolean>(() => (userId ? cache.get(userId) ?? false : false));

  useEffect(() => {
    if (!userId) {
      setIsPro(false);
      return;
    }
    let alive = true;
    setIsPro(cache.get(userId) ?? false);
    void supabase
      .from("profiles")
      .select("subscription_tier, unlimited_listings")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const p = data as { subscription_tier?: string; unlimited_listings?: boolean } | null;
        const next = p?.subscription_tier === "pro" || p?.subscription_tier === "studio" || !!p?.unlimited_listings;
        cache.set(userId, next);
        setIsPro(next);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return isPro;
}
