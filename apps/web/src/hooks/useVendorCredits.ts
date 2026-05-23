import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Subscribes to postgres_changes on vendor_credit_balances for the
// current user so the balance flips the moment a webhook (grant,
// top-up, consume) writes a new row. Used by surfaces like the
// sidebar that want a live number without polling.
export function useLiveVendorBalance(userId: string | null | undefined): {
  balance: number;
  initialized: boolean;
} {
  const [balance, setBalance] = useState<number>(0);
  const [initialized, setInitialized] = useState<boolean>(false);
  // Unique per-mount key so two consumers of the same userId don't
  // both try to subscribe to the same supabase channel (which would
  // throw "cannot add postgres_changes callbacks ... after subscribe").
  const instanceKey = useId();

  useEffect(() => {
    if (!userId) {
      setBalance(0);
      setInitialized(true);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_credit_balances")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setBalance(((data as { balance?: number } | null)?.balance) ?? 0);
      setInitialized(true);
    })();

    const channel = supabase
      .channel(`vendor-balance:${userId}:${instanceKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vendor_credit_balances",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = (payload.new as { balance?: number } | null)?.balance;
          if (typeof next === "number") setBalance(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, instanceKey]);

  return { balance, initialized };
}

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
