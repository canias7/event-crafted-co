import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVendorCredits } from "@/hooks/useVendorCredits";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Usage hub for the vendor: live credit balance, period usage bar,
// per-action cost reference, recent ledger, and the Stripe customer
// portal entry point. Lifted out of VendorSubscriptionPage so the
// subscription page can focus on tier selection and top-up packs.

interface LedgerRow {
  created_at: string;
  delta: number;
  kind: string;
  action_type: string | null;
  balance_after: number;
  note: string | null;
}

const KIND_LABEL: Record<string, string> = {
  trial_grant: "Signup trial",
  monthly_grant: "Monthly grant",
  topup: "Top-up",
  consume: "AI action",
  refund: "Refund",
  admin_grant: "Admin grant",
  admin_revoke: "Admin clawback",
  rollover: "Rollover",
};

// Snake-case action_types come from the edge functions verbatim
// (see _shared/credits.ts::CreditAction — the source of truth for
// what gets written to vendor_credit_transactions.action_type).
// Map known ones to friendly names; fall back to Title Case for
// anything new so the page never shows raw snake_case.
const ACTION_LABEL: Record<string, string> = {
  hilux_reply: "HILUX reply",
  hilux_regenerate: "HILUX regenerate",
  hilux_draft: "HILUX draft reply",
  hilux_followup: "HILUX follow-up",
  hilux_summary: "HILUX summary",
  axion_image: "Axion image",
  mux_minute: "Mux minute",
  email_parse: "Email parse",
};

function formatActionType(action: string | null): string | null {
  if (!action) return null;
  return (
    ACTION_LABEL[action] ??
    action
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}

export default function VendorUsagePage() {
  const { ownListing, user } = useAuth();
  const vendorId = ownListing?.id ?? null;
  const credits = useVendorCredits(user?.id ?? null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  // Consume entries from the last 30 days power the usage charts —
  // pulled separately from the ledger (which is just the most recent
  // 25 rows for display) so we get every spend event in the window.
  const [consume30, setConsume30] = useState<
    Array<{ created_at: string; delta: number; action_type: string | null }>
  >([]);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLedger([]);
      setConsume30([]);
      setLedgerLoading(false);
      return;
    }
    let cancelled = false;
    setLedgerLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    (async () => {
      const [{ data: recent }, { data: spend }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_credit_transactions")
          .select("created_at, delta, kind, action_type, balance_after, note")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(25),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_credit_transactions")
          .select("created_at, delta, action_type")
          .eq("user_id", user.id)
          .eq("kind", "consume")
          .gte("created_at", since)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setLedger((recent as LedgerRow[] | null) ?? []);
      setConsume30(
        (spend as Array<{ created_at: string; delta: number; action_type: string | null }> | null) ??
          [],
      );
      setLedgerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Daily spend buckets across the last 30 days. delta on consume
  // rows is negative; we render the absolute value as "credits used".
  const dailyTotals = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const row of consume30) {
      const key = row.created_at.slice(0, 10);
      if (!buckets.has(key)) continue;
      buckets.set(key, (buckets.get(key) ?? 0) + Math.abs(row.delta));
    }
    return Array.from(buckets.entries()).map(([date, credits]) => ({ date, credits }));
  }, [consume30]);

  // Per-action breakdown — totals by action_type, plus event count.
  // Seeded with every known action_type at zero so the card always
  // surfaces the full list of AI agents (HILUX, Axion, MCP, Mux),
  // even on fresh accounts. Unknown action_types from the DB get
  // appended on top, and the whole list sorts by spend desc with
  // 0-spend rows alphabetically at the bottom.
  const actionBreakdown = useMemo(() => {
    const agg = new Map<string, { credits: number; count: number }>();
    for (const known of Object.keys(ACTION_LABEL)) {
      agg.set(known, { credits: 0, count: 0 });
    }
    for (const row of consume30) {
      const key = row.action_type ?? "other";
      const cur = agg.get(key) ?? { credits: 0, count: 0 };
      cur.credits += Math.abs(row.delta);
      cur.count += 1;
      agg.set(key, cur);
    }
    return Array.from(agg.entries())
      .map(([action, v]) => ({ action, ...v }))
      .sort((a, b) => {
        if (b.credits !== a.credits) return b.credits - a.credits;
        return (
          (ACTION_LABEL[a.action] ?? a.action).localeCompare(
            ACTION_LABEL[b.action] ?? b.action,
          )
        );
      });
  }, [consume30]);

  const totalSpent30 = useMemo(
    () => dailyTotals.reduce((s, d) => s + d.credits, 0),
    [dailyTotals],
  );
  const maxDaily = useMemo(
    () => dailyTotals.reduce((m, d) => Math.max(m, d.credits), 0),
    [dailyTotals],
  );

  const usedThisPeriod = Math.max(0, credits.monthlyGrant - credits.balance);
  const usagePct = useMemo(() => {
    return credits.monthlyGrant > 0
      ? Math.min(100, Math.round((usedThisPeriod / credits.monthlyGrant) * 100))
      : null;
  }, [credits.monthlyGrant, usedThisPeriod]);

  async function openPortal() {
    if (!vendorId || actingId) return;
    setActingId("portal");
    const popup = window.open("about:blank", "_blank");
    const { data, error } = await supabase.functions.invoke("stripe-customer-portal", {
      body: { vendor_id: vendorId },
    });
    if (error || !data?.url) {
      if (popup && !popup.closed) popup.close();
      toast.error("Couldn't open billing portal", {
        description: error?.message ?? "Please try again in a moment.",
      });
      setActingId(null);
      return;
    }
    if (popup) popup.location.href = data.url as string;
    else window.location.href = data.url as string;
    setActingId(null);
  }

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div
          className="px-4 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(255,138,76,0.18)" }}
        >
          <h1 className="font-editorial text-3xl md:text-4xl">Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your credit balance, AI activity, and billing portal.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-5">
          {/* AI credits — hero card. Big number on the left, soft
              orange radial glow behind it; Manage-billing pill on the
              right. Progress bar (only when on a monthly allotment)
              tucked under the headline. */}
          <div
            className="relative overflow-hidden rounded-2xl p-7 md:p-8"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,253,250,0.82) 0%, rgba(255,245,234,0.62) 100%)",
              border: "0.5px solid rgba(255,138,76,0.22)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 10px 36px -18px rgba(255,138,76,0.22)",
            }}
          >
            <div
              aria-hidden
              className="absolute -top-24 -left-24 w-72 h-72 rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,138,76,0.16) 0%, transparent 70%)",
              }}
            />
            <div className="relative flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI credits
                </p>
                <h2 className="font-editorial text-6xl md:text-7xl mt-2 tnum leading-none">
                  {credits.initialized ? credits.balance.toLocaleString() : "—"}
                </h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  {credits.monthlyGrant > 0
                    ? `${usedThisPeriod.toLocaleString()} used of ${credits.monthlyGrant.toLocaleString()} included this period.`
                    : "Credits never expire. Top up any time from Subscription."}
                </p>
              </div>
              <Button
                onClick={openPortal}
                disabled={!vendorId || actingId !== null}
                variant="outline"
                className="rounded-full"
                style={{
                  background: "rgba(255,255,255,0.6)",
                  borderColor: "rgba(255,138,76,0.3)",
                }}
              >
                {actingId === "portal" ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                )}
                Manage billing
              </Button>
            </div>

            {usagePct !== null && (
              <div className="relative mt-6">
                <div className="h-2 rounded-full bg-foreground/8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${usagePct}%`,
                      background:
                        usagePct >= 90
                          ? "#dc2626"
                          : usagePct >= 70
                            ? "#f59e0b"
                            : "linear-gradient(90deg, #ff8a4c, #c4541e)",
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {usagePct}% of your monthly allotment used.
                </p>
              </div>
            )}
          </div>

          {/* Usage charts — last 30 days. Two cards side by side
              on desktop: daily-spend bar chart + per-action breakdown.
              Both gracefully degrade to empty states when no consume
              entries exist yet. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Daily spend bar chart */}
            <div
              className="relative overflow-hidden rounded-2xl p-6 md:p-7"
              style={{
                background: "rgba(255,253,250,0.72)",
                border: "0.5px solid rgba(255,138,76,0.22)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "0 6px 24px -12px rgba(20,15,10,0.08)",
              }}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-editorial text-xl">Credits used per day</h3>
                <span className="text-xs text-muted-foreground tnum">
                  {totalSpent30.toLocaleString()} in the last 30 days
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 mb-5">
                Every HILUX reply, Axion image, and MCP call you've billed.
              </p>
              {/* Always render the 30 bars — when there's no spend
                  yet they show as hairline tracks so vendors see the
                  chart structure waiting for their data. */}
              <div className="flex items-end gap-[3px] h-32">
                {dailyTotals.map((d) => {
                  const heightPct =
                    maxDaily === 0 ? 0 : (d.credits / maxDaily) * 100;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 rounded-t-[2px] transition-colors hover:opacity-80"
                      title={`${new Date(d.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}: ${d.credits.toLocaleString()} cr`}
                      style={{
                        height:
                          d.credits > 0
                            ? `${Math.max(heightPct, 4)}%`
                            : "4px",
                        background:
                          d.credits > 0
                            ? "linear-gradient(180deg, #ff8a4c 0%, #c4541e 100%)"
                            : "rgba(20,15,10,0.08)",
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </div>

            {/* Per-action breakdown */}
            <div
              className="relative overflow-hidden rounded-2xl p-6 md:p-7"
              style={{
                background: "rgba(255,253,250,0.72)",
                border: "0.5px solid rgba(255,138,76,0.22)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "0 6px 24px -12px rgba(20,15,10,0.08)",
              }}
            >
              <h3 className="font-editorial text-xl">Where credits went</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-5">
                Breakdown by AI action across the last 30 days.
              </p>
              <ul className="space-y-3">
                {actionBreakdown.map((row) => {
                  const pct =
                    totalSpent30 === 0
                      ? 0
                      : (row.credits / totalSpent30) * 100;
                  const idle = row.credits === 0;
                  return (
                    <li key={row.action}>
                      <div className="flex justify-between items-baseline">
                        <span
                          className={`text-sm ${idle ? "text-muted-foreground" : "font-medium"}`}
                        >
                          {formatActionType(row.action) ?? row.action}
                        </span>
                        <span className="text-xs text-muted-foreground tnum">
                          {idle
                            ? "—"
                            : `${row.credits.toLocaleString()} cr · ${row.count} ${row.count === 1 ? "use" : "uses"}`}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full mt-1.5 bg-foreground/8 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background:
                              "linear-gradient(90deg, #ff8a4c, #c4541e)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Recent activity */}
          <div
            className="relative overflow-hidden rounded-2xl p-6 md:p-7"
            style={{
              background: "rgba(255,253,250,0.72)",
              border: "0.5px solid rgba(255,138,76,0.22)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 6px 24px -12px rgba(20,15,10,0.08)",
            }}
          >
            <h3 className="font-editorial text-2xl mb-1">Recent activity</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Every credit grant, top-up, and AI action — newest first.
            </p>
            {ledgerLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity yet. Once you use HILUX or Axion, entries land here.
              </p>
            ) : (
              <ul className="divide-y divide-foreground/8">
                {ledger.map((row, i) => {
                  const positive = row.delta >= 0;
                  return (
                    <li
                      key={`${row.created_at}-${i}`}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {/* For consume rows, lead with the friendly
                              action name (HILUX reply, Axion image, …)
                              since that's what the vendor cares about.
                              Grants/top-ups lead with their kind label. */}
                          {row.kind === "consume" && row.action_type
                            ? formatActionType(row.action_type)
                            : KIND_LABEL[row.kind] ?? row.kind}
                          {row.kind !== "consume" && row.action_type
                            ? ` · ${formatActionType(row.action_type)}`
                            : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(row.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                          {row.note ? ` — ${row.note}` : ""}
                        </p>
                      </div>
                      <div
                        className={`text-sm font-semibold tnum shrink-0 ${
                          positive ? "text-emerald-600" : "text-foreground"
                        }`}
                      >
                        {positive ? "+" : ""}
                        {row.delta.toLocaleString()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

