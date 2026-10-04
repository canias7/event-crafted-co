// The vendor Overview: VendoraPay balance plus account-wide business
// cards (activity, upcoming appointments, recent paid work). Rendered
// embedded inside My Vendora (/vendor/overview). The old Workspace tabs
// (payments, invoices, pay links, files, contacts) were removed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";
import { type ListingOpt } from "@/components/vendor/ListingPicker";
import { useRealtime } from "@/lib/realtime";

interface Balance {
  available_cents: number;
  pending_cents: number;
  currency: string;
  onboarded: boolean;
}

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function VendorPaymentsPage(
  { embedded = false }: { embedded?: boolean } = {},
) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Account-wide vendor_profile ids. The Overview's Supabase-backed cards
  // query .in("vendor_id", accountVendorIds) so they read as one business
  // view across all of the user's listings; the Stripe balance stays
  // scoped to the first approved listing (each has its own connected
  // account). Memoized so its reference is stable across re-renders.
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );
  const vendorId = selectedListingId;
  const accountVendorIds = useMemo(
    () => listings.map((l) => l.id),
    [listings],
  );

  // The Workspace screen (payments, files, contacts) was removed; the
  // Overview's calendar card links to the Calendar page instead.
  const goToCalendar = () => navigate("/vendor/appointments");

  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);

  // Guards against setState after unmount: refresh() can still be in
  // flight when the user navigates away or a realtime event fires.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!vendorId || accountVendorIds.length === 0) {
      // No listing yet — flip loading off so the empty state shows
      // instead of an infinite spinner.
      setLoading(false);
      return;
    }
    try {
      const balanceRes = await supabase.functions.invoke("vendorapay-balance", {
        body: { business_id: vendorId },
      });
      if (!mountedRef.current) return;
      if (balanceRes.data) setBalance(balanceRes.data as Balance);
    } catch (err) {
      console.error("[vendor-overview] refresh failed", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, accountVendorIds.join(",")]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: when a Stripe webhook flips an invoice to paid (or a link is
  // refunded) on any of the account's listings, refresh the balance.
  const accountIdSet = useMemo(
    () => new Set(accountVendorIds),
    [accountVendorIds],
  );
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    // Coalesce bursts of webhook-driven row changes into one refresh.
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => void refresh(), 600);
  }, [refresh]);
  const onBillingRowChange = useCallback(
    (payload: { new: unknown; old: unknown }) => {
      const row = (payload.new ?? payload.old) as { vendor_id?: string } | null;
      if (row?.vendor_id && accountIdSet.has(row.vendor_id)) debouncedRefresh();
    },
    [accountIdSet, debouncedRefresh],
  );
  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    [],
  );
  useRealtime(
    accountVendorIds.length > 0 ? { table: "invoices" } : null,
    onBillingRowChange,
  );
  useRealtime(
    accountVendorIds.length > 0
      ? { table: "payment_links", event: "UPDATE" }
      : null,
    onBillingRowChange,
  );

  // Fetch the vendor's listings; auto-select the first approved one.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, location, application_status, logo_url, default_tax_pct",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as ListingOpt[];
      setListings(rows);
      const firstApproved = rows.find(
        (l) => l.application_status === "approved",
      );
      setSelectedListingId((prev) => prev ?? firstApproved?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);


  const body = (
    <main className="flex-1 pb-24 lg:pb-0">
        <div
          className={`backdrop-blur-md px-5 md:px-8 sticky top-0 z-40 border-b border-border ${
            embedded ? "pt-5 pb-3" : "py-5"
          }`}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-editorial text-3xl md:text-[2rem] leading-[1.05] tracking-tight">
                {!embedded ? "VendoraPay" : "Overview"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                {!embedded
                  ? "Accept card payments and track payouts from one place."
                  : "Your business at a glance — balance, activity, and what's next."}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-screen-2xl space-y-6">
          {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <OverviewTab
                balance={balance}
                accountVendorIds={accountVendorIds}
                onViewCalendar={goToCalendar}
              />
            )}
        </div>
      </main>
  );

  if (embedded) return body;

  return (
    <div className="flex min-h-screen vendor-canvas my-vendora-cockpit">
      <DashboardSidebar items={vendorNavItems} title="Vendor Portal" backPath="/settings" />
      {body}
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

// ---- Tabs --------------------------------------------------------

function OverviewTab({
  balance,
  accountVendorIds,
  onViewExpenses,
  onViewActivity,
  onViewCalendar,
}: {
  balance: Balance | null;
  // Every listing the current user owns; every Supabase query on
  // this tab aggregates across this whole list so the Overview
  // reads as a single account-level dashboard. Stripe data is no
  // longer rendered here (Recent activity now pulls paid invoices
  // from Supabase across the whole account).
  accountVendorIds: string[];
  // Click handler for "View all →" on the Operating expenses card —
  // navigates to the Payments tab's Expenses sub-surface.
  onViewExpenses?: () => void;
  // Click handler for "View all →" on the Recent activity card —
  // navigates to the Payments tab's incoming-payments ledger.
  onViewActivity?: () => void;
  // Click handler for "View all →" on the Upcoming appointments card —
  // navigates to the Calendar tab.
  onViewCalendar: () => void;
}) {
  const currency = balance?.currency ?? "usd";
  // Operating expenses are account-level (vendor_expenses.user_id), so
  // the OPEX card reads by the signed-in user rather than by listing.
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // KPI snapshots used by the Overview: Revenue 30d (with prior 30d
  // for trend), Customers total (with last-30d-new for the sub line),
  // plus MRR (broken down by recurring interval), the Leads pipeline
  // (new vs active vs won vs lost in the last 30d) and a 30-bucket
  // daily revenue series for the wave chart.
  const [leads, setLeads] = useState<{ new: number; active: number; won: number; lost: number; total: number }>({ new: 0, active: 0, won: 0, lost: 0, total: 0 });
  const [expenses, setExpenses] = useState<{ total: number; count: number; categoryCount: number; topCategories: Array<{ label: string; cents: number }> }>({ total: 0, count: 0, categoryCount: 0, topCategories: [] });
  const [revenue30d, setRevenue30d] = useState<number>(0);
  const [revenue30dPrev, setRevenue30dPrev] = useState<number>(0);
  // Daily revenue series for the last 30 days — drives the line chart.
  const [revenueSeries, setRevenueSeries] = useState<number[]>([]);
  // Recent paid invoices across the whole account (replaces the
  // single-listing Stripe transactions table that used to live here).
  const [recentInvoices, setRecentInvoices] = useState<Array<{ id: string; invoice_number: string; total_cents: number; paid_at: string; currency: string; bill_to_name: string | null }>>([]);
  // Upcoming appointments across the whole account — confirmed and
  // proposed meetings scheduled from now on, soonest first.
  const [upcomingAppts, setUpcomingAppts] = useState<Array<{ id: string; kind: string; title: string | null; location: string | null; scheduled_at: string; status: string; host_name: string | null }>>([]);
  // Gates the cards behind skeletons until the first fetch resolves —
  // otherwise the Overview flashes its empty states ($0, "No leads", "No
  // paid invoices") for a beat before the real numbers land.
  const [loading, setLoading] = useState(true);

  // Stable string key for the useEffect dep so we don't refire on
  // every render just because listings is re-derived.
  const accountKey = accountVendorIds.join(",");

  useEffect(() => {
    if (!userId || accountVendorIds.length === 0) {
      setLeads({ new: 0, active: 0, won: 0, lost: 0, total: 0 });
      setExpenses({ total: 0, count: 0, categoryCount: 0, topCategories: [] });
      setRevenue30d(0);
      setRevenue30dPrev(0);
      setRevenueSeries([]);
      setRecentInvoices([]);
      setUpcomingAppts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const now = new Date();

      // Overview metrics (leads pipeline, expenses, revenue, daily series)
      // are aggregated server-side in one RPC — instead of pulling up to
      // 10k rows of inquiries/expenses/invoices into the browser to reduce
      // them client-side. Recent paid invoices + upcoming appointments stay
      // small (≤5-row) client fetches since they render row-by-row.
      const [
        { data: analytics },
        { data: recentPaid },
        { data: upcomingApptRows },
      ] = await Promise.all([
        db.rpc("vendor_overview_analytics"),
        // Recent paid invoices across the whole account — replaces
        // the Stripe transactions feed for the Recent activity table.
        db
          .from("invoices")
          .select("id, invoice_number, total_cents, paid_at, currency, bill_to_name")
          .in("vendor_id", accountVendorIds)
          .eq("status", "paid")
          .order("paid_at", { ascending: false })
          .limit(5),
        // Upcoming appointments — confirmed (accepted) or still-proposed
        // meetings scheduled from now on, soonest first. Mirrors the
        // calendar's "upcoming" filter so the Overview agrees with it.
        db
          .from("appointments")
          .select(
            "id, kind, title, location, scheduled_at, status, host:profiles!appointments_host_id_fkey(display_name)",
          )
          .in("vendor_id", accountVendorIds)
          .in("status", ["accepted", "proposed"])
          .gte("scheduled_at", now.toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(5),
      ]);
      if (cancelled) return;

      // Apply the server-aggregated overview metrics. The RPC mirrors the
      // old client math: leads collapsed per (vendor_id, host_id) with the
      // won > active(replied/drafted) > new > lost priority; expenses summed
      // per line-item label with a top-3 + "Other" rollup; revenue from paid
      // invoices over the current vs previous 30-day window; and a 30-bucket
      // daily revenue series.
      const a = (analytics ?? {}) as {
        leads?: { new: number; active: number; won: number; lost: number; total: number };
        expenses?: {
          total: number;
          count: number;
          categoryCount: number;
          topCategories: Array<{ label: string; cents: number }>;
        };
        revenue30d?: number;
        revenue30dPrev?: number;
        revenueSeries?: number[];
      };
      setLeads(a.leads ?? { new: 0, active: 0, won: 0, lost: 0, total: 0 });
      setExpenses(
        a.expenses ?? { total: 0, count: 0, categoryCount: 0, topCategories: [] },
      );
      setRevenue30d(a.revenue30d ?? 0);
      setRevenue30dPrev(a.revenue30dPrev ?? 0);
      setRevenueSeries(
        Array.isArray(a.revenueSeries) && a.revenueSeries.length === 30
          ? a.revenueSeries
          : new Array<number>(30).fill(0),
      );

      setRecentInvoices(
        (recentPaid ?? []) as Array<{
          id: string;
          invoice_number: string;
          total_cents: number;
          paid_at: string;
          currency: string;
          bill_to_name: string | null;
        }>,
      );

      setUpcomingAppts(
        ((upcomingApptRows ?? []) as Array<{
          id: string;
          kind: string;
          title: string | null;
          location: string | null;
          scheduled_at: string;
          status: string;
          host: { display_name: string | null } | null;
        }>).map((a) => ({
          id: a.id,
          kind: a.kind,
          title: a.title,
          location: a.location,
          scheduled_at: a.scheduled_at,
          status: a.status,
          host_name: a.host?.display_name ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, userId]);

  if (loading) {
    // Match the real layout (revenue + recent row, three KPI cards, then
    // the appointments strip) so the cards don't jump when data lands.
    return (
      <div className="space-y-4">
        <div className="xl:flex xl:items-start xl:gap-4">
          <div className="xl:w-1/2 mb-4 xl:mb-0 h-64 rounded-2xl bg-foreground/5 animate-pulse" />
          <div className="xl:w-1/2 h-64 rounded-2xl bg-foreground/5 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-foreground/5 animate-pulse" />
          ))}
        </div>
        <div className="h-40 rounded-2xl bg-foreground/5 animate-pulse" />
      </div>
    );
  }

  return (
    <>
      {/* Top row — the 30-day revenue wave on the left, recent
          activity on the right. Each takes half the width on large
          desktops; they stack full width below xl. */}
      <div className="xl:flex xl:items-start xl:gap-4 mb-4">
        <div className="xl:w-1/2 mb-4 xl:mb-0">
          <OverviewRevenueChart series={revenueSeries} currency={currency} previousTotal={revenue30dPrev} />
        </div>

        {/* Recent activity — paid invoices across the whole account.
            Capped to 5 rows (see the .limit(5) fetch) so it stays a compact
            "what just landed" surface; full history lives in Payments. */}
        <div className="xl:w-1/2">
          <div className="cockpit-data-card">
            <div className="cockpit-data-card-header">
              <div>
                <h3 className="text-sm font-semibold">Recent activity</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Latest paid invoices across every listing on the account
                </p>
              </div>
              {onViewActivity ? (
                <button
                  type="button"
                  onClick={onViewActivity}
                  className="text-xs text-muted-foreground hover:text-accent border border-border rounded-md px-2.5 py-1 shrink-0"
                >
                  View all →
                </button>
              ) : null}
            </div>
            {recentInvoices.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                No paid invoices yet. When customers pay, they'll show up here.
              </div>
            ) : (
              <table className="cockpit-data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-medium truncate max-w-[320px]">{inv.bill_to_name ?? "—"}</td>
                      <td className="text-muted-foreground">{inv.invoice_number}</td>
                      <td className="text-muted-foreground">{formatDate(inv.paid_at)}</td>
                      <td className="num font-semibold">{formatMoney(inv.total_cents, inv.currency || currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Bar cards — Inquiries, Cash flow, Operating expenses. They
          share the same horizontal-bars visual rhythm, so grouping
          them tightens the page. Three across on desktop, stacks on
          narrow screens; nudged a touch narrower on wide monitors. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 xl:w-11/12">
        <OverviewLeadsCard leads={leads} />
        <OverviewCashflowCard moneyIn={revenue30d} moneyOut={expenses.total} currency={currency} />
        <OverviewExpensesCard expenses={expenses} currency={currency} onViewAll={onViewExpenses} />
      </div>

      {/* Upcoming appointments — confirmed / proposed meetings across
          every listing, soonest first. Links out to the Calendar tab. */}
      <OverviewUpcomingAppointments appts={upcomingAppts} onViewAll={onViewCalendar} />
    </>
  );
}

// Upcoming appointments card for the Overview — a compact "what's next
// on the calendar" surface. Pulls confirmed (accepted) and proposed
// meetings scheduled from now on, soonest first.
const APPT_KIND_LABEL: Record<string, string> = {
  consultation: "Consultation",
  walkthrough: "Walkthrough",
  tasting: "Tasting",
  fitting: "Fitting",
  phone_call: "Phone call",
  other: "Meeting",
};

function OverviewUpcomingAppointments({
  appts,
  onViewAll,
}: {
  appts: Array<{
    id: string;
    kind: string;
    title: string | null;
    location: string | null;
    scheduled_at: string;
    status: string;
    host_name: string | null;
  }>;
  onViewAll: () => void;
}) {
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  return (
    <div className="cockpit-data-card mb-4">
      <div className="cockpit-data-card-header">
        <div>
          <h3 className="text-sm font-semibold">Upcoming appointments</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Confirmed and proposed meetings across every listing
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs text-muted-foreground hover:text-accent border border-border rounded-md px-2.5 py-1 shrink-0"
        >
          View all →
        </button>
      </div>
      {appts.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted-foreground text-center">
          No upcoming appointments. Scheduled meetings will show up here.
        </div>
      ) : (
        <table className="cockpit-data-table">
          <thead>
            <tr>
              <th>Appointment</th>
              <th>With</th>
              <th>When</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {appts.map((a) => {
              const label = a.title?.trim() || APPT_KIND_LABEL[a.kind] || "Meeting";
              const confirmed = a.status === "accepted";
              return (
                <tr key={a.id}>
                  <td className="font-medium truncate max-w-[260px]">
                    {label}
                    {a.location ? (
                      <span className="block text-[11px] text-muted-foreground font-normal truncate">
                        {a.location}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground truncate max-w-[160px]">
                    {a.host_name ?? "—"}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap">{fmtWhen(a.scheduled_at)}</td>
                  <td>
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{
                        background: confirmed ? "hsl(var(--primary))" : "hsl(var(--pending))",
                        color: confirmed ? "hsl(var(--primary-foreground))" : "hsl(var(--accent))",
                      }}
                    >
                      {confirmed ? "Confirmed" : "Proposed"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Revenue trend chart for Overview — 30-day daily line chart with
// grid + axes. Mirrors RevenueSparkline's SVG approach but with
// fixed 30-bucket layout and "no data" empty state.
// Round a positive integer up to a "nice" axis ceiling so the chart's
// mid-tick reads as a clean number (e.g. $5k / $2.5k / $0 instead of
// $4.5k / $2.3k / $0). Chooses the smallest of 1, 2, 2.5, 5, or 10
// times the order of magnitude that's >= the data max.
function niceAxisCeil(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const scaled = n / mag;
  const nice =
    scaled <= 1 ? 1 :
    scaled <= 2 ? 2 :
    scaled <= 2.5 ? 2.5 :
    scaled <= 5 ? 5 :
    10;
  return nice * mag;
}

function OverviewRevenueChart({
  series: rawSeries,
  currency,
  previousTotal,
}: {
  series: number[];
  currency: string;
  previousTotal: number;
}) {
  // Guard against an empty series on first render (state initializes to
  // [] before the useEffect query resolves). The chart math below
  // dereferences pts[0] unconditionally, so an empty input would crash
  // — fall back to 30 zero-buckets and the ghost-wave path takes over.
  const series = rawSeries.length > 0 ? rawSeries : new Array(30).fill(0);
  const max = series.reduce((m, v) => (v > m ? v : m), 0);
  const total = series.reduce((s, v) => s + v, 0);
  const hasData = max > 0;
  // Delta vs prior 30-day window. Hidden when there's no comparison
  // baseline yet (vendor's first month with revenue).
  const deltaPct =
    previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  const deltaPositive = deltaPct !== null && deltaPct >= 0;

  // Hovered day index drives the crosshair / marker / tooltip. Null
  // = pointer is outside the plot area.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // X-axis label dates — 5 evenly-spaced markers across the 30-day
  // window, starting 29 days ago through today. Same set every
  // render (the chart's window doesn't slide mid-session), but
  // recomputed on mount so it tracks the calendar date the vendor
  // opens the page.
  const xAxisLabels = useMemo(() => {
    const labels: string[] = [];
    const now = new Date();
    const offsets = [29, 22, 15, 8, 0];
    for (const off of offsets) {
      const d = new Date(now);
      d.setDate(d.getDate() - off);
      labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
    return labels;
  }, []);

  return (
    <div
      className="rounded-2xl px-7 pt-6 pb-5"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
      }}
    >
      <div className="flex items-end justify-between mb-4">
        <div>
          <div
            className="text-[22px] font-semibold leading-tight"
            style={{ fontFamily: "'Libre Baskerville', Georgia, 'Times New Roman', serif", color: "#14161a" }}
          >
            Revenue · last 30 days
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Daily paid-invoice totals
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-[28px] font-semibold leading-none"
            style={{ fontFamily: "'Libre Baskerville', Georgia, 'Times New Roman', serif", color: "#14161a" }}
          >
            {formatMoney(total, currency)}
          </div>
          {deltaPct !== null ? (
            <div
              className="text-xs font-semibold mt-1"
              style={{ color: deltaPositive ? "hsl(var(--accent))" : "hsl(var(--destructive))" }}
            >
              {deltaPositive ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
            </div>
          ) : null}
        </div>
      </div>

      {(() => {
        const PAD_L = 50, PAD_R = 8, PAD_T = 8, PAD_B = 6, W = 620, H = 200;
        const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
        const n = series.length;
        const plotted = hasData
          ? series
          : Array.from({ length: n }, (_, i) =>
              0.55 + 0.35 * Math.sin((i / (n - 1)) * Math.PI * 1.4 - Math.PI / 6),
            );
        const plotMax = hasData ? niceAxisCeil(max) : 1;
        const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
        const y = (v: number) => PAD_T + plotH - (v / plotMax) * plotH;
        // Smooth the line into a wave with a Catmull-Rom-to-Bezier
        // conversion — tension 0.2 ≈ Chart.js's `tension: 0.4` look.
        // The area path reuses the same curve so the fill hugs the
        // line instead of cutting in straight segments underneath.
        //
        // Control-point y values are clamped to each segment's
        // [min, max] range so the bezier can't overshoot. Without
        // this the segment AFTER a peak — going from zero to zero
        // with a peak as p0 — sets c1y = p1.y + (p2.y - p0.y) * t,
        // which is *below* the baseline because (p2 - p0) is a
        // positive delta. The curve then dips visibly under the
        // "$0" gridline.
        const pts = plotted.map((v, i) => ({ x: x(i), y: y(v) }));
        const tension = 0.2;
        let linePath = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] ?? pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] ?? pts[i + 1];
          const c1x = p1.x + (p2.x - p0.x) * tension;
          let c1y = p1.y + (p2.y - p0.y) * tension;
          const c2x = p2.x - (p3.x - p1.x) * tension;
          let c2y = p2.y - (p3.y - p1.y) * tension;
          const segMinY = Math.min(p1.y, p2.y);
          const segMaxY = Math.max(p1.y, p2.y);
          c1y = Math.min(Math.max(c1y, segMinY), segMaxY);
          c2y = Math.min(Math.max(c2y, segMinY), segMaxY);
          linePath += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }
        const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${PAD_T + plotH} L${pts[0].x.toFixed(1)},${PAD_T + plotH} Z`;

        // Snap hover to the nearest data point so the tooltip shows
        // a real per-day value, not an interpolated curve value.
        const onMove = (e: React.MouseEvent<SVGRectElement>) => {
          if (!hasData) return;
          const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
          const vbX = ((e.clientX - rect.left) / rect.width) * W;
          const frac = (vbX - PAD_L) / plotW;
          const idx = Math.round(frac * (n - 1));
          setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
        };
        const onLeave = () => setHoverIdx(null);

        // Compute hover artifacts. Marker + crosshair share the same
        // x; the tooltip is HTML overlaid above the marker.
        const showHover = hoverIdx !== null && hasData;
        const hoverX = showHover ? x(hoverIdx!) : 0;
        const hoverY = showHover ? y(series[hoverIdx!]) : 0;
        const hoverDate = (() => {
          if (!showHover) return "";
          const d = new Date();
          d.setDate(d.getDate() - (n - 1 - (hoverIdx as number)));
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        })();

        return (
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px] overflow-visible" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="cockpit-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8a6f3e" stopOpacity={hasData ? 0.18 : 0.08} />
                  <stop offset="100%" stopColor="#8a6f3e" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Horizontal grid lines + y-axis tick labels */}
              {[0, 0.5, 1].map((t) => {
                const yy = PAD_T + plotH - t * plotH;
                return (
                  <g key={t}>
                    <line x1={PAD_L} y1={yy} x2={PAD_L + plotW} y2={yy} stroke="rgba(0, 0, 0,0.06)" strokeWidth="1" />
                    <text x={PAD_L - 6} y={yy} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#14161a">
                      {hasData ? (t === 0 ? "$0" : formatMoneyCompact(plotMax * t, currency)) : ""}
                    </text>
                  </g>
                );
              })}
              <path d={areaPath} fill="url(#cockpit-area-grad)" style={hasData ? undefined : { opacity: 0.5 }} />
              <path
                d={linePath}
                fill="none"
                stroke="#8a6f3e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={hasData ? undefined : { opacity: 0.35 }}
              />
              {showHover ? (
                <>
                  <line x1={hoverX} y1={PAD_T} x2={hoverX} y2={PAD_T + plotH} stroke="#8a6f3e" strokeOpacity="0.45" strokeWidth="1" />
                  <circle cx={hoverX} cy={hoverY} r="4.5" fill="#ffffff" stroke="#8a6f3e" strokeWidth="2.5" />
                </>
              ) : null}
              {/* Hit-test rect — captures pointer moves and converts
                  them to a snapped day index. Sits on top of all the
                  path geometry so events don't fall through. */}
              <rect
                x={PAD_L}
                y={PAD_T}
                width={plotW}
                height={plotH}
                fill="transparent"
                style={{ cursor: hasData ? "crosshair" : "default" }}
                onMouseMove={onMove}
                onMouseLeave={onLeave}
              />
            </svg>
            {showHover ? (
              <div
                className="absolute pointer-events-none text-xs font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap"
                style={{
                  left: `${(hoverX / W) * 100}%`,
                  top: `${(hoverY / H) * 100}%`,
                  transform: "translate(-50%, calc(-100% - 12px))",
                  background: "#14161a",
                  color: "#fff",
                  boxShadow: "0 6px 18px -8px hsl(220 14% 9% / 0.18)",
                }}
              >
                {formatMoney(series[hoverIdx as number], currency)}
                <span className="block font-normal text-[11px] mt-0.5" style={{ color: "rgba(244,241,234,0.7)" }}>
                  {hoverDate}
                </span>
                {/* Triangle pointer below the tip */}
                <span
                  className="absolute left-1/2 -translate-x-1/2 top-full block"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "5px solid #14161a",
                  }}
                />
              </div>
            ) : null}
            {/* X-axis labels — 5 evenly-spaced calendar dates beneath
                the SVG so they can't be clipped by the plot. Margins
                match the SVG's PAD_L / PAD_R so labels line up under
                the plot area, not the y-axis label gutter. */}
            <div
              className="flex justify-between text-[11px] mt-2"
              style={{
                color: "hsl(var(--muted-foreground))",
                paddingLeft: `${(50 / 620) * 100}%`,
                paddingRight: `${(8 / 620) * 100}%`,
              }}
            >
              {xAxisLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="text-xs italic rounded-full px-3 py-1.5"
                  style={{
                    color: "hsl(var(--foreground))",
                    background: "hsl(var(--muted))",
                  }}
                >
                  No paid invoices in the last 30 days
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// MRR breakdown card — horizontal bars showing each subscription
// interval's contribution to monthly recurring revenue. Same visual
// rhythm as the A/R aging card it replaced (label + colored bar +
// right-aligned $ amount), warm palette for visual cohesion with
// the crimson revenue line: Monthly = crimson accent (the biggest
// expected contributor), Weekly = terra, Quarterly = amber,
// Yearly = green.
// Leads pipeline card — horizontal bars showing the count of
// inbound inquiries in each pipeline state over the last 30 days.
// Same visual rhythm as the MRR / A/R aging cards (label + colored
// bar + right-aligned count) and the same warm palette so the row
// reads as one editorial system:
//   New   = crimson  — unanswered, needs attention
//   Active= terra    — drafted + replied (in conversation)
//   Won   = green    — converted
//   Lost  = warm gray — lost + expired
function OverviewLeadsCard({
  leads,
}: {
  leads: { new: number; active: number; won: number; lost: number; total: number };
}) {
  const rows: Array<{ label: string; count: number; color: string }> = [
    { label: "New",    count: leads.new,    color: "#c9a86a" }, // champagne — new, needs a reply
    { label: "Active", count: leads.active, color: "#8a6f3e" }, // bronze — in conversation
    { label: "Won",    count: leads.won,    color: "#14161a" }, // ink — converted
    { label: "Lost",   count: leads.lost,   color: "#d9d1bf" }, // sand — lost/expired
  ];
  const max = rows.reduce((m, r) => (r.count > m ? r.count : m), 0);
  const wonRate = leads.total > 0 ? Math.round((leads.won / leads.total) * 100) : 0;
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="cockpit-chart-title">Inquiries</div>
          <div className="cockpit-chart-sub">Inbound pipeline · last 30 days</div>
        </div>
        <div className="text-right">
          <div className="cockpit-kpi-label">Total</div>
          <div className="cockpit-money cockpit-money--lg">{leads.total}</div>
        </div>
      </div>
      {leads.total === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No leads in the last 30 days. New inquiries land here.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = max > 0 ? (r.count / max) * 100 : 0;
              return (
                <div key={r.label} className="flex items-center gap-2">
                  <div className="w-20 text-xs text-foreground font-bold shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: "rgba(0,0,0, 0.12)" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: r.color, opacity: r.count > 0 ? 1 : 0 }}
                    />
                  </div>
                  <div className="w-12 text-right text-xs text-foreground font-bold tabular-nums shrink-0">
                    {r.count > 0 ? r.count : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {leads.won > 0
              ? `${wonRate}% conversion · ${leads.won} of ${leads.total} won`
              : `${leads.total} inquir${leads.total === 1 ? "y" : "ies"} this period`}
          </div>
        </>
      )}
    </div>
  );
}

// Cash flow card — money in (paid invoices) vs money out (operating
// expenses) over the last 30 days, with the net underneath. Same
// label + bar + right-aligned value rhythm as the MRR / Inquiries /
// OPEX cards so the row reads as one editorial system. Money in is
// green, money out crimson; the net flips green → crimson when the
// vendor spends more than they collected, so a cash crunch is
// obvious at a glance.
function OverviewCashflowCard({
  moneyIn,
  moneyOut,
  currency,
}: {
  moneyIn: number;
  moneyOut: number;
  currency: string;
}) {
  const net = moneyIn - moneyOut;
  const netPositive = net >= 0;
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: "Money in",  value: moneyIn,  color: "#8a6f3e" }, // bronze
    { label: "Money out", value: moneyOut, color: "#14161a" }, // ink
  ];
  const max = Math.max(moneyIn, moneyOut, 1);
  // Net margin — net as a share of money in. Only meaningful once the
  // vendor has actually collected something this period.
  const marginPct = moneyIn > 0 ? Math.round((net / moneyIn) * 100) : null;
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="cockpit-chart-title">Cash flow</div>
          <div className="cockpit-chart-sub">Money in vs out · last 30 days</div>
        </div>
        <div className="text-right">
          <div className="cockpit-kpi-label">Net</div>
          <div
            className="cockpit-money cockpit-money--lg"
            style={{ color: netPositive ? "hsl(var(--accent))" : "hsl(var(--destructive))" }}
          >
            {netPositive ? "" : "−"}{formatMoney(Math.abs(net), currency)}
          </div>
        </div>
      </div>
      {moneyIn === 0 && moneyOut === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No money in or out in the last 30 days.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = (r.value / max) * 100;
              return (
                <div key={r.label} className="flex items-center gap-2">
                  <div className="w-20 text-xs text-foreground font-bold shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: "rgba(0,0,0, 0.12)" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: r.color, opacity: r.value > 0 ? 1 : 0 }}
                    />
                  </div>
                  <div className="w-24 text-right text-xs text-foreground font-bold tabular-nums shrink-0">
                    {formatMoney(r.value, currency)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {marginPct !== null
              ? `${marginPct}% net margin · ${formatMoney(moneyOut, currency)} spent`
              : `${formatMoney(moneyOut, currency)} spent, nothing collected yet`}
          </div>
        </>
      )}
    </div>
  );
}

// Operating expenses card — donut chart + legend showing OPEX in
// the last 30 days broken down by category. The vendor's top 3
// categories get their own slice; any 4th+ category rolls into an
// "Other" bucket so the donut tops out at four segments. After the
// rollup the list is re-sorted by amount, so "Other" floats to its
// correct rank position (e.g. if the rollup sum is larger than the
// 2nd-largest individual category, it sits 2nd, not last).
// Footer is explicit about the underlying counts so "8 expenses
// shown as 4 categories" doesn't read as a mismatch.
function OverviewExpensesCard({
  expenses,
  currency,
  onViewAll,
}: {
  expenses: { total: number; count: number; categoryCount: number; topCategories: Array<{ label: string; cents: number }> };
  currency: string;
  onViewAll?: () => void;
}) {
  // Brand ramp (ink → bronze → champagne → sand) so a vendor scanning
  // the page picks up category rank by tone.
  const palette = ["#14161a", "#8a6f3e", "#c9a86a", "#d9d1bf"];
  const rows = expenses.topCategories.map((c, i) => ({
    ...c, color: palette[i] ?? "#ece7db",
  }));
  // Donut geometry — stroked circle with stroke-dasharray for each
  // segment. Radius 38 + strokeWidth 14 gives an outer ring at 45
  // and an inner hole at ~31 inside a 100x100 viewbox. SVG strokes
  // start at 3 o'clock, so the whole svg is rotated -90deg to begin
  // the first segment at 12 o'clock like a clock face.
  const RING_R = 38;
  const RING_W = 14;
  const CIRC = 2 * Math.PI * RING_R;
  let dashOffset = 0;
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <div className="min-w-0">
          <div className="cockpit-chart-title truncate">Operating expenses</div>
          <div className="cockpit-chart-sub">Last 30 days · by item</div>
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-muted-foreground hover:text-accent border border-border rounded-md px-2.5 py-1 shrink-0"
          >
            View all →
          </button>
        ) : null}
      </div>
      {expenses.count === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No expenses logged in the last 30 days.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] shrink-0 -rotate-90" aria-hidden>
              {/* Faint background ring so the donut feels seated even
                  when one segment dominates the total. */}
              <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth={RING_W} />
              {rows.map((r) => {
                const len = expenses.total > 0 ? (r.cents / expenses.total) * CIRC : 0;
                const offset = dashOffset;
                dashOffset += len;
                return (
                  <circle
                    key={r.label}
                    cx="50" cy="50" r={RING_R}
                    fill="none"
                    stroke={r.color}
                    strokeWidth={RING_W}
                    strokeDasharray={`${len} ${CIRC - len}`}
                    strokeDashoffset={-offset}
                  />
                );
              })}
            </svg>
            <div className="flex-1 min-w-0 space-y-1.5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
                  <span className="text-foreground font-bold truncate flex-1">{r.label}</span>
                  <span className="tabular-nums text-foreground font-bold shrink-0">
                    {formatMoney(r.cents, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {expenses.count} expense{expenses.count === 1 ? "" : "s"} across{" "}
            {expenses.categoryCount} item{expenses.categoryCount === 1 ? "" : "s"}
            {expenses.categoryCount > expenses.topCategories.length
              ? ` · ${expenses.categoryCount - expenses.topCategories.length + 1} grouped into Other`
              : ""}
          </div>
        </>
      )}
    </div>
  );
}



// Compact money formatter for chart axis labels — "1.2k" / "12.5k"
// / "1.2M" instead of "$1,200" so 5 ticks fit on a narrow Y axis.
function formatMoneyCompact(cents: number, currency: string): string {
  const v = cents / 100;
  // Below 1k there's nothing to abbreviate — show the full amount. At/above
  // 1k use Intl's compact notation ("$1.2K", "$3M"), which places the
  // currency symbol correctly for any currency instead of the old
  // string-replace hack that only worked for a leading "$".
  if (Math.abs(v) < 1_000) return formatMoney(cents, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}
