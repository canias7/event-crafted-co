import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Reads the current vendor's AI credit balance from
// vendor_credit_balances. Balance is per-user (not per-listing) —
// a vendor with multiple listings shares one credit bucket.
//
// Refetch on demand via the returned `refresh()` callback. Pages
// that just triggered an AI action (or returned from a Stripe
// top-up redirect) should call refresh to pull the new balance.

export interface VendorCreditState {
  balance: number;
  monthlyGrant: number;
  periodStartedAt: string | null;
  periodEndsAt: string | null;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  lifetimeToppedUp: number;
  loading: boolean;
  // True until the first fetch completes. Used by the UI to avoid
  // flashing "0 credits" on page load.
  initialized: boolean;
}

export function useVendorCredits(userId: string | null | undefined): VendorCreditState & {
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<VendorCreditState>({
    balance: 0,
    monthlyGrant: 0,
    periodStartedAt: null,
    periodEndsAt: null,
    lifetimeGranted: 0,
    lifetimeConsumed: 0,
    lifetimeToppedUp: 0,
    loading: false,
    initialized: false,
  });

  const refresh = useCallback(async () => {
    if (!userId) {
      setState((s) => ({ ...s, initialized: true, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_credit_balances")
      .select(
        "balance, monthly_grant, period_started_at, period_ends_at, lifetime_granted, lifetime_consumed, lifetime_topped_up",
      )
      .eq("user_id", userId)
      .maybeSingle();
    setState({
      balance: data?.balance ?? 0,
      monthlyGrant: data?.monthly_grant ?? 0,
      periodStartedAt: data?.period_started_at ?? null,
      periodEndsAt: data?.period_ends_at ?? null,
      lifetimeGranted: data?.lifetime_granted ?? 0,
      lifetimeConsumed: data?.lifetime_consumed ?? 0,
      lifetimeToppedUp: data?.lifetime_topped_up ?? 0,
      loading: false,
      initialized: true,
    });
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
