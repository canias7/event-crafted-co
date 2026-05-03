import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Eye,
  Inbox,
  MessageCircle,
  Trophy,
  Clock,
  Star,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { vendorNavItems as navItems } from "@/data/navItems";

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

interface PackageRow {
  id: string;
  name: string;
  price_cents: number;
  is_active: boolean;
}

const WINDOW_DAYS = 30;

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

  const [loading, setLoading] = useState(true);
  const [views30d, setViews30d] = useState(0);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [vendorMessages, setVendorMessages] = useState<MessageRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);

  useEffect(() => {
    if (!user || !vendorId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - WINDOW_DAYS);
      const sinceIso = since.toISOString();

      // Views (last 30 days). Headers-only count.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewsRes = await (supabase as any)
        .from("vendor_profile_views")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId)
        .gte("viewed_at", sinceIso);

      // Inquiries (last 30 days, with status).
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reviewRes = await (supabase as any)
        .from("reviews")
        .select("rating, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      // Packages.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pkgRes = await (supabase as any)
        .from("vendor_packages")
        .select("id, name, price_cents, is_active")
        .eq("vendor_id", vendorId)
        .order("display_order", { ascending: true });

      if (cancelled) return;
      setViews30d((viewsRes as { count: number | null }).count ?? 0);
      setInquiries(inqRows);
      setVendorMessages(msgs);
      setReviews((reviewRes.data as ReviewRow[] | null) ?? []);
      setPackages((pkgRes.data as PackageRow[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId]);

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
          <h1 className="font-display text-xl">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Last {WINDOW_DAYS} days · how hosts are finding and converting on you
          </p>
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
                    value={views30d}
                    sub="Anonymous + signed-in"
                    rate={null}
                  />
                  <FunnelCard
                    icon={Inbox}
                    label="Inquiries"
                    value={stats.totalInquiries}
                    sub={`${pct(stats.totalInquiries, views30d)} of views`}
                    rate={pct(stats.totalInquiries, views30d)}
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

              {/* Packages snapshot */}
              <section>
                <p className="font-label text-muted-foreground mb-3">
                  Packages
                </p>
                {packages.length === 0 ? (
                  <div className="bg-card border border-dashed border-border rounded-sm p-8 text-center">
                    <Package className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium mb-1">
                      No packages yet
                    </p>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                      Vendors who publish 2-4 priced tiers convert inquiries
                      ~2× faster than those with a single starting price.
                    </p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {packages.map((p) => (
                      <div
                        key={p.id}
                        className={`rounded-sm border bg-card p-4 ${
                          p.is_active ? "border-border" : "border-border/40 opacity-60"
                        }`}
                      >
                        <p className="font-display text-base mb-1">{p.name}</p>
                        <p className="text-lg font-semibold tnum">
                          ${(p.price_cents / 100).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {p.is_active ? "Active" : "Hidden"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
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
