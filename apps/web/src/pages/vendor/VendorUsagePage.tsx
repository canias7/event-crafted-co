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

// Per-action credit cost — mirrors _shared/credits.ts::CREDIT_COST.
// Surfaced in the cost-reference card so vendors can see what each
// action will charge them before they trigger it.
const ACTION_COST: Record<string, number> = {
  hilux_reply: 2,
  hilux_regenerate: 2,
  hilux_draft: 2,
  hilux_followup: 2,
  hilux_summary: 3,
  axion_image: 10,
  mux_minute: 1,
  email_parse: 1,
};

// Distinct colors per action for the donut + segment bars. HILUX
// family stays in the orange palette so the brand-thread is obvious;
// Axion/Mux/Email get their own hues so they pop in the breakdown.
const ACTION_COLOR: Record<string, string> = {
  hilux_reply: "#ff8a4c",
  hilux_regenerate: "#e0732e",
  hilux_draft: "#ffa570",
  hilux_followup: "#c4541e",
  hilux_summary: "#f59e0b",
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

  // Daily spend buckets across the last 30 days.
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
  const activeDays = useMemo(
    () => dailyTotals.filter((d) => d.credits > 0).length,
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
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your credit balance, AI activity, and billing portal.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[1400px] space-y-5">
          {/* COMPACT HERO STRIP — one row: number + progress + button.
              No oversized vertical padding, no decorative glow eating
              space. Designed to take ~120px instead of the old 220px. */}
          <Card>
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div className="flex items-center gap-5 min-w-0">
                <div className="min-w-0">
                  <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI credits
                  </p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-4xl md:text-5xl font-semibold tracking-tight tnum leading-none">
                      {credits.initialized ? credits.balance.toLocaleString() : "—"}
                    </span>
                    {credits.monthlyGrant > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        of {credits.monthlyGrant.toLocaleString()} / mo
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {usagePct !== null ? (
                <div className="flex-1 min-w-0 max-w-md">
                  <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                    <span>{usedThisPeriod.toLocaleString()} used this period</span>
                    <span className="tnum">{usagePct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-foreground/8 overflow-hidden">
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
                </div>
              ) : (
                <p className="text-xs text-muted-foreground flex-1">
                  Credits never expire. Top up any time from Subscription.
                </p>
              )}

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
            </div>
          </Card>

          {/* CHARTS ROW — full-width 3-col grid on desktop:
              daily-spend (spans 2 cols) + donut breakdown (1 col). */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Daily spend bar chart — spans 2 cols on desktop */}
            <Card className="lg:col-span-2">
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
              <div className="flex items-end gap-[3px] h-44 mt-5">
                {dailyTotals.map((d) => {
                  const heightPct = maxDaily === 0 ? 0 : (d.credits / maxDaily) * 100;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 rounded-t-[2px] transition-colors hover:opacity-80"
                      title={`${new Date(d.date).toLocaleDateString(undefined, {
                        month: "short", day: "numeric",
                      })}: ${d.credits.toLocaleString()} cr`}
                      style={{
                        height: d.credits > 0 ? `${Math.max(heightPct, 4)}%` : "4px",
                        background: d.credits > 0
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
            </Card>

            {/* Donut breakdown — 1 col on desktop */}
            <Card>
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
              />
              <ul className="mt-5 space-y-2.5">
                {actionBreakdown.map((row) => {
                  const idle = row.credits === 0;
                  const pct = totalSpent30 === 0 ? 0 : (row.credits / totalSpent30) * 100;
                  return (
                    <li key={row.action} className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{
                          background: idle ? "rgba(20,15,10,0.12)" : colorFor(row.action),
                        }}
                      />
                      <span className={`text-xs flex-1 truncate ${idle ? "text-muted-foreground" : ""}`}>
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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
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

            {/* Recent activity — spans 3 cols on desktop */}
            <Card className="lg:col-span-3">
              <SectionHeader title="Recent activity" />
              {ledgerLoading ? (
                <p className="text-sm text-muted-foreground mt-4">Loading…</p>
              ) : ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">
                  No activity yet. Once you use HILUX or Axion, entries land here.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-foreground/8">
                  {ledger.map((row, i) => {
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
function Donut({ segments, centerTotal }: { segments: Segment[]; centerTotal: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  // r=70, circumference=2π·70≈439.82
  const C = 2 * Math.PI * 70;
  let offset = 0;
  return (
    <div className="relative mt-5 mx-auto" style={{ width: 180, height: 180 }}>
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        {/* Track ring (always visible so empty state still looks like a donut) */}
        <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(20,15,10,0.06)" strokeWidth="22" />
        {segments.map((seg) => {
          const segLen = total > 0 ? (seg.value / total) * C : 0;
          const dash = `${segLen} ${C - segLen}`;
          const dashOffset = -offset;
          offset += segLen;
          return (
            <circle
              key={seg.key}
              cx="100" cy="100" r="70"
              fill="none"
              stroke={seg.color}
              strokeWidth="22"
              strokeDasharray={dash}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-semibold tracking-tight tnum">{centerTotal.toLocaleString()}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">credits · 30d</span>
      </div>
    </div>
  );
}
