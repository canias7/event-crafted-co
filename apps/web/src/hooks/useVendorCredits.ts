import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Subscribes to postgres_changes on vendor_credit_balances for the
// current user so the balance flips the moment a webhook (grant,
// top-up, consume) writes a new row. Used by surfaces like the
// sidebar that want a live number without polling.
// Module-scope cache keyed by user_id. Each page in the vendor portal
// mounts its own DashboardSidebar, which means the hook remounts on
// every route change — without this cache, the sidebar's balance chip
// flickers from "hidden → visible" on every nav while the next fetch
// resolves. Cache survives within the SPA session; full refresh
// reloads from supabase as normal.
//
// Cleared on auth SIGNED_OUT (audit #16) so a re-login of a different
// account doesn't briefly paint with the previous user's balance.
const balanceCache = new Map<string, number>();

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") balanceCache.clear();
});

export function useLiveVendorBalance(userId: string | null | undefined): {
  balance: number;
  initialized: boolean;
} {
  const cached = userId ? balanceCache.get(userId) : undefined;
  const [balance, setBalance] = useState<number>(cached ?? 0);
  // If we have a cached value, treat the hook as initialized
  // immediately so the consumer (sidebar chip) doesn't blink off
  // while the fresh fetch is in flight.
  const [initialized, setInitialized] = useState<boolean>(cached !== undefined);
  const instanceKey = useId();

  useEffect(() => {
    if (!userId) {
      setBalance(0);
      setInitialized(true);
      return;
    }
    // If we had a cached value, paint with it immediately so there's
    // no flicker; otherwise the consumer keeps initialized=false until
    // the first fetch lands.
    const fromCache = balanceCache.get(userId);
    if (fromCache !== undefined) {
      setBalance(fromCache);
      setInitialized(true);
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
      const next = ((data as { balance?: number } | null)?.balance) ?? 0;
      balanceCache.set(userId, next);
      setBalance(next);
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
          if (typeof next === "number") {
            balanceCache.set(userId, next);
            setBalance(next);
          }
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
