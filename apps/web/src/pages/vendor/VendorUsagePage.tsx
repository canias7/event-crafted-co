import { useCallback, useEffect, useMemo, useState } from "react";
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
const ACTION_LABEL: Record<string, string> = {
  hilux_reply: "HILUX reply",
  hilux_regenerate: "HILUX regenerate",
  hilux_draft: "HILUX draft reply",
  hilux_followup: "HILUX follow-up",
  axion_image: "Axion image",
  mux_minute: "Mux minute",
  email_parse: "Email parse",
};

// Per-action credit cost — mirrors _shared/credits.ts::CREDIT_COST.
const ACTION_COST: Record<string, number> = {
  hilux_reply: 2,
  hilux_regenerate: 2,
  hilux_draft: 2,
  hilux_followup: 2,
  axion_image: 10,
  mux_minute: 1,
  email_parse: 1,
};

// Distinct colors per action for the donut + segment bars.
const ACTION_COLOR: Record<string, string> = {
  hilux_reply: "#ff8a4c",
  hilux_regenerate: "#e0732e",
  hilux_draft: "#ffa570",
  hilux_followup: "#c4541e",
  axion_image: "#9333ea",
  mux_minute: "#06b6d4",
  email_parse: "#10b981",
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

function colorFor(action: string): string {
  return ACTION_COLOR[action] ?? "#94a3b8";
}

export default function VendorUsagePage() {
  const { ownListing, user } = useAuth();
  const vendorId = ownListing?.id ?? null;
  const credits = useVendorCredits(user?.id ?? null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [consume30, setConsume30] = useState<
    Array<{ created_at: string; delta: number; action_type: string | null }>
  >([]);
  const [actingId, setActingId] = useState<string | null>(null);
  // Hover targets for the chart previews. Indices into dailyTotals
  // for the bar chart; action key for the donut.
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  // Recent activity defaults to a 10-row preview. Show more flips
  // to a max-h scrollable container so the page itself stays put.
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Fetcher pulled out of the mount effect so the realtime subscription
  // below can call it on every insert without duplicating the queries.
  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
    setLedger((recent as LedgerRow[] | null) ?? []);
    setConsume30(
      (spend as Array<{ created_at: string; delta: number; action_type: string | null }> | null) ?? [],
    );
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLedger([]);
      setConsume30([]);
      setLedgerLoading(false);
      return;
    }
    let cancelled = false;
    setLedgerLoading(true);
    fetchAll().finally(() => {
      if (!cancelled) setLedgerLoading(false);
    });

    // Realtime: every new credit transaction (consume / grant / topup
    // / refund) triggers a refetch so the balance card + daily-spend
    // bars + donut + recent activity all reflect the new state without
    // a manual page refresh. Also refreshes the credit hook so the
    // header counter ticks live.
    const channel = supabase
      .channel(`vendor-credit-ledger:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendor_credit_transactions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchAll();
          void credits.refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchAll]);

  // Daily spend buckets across the last 30 days. Keys are UTC dates
  // (yyyy-mm-dd) matching how consume30.created_at slices, so a
  // consume row from late-night local time never gets dropped because
  // its UTC date falls on the next day relative to the local-midnight
  // bucket map. That mismatch was the cause of the donut showing
  // >100% (totalSpent30 missed rows that actionBreakdown counted).
  const dailyTotals = useMemo(() => {
    const buckets = new Map<string, number>();
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(todayUtc);
      d.setUTCDate(todayUtc.getUTCDate() - i);
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

  // Sum directly from consume30 (not dailyTotals) so a future
  // bucket-misalignment can never make this drift from the action
  // breakdown — keeps the donut percentages bounded at 100%.
  const totalSpent30 = useMemo(
    () => consume30.reduce((s, r) => s + Math.abs(r.delta), 0),
    [consume30],
  );
  const maxDaily = useMemo(
    () => dailyTotals.reduce((m, d) => Math.max(m, d.credits), 0),
    [dailyTotals],
  );
  const activeDays = useMemo(
    () => dailyTotals.filter((d) => d.credits > 0).length,
    [dailyTotals],
  );

  // Audit #4: "monthlyGrant − balance" clamps to 0 once a vendor
  // carries credits across renewals or buys a top-up (balance >
  // grant). Compute period usage from actual consume rows since
  // periodStartedAt instead.
  const usedThisPeriod = useMemo(() => {
    if (!credits.periodStartedAt) return 0;
    const since = credits.periodStartedAt;
    return consume30
      .filter((r) => r.created_at >= since)
      .reduce((s, r) => s + Math.abs(r.delta), 0);
  }, [consume30, credits.periodStartedAt]);
  const usagePct = useMemo(() => {
    return credits.monthlyGrant > 0
      ? Math.min(100, Math.round((usedThisPeriod / credits.monthlyGrant) * 100))
      : null;
  }, [credits.monthlyGrant, usedThisPeriod]);

  async function openPortal() {
    // Audit #5: portal works without a listing too (vendor_id optional).
    // Audit #11: don't open the popup BEFORE the async call — Safari's
    // popup blocker only allows window.open synchronously from a click
    // handler, not after an await. Use a regular navigation instead.
    if (!user || actingId) return;
    setActingId("portal");
    const { data, error } = await supabase.functions.invoke("stripe-customer-portal", {
      body: { vendor_id: vendorId ?? null },
    });
    if (error || !data?.url) {
      toast.error("Couldn't open billing portal", {
        description: error?.message ?? "Please try again in a moment.",
      });
      setActingId(null);
      return;
    }
    window.location.href = data.url as string;
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
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your credit balance, AI activity, and billing portal.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[1400px] space-y-5">
          {/* Hero strip + daily-spend chart sit side-by-side: the
              credits chip on the left (w-fit), the bar chart fills
              the rest of the row. */}
          <div className="flex flex-col lg:flex-row gap-5 items-start">
          <Card className="w-fit max-w-full !p-3 md:!px-5 md:!py-3 shrink-0">
            <div className="flex items-center gap-3">
              <p className="font-label text-muted-foreground shrink-0 hidden sm:inline">
                Credits
              </p>
              <span className="text-xl md:text-2xl font-semibold tracking-tight tnum leading-none mr-4">
                {credits.initialized ? credits.balance.toLocaleString() : "—"}
              </span>

              {/* Audit #6: only show Manage billing when the vendor
                  has a Stripe customer to manage. Free/never-topped-
                  up vendors hitting the portal got a raw 400 toast. */}
              {credits.monthlyGrant > 0 || credits.lifetimeToppedUp > 0 ? (
                <Button
                  onClick={openPortal}
                  disabled={!vendorId || actingId !== null}
                  variant="outline"
                  size="sm"
                  className="rounded-full shrink-0"
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
              ) : null}
            </div>
          </Card>

          {/* Daily spend bar chart — sits to the right of the hero. */}
            <Card className="flex-1 min-w-0">
              <SectionHeader
                title="Credits used per day"
                rightSlot={
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span><span className="text-foreground font-semibold tnum">{totalSpent30.toLocaleString()}</span> cr · last 30d</span>
                    {activeDays > 0 ? (
                      <span><span className="text-foreground font-semibold tnum">{activeDays}</span> active days</span>
                    ) : null}
                  </div>
                }
              />
              <div className="relative h-44 mt-5">
                <div className="flex items-end gap-[3px] h-full">
                  {dailyTotals.map((d, idx) => {
                    const heightPct = maxDaily === 0 ? 0 : (d.credits / maxDaily) * 100;
                    const active = hoveredBarIdx === idx;
                    return (
                      <div
                        key={d.date}
                        onMouseEnter={() => setHoveredBarIdx(idx)}
                        onMouseLeave={() => setHoveredBarIdx((prev) => (prev === idx ? null : prev))}
                        className="flex-1 rounded-t-[2px] cursor-default transition-all"
                        style={{
                          height: d.credits > 0 ? `${Math.max(heightPct, 4)}%` : "4px",
                          background: d.credits > 0
                            ? "linear-gradient(180deg, #ff8a4c 0%, #c4541e 100%)"
                            : "rgba(20,15,10,0.08)",
                          opacity: hoveredBarIdx === null || active ? 1 : 0.55,
                        }}
                      />
                    );
                  })}
                </div>
                {hoveredBarIdx !== null && dailyTotals[hoveredBarIdx] ? (
                  <div
                    className="pointer-events-none absolute -top-2 -translate-y-full rounded-lg bg-foreground text-background px-2.5 py-1.5 text-[11px] shadow-lg whitespace-nowrap z-10"
                    style={{
                      left: `${(hoveredBarIdx / 29) * 100}%`,
                      transform: `translate(${hoveredBarIdx <= 2 ? "0" : hoveredBarIdx >= 27 ? "-100%" : "-50%"}, -100%)`,
                    }}
                  >
                    <div className="font-medium">
                      {new Date(dailyTotals[hoveredBarIdx].date + "T00:00:00Z").toLocaleDateString(undefined, {
                        weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
                      })}
                    </div>
                    <div className="tnum opacity-80">
                      {dailyTotals[hoveredBarIdx].credits === 0
                        ? "no spend"
                        : `${dailyTotals[hoveredBarIdx].credits.toLocaleString()} credit${dailyTotals[hoveredBarIdx].credits === 1 ? "" : "s"}`}
                    </div>
                  </div>
                ) : null}
              </div>
              {/* Date markers — 5 evenly-spaced labels along the
                  30-day x-axis. Anchors the bars to actual calendar
                  days so vendors can see "spike on May 22" not just
                  "spike somewhere late". */}
              <div className="relative h-4 mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {[0, 7, 14, 21, 29].map((idx) => {
                  const row = dailyTotals[idx];
                  if (!row) return null;
                  const d = new Date(row.date + "T00:00:00Z");
                  const label = d.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  });
                  const leftPct = (idx / 29) * 100;
                  return (
                    <span
                      key={row.date}
                      className="absolute tnum"
                      style={{
                        left: `${leftPct}%`,
                        transform:
                          idx === 0
                            ? "translateX(0)"
                            : idx === 29
                              ? "translateX(-100%)"
                              : "translateX(-50%)",
                      }}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
              {/* hidden anchors so layout doesn't collapse if dailyTotals empty */}
              <div className="hidden">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </Card>
          </div>

          {/* Donut breakdown row on its own. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <Card className="lg:col-span-1">
              <SectionHeader title="Where credits went" />
              <Donut
                segments={actionBreakdown
                  .filter((r) => r.credits > 0)
                  .map((r) => ({
                    key: r.action,
                    value: r.credits,
                    color: colorFor(r.action),
                    label: formatActionType(r.action) ?? r.action,
                  }))}
                centerTotal={totalSpent30}
                hoveredKey={hoveredAction}
                hoveredLabel={hoveredAction ? formatActionType(hoveredAction) ?? hoveredAction : null}
                hoveredValue={hoveredAction ? (actionBreakdown.find((r) => r.action === hoveredAction)?.credits ?? 0) : null}
                onHover={setHoveredAction}
              />
              <ul
                className="mt-5 space-y-2.5"
                onMouseLeave={() => setHoveredAction(null)}
              >
                {actionBreakdown.map((row) => {
                  const idle = row.credits === 0;
                  const pct = totalSpent30 === 0 ? 0 : (row.credits / totalSpent30) * 100;
                  const active = hoveredAction === row.action;
                  return (
                    <li
                      key={row.action}
                      onMouseEnter={() => !idle && setHoveredAction(row.action)}
                      className={`flex items-center gap-2.5 rounded px-1.5 -mx-1.5 py-1 transition-colors ${
                        active ? "bg-foreground/5" : ""
                      } ${!idle ? "cursor-default" : ""}`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0 transition-transform"
                        style={{
                          background: idle ? "rgba(20,15,10,0.12)" : colorFor(row.action),
                          transform: active ? "scale(1.25)" : undefined,
                        }}
                      />
                      <span className={`text-xs flex-1 truncate ${idle ? "text-muted-foreground" : active ? "font-medium" : ""}`}>
                        {formatActionType(row.action) ?? row.action}
                      </span>
                      <span className="text-xs text-muted-foreground tnum shrink-0">
                        {idle ? "—" : `${row.credits} cr · ${pct.toFixed(0)}%`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          {/* COST REFERENCE + RECENT ACTIVITY — full-width 2-col */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
            {/* Cost reference — what each action costs in credits.
                Reads from ACTION_COST (in sync with credits.ts on
                the server). Lets vendors see the price tag before
                they pull the trigger. */}
            <Card className="lg:col-span-2">
              <SectionHeader
                title="Cost per action"
                rightSlot={<span className="text-xs text-muted-foreground">Credits charged per call</span>}
              />
              <ul className="mt-4 space-y-2.5">
                {Object.keys(ACTION_LABEL).map((action) => {
                  const cost = ACTION_COST[action] ?? 0;
                  return (
                    <li key={action} className="flex items-center justify-between gap-3 py-1.5 border-b border-foreground/5 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorFor(action) }} />
                        <span className="text-sm truncate">{formatActionType(action)}</span>
                      </div>
                      <span className="text-xs tnum text-muted-foreground">
                        <span className="text-foreground font-semibold">{cost}</span> cr
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* Recent activity — spans 3 cols on desktop. Shows the
                first 10 by default; "Show more" expands the box into
                a scrollable container so the rest of the page stays
                put. */}
            <Card className="lg:col-span-3">
              <SectionHeader
                title="Recent activity"
                rightSlot={ledger.length > 10 ? (
                  <button
                    type="button"
                    onClick={() => setActivityExpanded((v) => !v)}
                    className="text-xs text-foreground/70 hover:text-foreground font-medium"
                  >
                    {activityExpanded ? "Show less" : `Show all (${ledger.length})`}
                  </button>
                ) : undefined}
              />
              {ledgerLoading ? (
                <p className="text-sm text-muted-foreground mt-4">Loading…</p>
              ) : ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">
                  No activity yet. Once you use HILUX or Axion, entries land here.
                </p>
              ) : (
                <ul
                  className={`mt-3 divide-y divide-foreground/8 ${
                    activityExpanded ? "max-h-[480px] overflow-y-auto pr-1 -mr-1" : ""
                  }`}
                >
                  {(activityExpanded ? ledger : ledger.slice(0, 10)).map((row, i) => {
                    const positive = row.delta >= 0;
                    const swatch = row.action_type ? colorFor(row.action_type) : "#cbd5e1";
                    return (
                      <li
                        key={`${row.created_at}-${i}`}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: positive ? "#10b981" : swatch }} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {row.kind === "consume" && row.action_type
                                ? formatActionType(row.action_type)
                                : KIND_LABEL[row.kind] ?? row.kind}
                              {row.kind !== "consume" && row.action_type
                                ? ` · ${formatActionType(row.action_type)}`
                                : ""}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(row.created_at).toLocaleString(undefined, {
                                dateStyle: "medium", timeStyle: "short",
                              })}
                              {row.note ? ` — ${row.note}` : ""}
                            </p>
                          </div>
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
            </Card>
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

// ───────── small presentational helpers ─────────

function Card({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 md:p-6 ${className}`}
      style={{
        background: "rgba(255,253,250,0.72)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 6px 24px -12px rgba(20,15,10,0.08)",
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  title, rightSlot,
}: { title: string; rightSlot?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {rightSlot}
    </div>
  );
}

interface Segment { key: string; value: number; color: string; label: string }
function Donut({
  segments, centerTotal,
  hoveredKey, hoveredLabel, hoveredValue, onHover,
}: {
  segments: Segment[]; centerTotal: number;
  hoveredKey?: string | null;
  hoveredLabel?: string | null;
  hoveredValue?: number | null;
  onHover?: (key: string | null) => void;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const C = 2 * Math.PI * 70;
  let offset = 0;
  const hoveredSeg = hoveredKey ? segments.find((s) => s.key === hoveredKey) : null;
  const hoveredPct = hoveredSeg && total > 0 ? (hoveredSeg.value / total) * 100 : null;
  return (
    <div className="relative mt-5 mx-auto" style={{ width: 180, height: 180 }}>
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(20,15,10,0.06)" strokeWidth="22" />
        {segments.map((seg) => {
          const segLen = total > 0 ? (seg.value / total) * C : 0;
          const dash = `${segLen} ${C - segLen}`;
          const dashOffset = -offset;
          offset += segLen;
          const dimmed = hoveredKey != null && hoveredKey !== seg.key;
          return (
            <circle
              key={seg.key}
              cx="100" cy="100" r="70"
              fill="none"
              stroke={seg.color}
              strokeWidth={hoveredKey === seg.key ? 26 : 22}
              strokeDasharray={dash}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              opacity={dimmed ? 0.35 : 1}
              onMouseEnter={() => onHover?.(seg.key)}
              onMouseLeave={() => onHover?.(null)}
              style={{ cursor: onHover ? "pointer" : "default", transition: "stroke-width 120ms, opacity 120ms" }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
        {hoveredSeg ? (
          <>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate max-w-full">
              {hoveredLabel ?? hoveredSeg.key}
            </span>
            <span className="text-xl font-semibold tracking-tight tnum mt-0.5">
              {(hoveredValue ?? hoveredSeg.value).toLocaleString()}
            </span>
            <span className="text-[10px] tnum text-muted-foreground">
              {hoveredPct != null ? `${hoveredPct.toFixed(1)}%` : ""}
            </span>
          </>
        ) : (
          <>
            <span className="text-2xl font-semibold tracking-tight tnum">{centerTotal.toLocaleString()}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">credits · 30d</span>
          </>
        )}
      </div>
    </div>
  );
}
