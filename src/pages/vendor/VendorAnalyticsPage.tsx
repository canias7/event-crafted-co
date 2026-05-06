import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Eye,
  Inbox,
  MessageCircle,
  Trophy,
  Clock,
  Star,
  Users,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { vendorNavItems as navItems } from "@/data/navItems";
import { ProposalFunnelCard } from "@/components/vendor/ProposalFunnelCard";

interface InquiryRow {
  id: string;
  status: string;
  created_at: string;
}

interface MessageRow {
  inquiry_id: string;
  created_at: string;
}

interface ReviewRow {
  rating: number;
  created_at: string;
}

interface ViewRow {
  viewed_at: string;
}

interface Benchmark {
  peer_count: number;
  median_response_hours: number | null;
  median_booking_rate: number | null;
  median_inquiries: number | null;
}

type WindowDays = 30 | 90;
const DEFAULT_WINDOW: WindowDays = 30;

function pct(num: number, denom: number): string {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${Math.round(hours / 24)} days`;
}

// Median over a list of numbers.
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function VendorAnalyticsPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;

  const [windowDays, setWindowDays] = useState<WindowDays>(DEFAULT_WINDOW);
  const [loading, setLoading] = useState(true);
  const [viewRows, setViewRows] = useState<ViewRow[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [vendorMessages, setVendorMessages] = useState<MessageRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [vendorCategory, setVendorCategory] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);

  useEffect(() => {
    if (!user || !vendorId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - windowDays);
      const sinceIso = since.toISOString();

      // Profile views with timestamps for the daily sparkline.
      const viewsRes = await supabase
        .from("vendor_profile_views")
        .select("viewed_at")
        .eq("vendor_id", vendorId)
        .gte("viewed_at", sinceIso)
        .order("viewed_at", { ascending: true });

      // Inquiries with status.
      const inqRes = await supabase
        .from("inquiries")
        .select("id, status, created_at")
        .eq("vendor_id", vendorId)
        .gte("created_at", sinceIso);

      const inqRows = (inqRes.data as InquiryRow[] | null) ?? [];

      // Vendor-side messages on those inquiries (to compute response time).
      let msgs: MessageRow[] = [];
      if (inqRows.length > 0) {
        const ids = inqRows.map((i) => i.id);
        const msgRes = await supabase
          .from("messages")
          .select("inquiry_id, created_at")
          .eq("sender_role", "vendor")
          .in("inquiry_id", ids)
          .order("created_at", { ascending: true });
        msgs = (msgRes.data as MessageRow[] | null) ?? [];
      }

      // Reviews (all time).
      const reviewRes = await supabase
        .from("reviews")
        .select("rating, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      // Vendor category (for benchmarks).
      const profRes = await supabase
        .from("vendor_profiles")
        .select("category")
        .eq("id", vendorId)
        .maybeSingle();
      const cat =
        (profRes.data as { category: string } | null)?.category ?? null;

      // Cross-vendor benchmark for the same category. Best-effort —
      // requires the get_vendor_benchmarks RPC.
      let bench: Benchmark | null = null;
      if (cat) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const benchRes = await (supabase as any).rpc(
          "get_vendor_benchmarks",
          { p_category: cat, p_window_days: windowDays },
        );
        if (Array.isArray(benchRes.data) && benchRes.data[0]) {
          bench = benchRes.data[0] as Benchmark;
        }
      }

      if (cancelled) return;
      setViewRows((viewsRes.data as ViewRow[] | null) ?? []);
      setInquiries(inqRows);
      setVendorMessages(msgs);
      setReviews((reviewRes.data as ReviewRow[] | null) ?? []);
      setVendorCategory(cat);
      setBenchmark(bench);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId, windowDays]);

  const totalViews = viewRows.length;

  // Funnel metrics
  const stats = useMemo(() => {
    const totalInquiries = inquiries.length;
    const replied = inquiries.filter(
      (i) => i.status === "replied" || i.status === "won",
    ).length;
    const won = inquiries.filter((i) => i.status === "won").length;
    return { totalInquiries, replied, won };
  }, [inquiries]);

  // Response time (median hours from inquiry created → first vendor message).
  const responseTime = useMemo(() => {
    if (vendorMessages.length === 0 || inquiries.length === 0) return NaN;
    const inqMap = new Map(inquiries.map((i) => [i.id, i.created_at]));
    const firstByInquiry = new Map<string, string>();
    for (const m of vendorMessages) {
      if (!firstByInquiry.has(m.inquiry_id)) {
        firstByInquiry.set(m.inquiry_id, m.created_at);
      }
    }
    const hours: number[] = [];
    for (const [inqId, firstMsg] of firstByInquiry) {
      const created = inqMap.get(inqId);
      if (!created) continue;
      const diffMs =
        new Date(firstMsg).getTime() - new Date(created).getTime();
      if (diffMs >= 0) hours.push(diffMs / (1000 * 60 * 60));
    }
    return median(hours);
  }, [vendorMessages, inquiries]);

  // Daily views over the lookback window (for sparkline).
  const dailyViews = useMemo(() => {
    const buckets: { day: string; count: number }[] = [];
    const now = new Date();
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ day: d.toISOString().slice(0, 10), count: 0 });
    }
    const idxByDay = new Map(buckets.map((b, i) => [b.day, i]));
    for (const v of viewRows) {
      const day = new Date(v.viewed_at).toISOString().slice(0, 10);
      const idx = idxByDay.get(day);
      if (idx !== undefined) buckets[idx].count++;
    }
    return buckets;
  }, [viewRows, windowDays]);

  const maxDailyViews = Math.max(1, ...dailyViews.map((b) => b.count));

  // Inquiries-per-week sparkline (last 8 weeks)
  const weekly = useMemo(() => {
    const buckets: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 7 * (i + 1) + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      buckets.push({
        label: start.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        count: 0,
      });
    }
    // Need a wider lookback for this chart — refetch separately would be
    // ideal. For now, count from the 30-day window which covers ~4 buckets
    // accurately and zeros out the rest. Acceptable v1.
    for (const i of inquiries) {
      const t = new Date(i.created_at);
      const weeksAgo = Math.floor(
        (now.getTime() - t.getTime()) / (7 * 24 * 60 * 60 * 1000),
      );
      const idx = 7 - weeksAgo;
      if (idx >= 0 && idx < 8) buckets[idx].count++;
    }
    return buckets;
  }, [inquiries]);

  const maxWeekly = Math.max(1, ...weekly.map((w) => w.count));

  const avgRating =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-display text-xl">Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Last {windowDays} days · how hosts are finding and converting on you
              </p>
            </div>
            <div className="inline-flex rounded-full border border-border bg-background overflow-hidden text-xs">
              {([30, 90] as WindowDays[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWindowDays(d)}
                  className={`px-3 py-1.5 transition-colors ${
                    windowDays === d
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-8">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-sm" />
              ))}
            </div>
          ) : !vendorId ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <p className="font-display text-xl mb-2">
                Set up your business profile first
              </p>
              <p className="text-sm text-muted-foreground">
                Once you have a vendor profile, your analytics will land here.
              </p>
            </div>
          ) : (
            <>
              {/* Funnel */}
              <section>
                <p className="font-label text-muted-foreground mb-3">
                  Conversion funnel
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <FunnelCard
                    icon={Eye}
                    label="Profile views"
                    value={totalViews}
                    sub="Anonymous + signed-in"
                    rate={null}
                  />
                  <FunnelCard
                    icon={Inbox}
                    label="Inquiries"
                    value={stats.totalInquiries}
                    sub={`${pct(stats.totalInquiries, totalViews)} of views`}
                    rate={pct(stats.totalInquiries, totalViews)}
                  />
                  <FunnelCard
                    icon={MessageCircle}
                    label="Replied"
                    value={stats.replied}
                    sub={`${pct(stats.replied, stats.totalInquiries)} of inquiries`}
                    rate={pct(stats.replied, stats.totalInquiries)}
                  />
                  <FunnelCard
                    icon={Trophy}
                    label="Booked"
                    value={stats.won}
                    sub={`${pct(stats.won, stats.totalInquiries)} of inquiries`}
                    rate={pct(stats.won, stats.totalInquiries)}
                  />
                </div>
              </section>

              {/* Daily profile views — fine-grained sparkline so vendors
                  can correlate dips with off-platform changes. */}
              <section className="bg-card border border-border rounded-sm p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Eye className="w-3.5 h-3.5" />
                    <p className="font-label">Profile views by day</p>
                  </div>
                  <p className="text-xs text-muted-foreground tnum">
                    {totalViews} total · {(totalViews / windowDays).toFixed(1)}/day avg
                  </p>
                </div>
                <div className="flex items-end gap-px h-20">
                  {dailyViews.map((b, i) => {
                    const h = (b.count / maxDailyViews) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-stretch group relative"
                        title={`${b.day}: ${b.count} view${b.count === 1 ? "" : "s"}`}
                      >
                        <div className="flex-1 flex items-end">
                          <div
                            className={`w-full rounded-sm transition-colors ${
                              b.count > 0
                                ? "bg-foreground/85 group-hover:bg-foreground"
                                : "bg-secondary"
                            }`}
                            style={{
                              height: `${Math.max(h, b.count > 0 ? 6 : 3)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-2 tnum">
                  <span>{dailyViews[0]?.day.slice(5)}</span>
                  <span>{dailyViews[dailyViews.length - 1]?.day.slice(5)}</span>
                </div>
              </section>

              {/* Benchmark: how this vendor compares to peers in the same category */}
              {benchmark && benchmark.peer_count > 1 && (
                <BenchmarkCard
                  benchmark={benchmark}
                  category={vendorCategory}
                  responseHours={responseTime}
                  bookingRate={
                    stats.totalInquiries > 0
                      ? stats.won / stats.totalInquiries
                      : null
                  }
                  inquiries={stats.totalInquiries}
                />
              )}

              {/* Response time + reviews row */}
              <section className="grid lg:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-sm p-5">
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <Clock className="w-3.5 h-3.5" />
                    <p className="font-label">Median response time</p>
                  </div>
                  <p className="font-display text-3xl mb-2 tnum">
                    {formatHours(responseTime)}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    From host inquiry → your first reply. Faster replies
                    convert more — under 3 hours is the platform target.
                  </p>
                </div>

                <div className="bg-card border border-border rounded-sm p-5">
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <Star className="w-3.5 h-3.5" />
                    <p className="font-label">Reviews</p>
                  </div>
                  <p className="font-display text-3xl mb-2 tnum">
                    {avgRating === 0 ? "—" : avgRating.toFixed(1)}
                    <span className="text-base text-muted-foreground font-light ml-2">
                      from {reviews.length}{" "}
                      {reviews.length === 1 ? "review" : "reviews"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Auto-prompts go out to hosts 3 days after a booked event;
                    encourage friction-free reviews to keep this fresh.
                  </p>
                </div>
              </section>

              {vendorId && (
                <section>
                  <ProposalFunnelCard vendorId={vendorId} />
                </section>
              )}

              {/* Weekly inquiries */}
              <section className="bg-card border border-border rounded-sm p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <p className="font-label">Inquiries by week</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last 8 weeks · zero if outside the 30-day window
                  </p>
                </div>
                <div className="flex items-end gap-2 h-32">
                  {weekly.map((w, i) => {
                    const h = (w.count / maxWeekly) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center gap-2"
                      >
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className={`w-full rounded-sm ${
                              w.count > 0
                                ? "bg-foreground"
                                : "bg-secondary"
                            }`}
                            style={{
                              height: `${Math.max(h, w.count > 0 ? 8 : 4)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tnum">
                          {w.label}
                        </span>
                        <span className="text-[10px] font-medium tnum">
                          {w.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function BenchmarkCard({
  benchmark,
  category,
  responseHours,
  bookingRate,
  inquiries,
}: {
  benchmark: Benchmark;
  category: string | null;
  responseHours: number;
  bookingRate: number | null;
  inquiries: number;
}) {
  const slowerThanPeers =
    Number.isFinite(responseHours) &&
    benchmark.median_response_hours != null &&
    responseHours > Number(benchmark.median_response_hours) * 2;

  return (
    <section className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <p className="font-label">
            How you compare {category ? `to other ${category}s` : "to peers"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground tnum">
          vs {benchmark.peer_count - 1} other vendor
          {benchmark.peer_count - 1 === 1 ? "" : "s"} in your category
        </p>
      </div>

      {slowerThanPeers && (
        <div className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/20 rounded-sm p-3 mb-4">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
          <span className="text-destructive/85 leading-relaxed">
            Your reply time is more than 2× slower than the category median.
            Hosts often book the first vendor who replies — even a one-line
            "got your inquiry, full quote tomorrow" message keeps you in the
            running.
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <BenchmarkMetric
          label="Reply time"
          you={formatHours(responseHours)}
          peers={
            benchmark.median_response_hours != null
              ? formatHours(Number(benchmark.median_response_hours))
              : "—"
          }
          better={
            Number.isFinite(responseHours) &&
            benchmark.median_response_hours != null
              ? responseHours <= Number(benchmark.median_response_hours)
              : null
          }
        />
        <BenchmarkMetric
          label="Booking rate"
          you={bookingRate != null ? `${Math.round(bookingRate * 100)}%` : "—"}
          peers={
            benchmark.median_booking_rate != null
              ? `${Math.round(Number(benchmark.median_booking_rate) * 100)}%`
              : "—"
          }
          better={
            bookingRate != null && benchmark.median_booking_rate != null
              ? bookingRate >= Number(benchmark.median_booking_rate)
              : null
          }
        />
        <BenchmarkMetric
          label="Inquiries"
          you={inquiries.toString()}
          peers={(benchmark.median_inquiries ?? 0).toString()}
          better={
            benchmark.median_inquiries != null
              ? inquiries >= benchmark.median_inquiries
              : null
          }
        />
      </div>
    </section>
  );
}

function BenchmarkMetric({
  label,
  you,
  peers,
  better,
}: {
  label: string;
  you: string;
  peers: string;
  better: boolean | null;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </p>
      <p
        className={`font-display text-xl tnum mb-0.5 ${
          better === true
            ? "text-accent"
            : better === false
              ? "text-destructive/80"
              : ""
        }`}
      >
        {you}
      </p>
      <p className="text-[10px] text-muted-foreground tnum">
        peers: <span className="tnum">{peers}</span>
      </p>
    </div>
  );
}

function FunnelCard({
  icon: Icon,
  label,
  value,
  sub,
  rate,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  sub: string;
  rate: string | null;
}) {
  return (
    <div className="bg-card border border-border rounded-sm p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <Icon className="w-3.5 h-3.5" />
        <p className="font-label">{label}</p>
      </div>
      <p className="font-display text-3xl tnum mb-1">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
      {rate !== null && rate !== "—" && (
        <p className="text-[10px] text-accent mt-2 font-medium tnum">{rate}</p>
      )}
    </div>
  );
}
