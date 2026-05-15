import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Inbox,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Recharts is heavy (~150kB parsed) — defer the chart panel into its
// own chunk so the dashboard's first paint (header + KPI strip +
// recent inquiries) doesn't have to wait for the visualisation
// library to download or parse. Mobile feels noticeably snappier.
const VendorPerformanceCharts = lazy(() =>
  import("@/components/vendor/VendorPerformanceCharts").then((m) => ({
    default: m.VendorPerformanceCharts,
  })),
);
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { vendorNavItems as navItems } from "@/data/navItems";

interface VendorProfile {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  base_price_cents: number | null;
  location: string | null;
  service_radius_miles: number | null;
  portfolio_summary: string | null;
  verified_at: string | null;
  application_status: "pending" | "approved" | "rejected" | null;
  application_review_notes: string | null;
}

interface RecentInquiry {
  id: string;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  status: string;
  created_at: string;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  host: { display_name: string | null } | null;
}

const statusStyles: Record<string, string> = {
  new: "bg-accent/15 text-accent border-accent/30",
  drafted: "bg-secondary text-secondary-foreground border-border",
  replied: "bg-foreground text-background border-foreground",
  won: "bg-accent text-accent-foreground border-accent",
  lost: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<string, string> = {
  new: "New",
  drafted: "AI drafting",
  replied: "Replied",
  won: "Booked",
  lost: "Closed",
  expired: "Expired",
};

function KpiCell({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-label text-muted-foreground truncate">{label}</p>
        <p className="font-display text-2xl tnum mt-0.5">{value}</p>
      </div>
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
          accent ? "bg-accent/10 text-accent" : "bg-secondary text-muted-foreground"
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}

export default function VendorDashboard() {
  const { t } = useTranslation();
  const { user, profile, vendorMemberships } = useAuth();
  const membershipVendorId = vendorMemberships[0]?.vendor_id ?? null;
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [stats, setStats] = useState({
    newRequests: 0,
    awaiting: 0,
    booked: 0,
    total: 0,
  });
  const [allInquiries, setAllInquiries] = useState<RecentInquiry[]>([]);
  const [ratings, setRatings] = useState<Array<{ rating: number }>>([]);
  const [viewRows, setViewRows] = useState<Array<{ viewed_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (!membershipVendorId) {
      setVendorProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: vp } = await (supabase as any)
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, application_status, application_review_notes",
        )
        .eq("id", membershipVendorId)
        .maybeSingle();

      if (cancelled) return;
      const vpRow = (vp as VendorProfile | null) ?? null;
      setVendorProfile(vpRow);

      if (vpRow) {
        const { data: inquiries } = await supabase
          .from("inquiries")
          .select(
            "id, event_type, event_date, guest_count, status, created_at, budget_min_cents, budget_max_cents, host:profiles!inquiries_host_id_fkey(display_name)",
          )
          .eq("vendor_id", vpRow.id)
          .order("created_at", { ascending: false });

        if (cancelled) return;
        const rows = (inquiries as unknown as RecentInquiry[]) ?? [];
        setAllInquiries(rows);
        setStats({
          total: rows.length,
          newRequests: rows.filter((r) => r.status === "new").length,
          awaiting: rows.filter(
            (r) => r.status === "new" || r.status === "drafted",
          ).length,
          booked: rows.filter((r) => r.status === "won").length,
        });

        // Raw rows that the chart panel turns into a 30-day area
        // chart, a rating distribution, and the funnel donut. We
        // pull rows (not just counts) so the visualisations can
        // bucket by day / star without an extra round-trip.
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const [{ data: viewData }, { data: reviewData }] = await Promise.all([
          supabase
            .from("vendor_profile_views")
            .select("viewed_at")
            .eq("vendor_id", vpRow.id)
            .gte("viewed_at", since.toISOString()),
          supabase
            .from("reviews")
            .select("rating")
            .eq("vendor_id", vpRow.id),
        ]);
        if (cancelled) return;
        setViewRows(
          (viewData as Array<{ viewed_at: string }> | null) ?? [],
        );
        setRatings(
          (reviewData as Array<{ rating: number }> | null) ?? [],
        );
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, membershipVendorId]);

  const greeting = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={t("dashboard.vendor.title")} backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            {loading ? (
              <Skeleton className="h-6 w-44 mb-1" />
            ) : (
              <h1 className="font-editorial text-3xl">
                {vendorProfile?.business_name ??
                  t("vendor_dashboard.header.welcome", { name: greeting })}
              </h1>
            )}
            <p className="text-sm text-muted-foreground">
              {vendorProfile?.category ??
                t("vendor_dashboard.header.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {vendorProfile?.verified_at && (
              <Badge className="bg-accent/15 text-accent border border-accent/30 hidden sm:flex">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                {t("vendor_dashboard.header.verified")}
              </Badge>
            )}
            <NotificationBell variant="light" />
          </div>
        </div>

        <div className="p-3 md:p-6 space-y-3 md:space-y-4">
          {/* The pending-application banner used to live here; dropped
              per request because the dashboard reads as a working
              vendor surface and the under-review state is already
              surfaced on the Profile / listing tab. Rejected still
              gets a banner below since that's actionable. */}
          {vendorProfile?.application_status === "rejected" && (
            <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {t("vendor_dashboard.header.application_rejected_title")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {vendorProfile.application_review_notes ??
                    t("vendor_dashboard.header.application_rejected_default")}
                </p>
              </div>
            </div>
          )}

          {/* Profile-not-yet-created state */}
          {!loading && !vendorProfile && (
            <div className="rounded-sm border border-accent/30 bg-accent/5 p-6 flex items-start gap-4">
              <div className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base mb-1">
                  {t("vendor_dashboard.header.setup_title")}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("vendor_dashboard.header.setup_body")}
                </p>
              </div>
              <Link to="/vendor/listing">
                <Button size="sm" className="rounded-full whitespace-nowrap">
                  {t("vendor_dashboard.header.complete_profile")}
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* Compact KPI strip — single bordered card, four cells
              divided by hairlines. Took the place of the 4-up tile
              grid that was wasting vertical space when the values
              were all "0". */}
          <div className="card-soft grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <KpiCell
              label={t("dashboard.vendor.stat_new_requests")}
              value={stats.newRequests}
              icon={Bell}
              accent
            />
            <KpiCell
              label={t("dashboard.customer.stat_awaiting")}
              value={stats.awaiting}
              icon={Clock}
            />
            <KpiCell
              label={t("dashboard.vendor.stat_won")}
              value={stats.booked}
              icon={CheckCircle2}
            />
            <KpiCell
              label={t("dashboard.customer.stat_inquiries")}
              value={stats.total}
              icon={Inbox}
            />
          </div>

          {/* Performance overview — funnel donut, 30-day views
              area chart, and per-star rating distribution. Replaces
              the older flat tile grid; same numbers, way more
              scannable at a glance. */}
          {vendorProfile && (
            <Suspense
              fallback={
                <div className="space-y-2 md:space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <Skeleton className="h-[140px] md:h-[180px] rounded-sm" />
                    <Skeleton className="h-[140px] md:h-[180px] rounded-sm" />
                    <Skeleton className="h-[140px] md:h-[180px] rounded-sm" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Skeleton className="h-[140px] md:h-[180px] rounded-sm" />
                    <Skeleton className="h-[140px] md:h-[180px] rounded-sm" />
                  </div>
                </div>
              }
            >
              <VendorPerformanceCharts
                inquiries={allInquiries}
                ratings={ratings}
                views={viewRows}
              />
            </Suspense>
          )}

          {/* Recent inquiries — Instagram-style edge-to-edge feed
              on mobile (no card border, full-bleed rows separated
              by hairlines). On md+ goes back to the bordered card
              treatment. */}
          <div className="md:bg-card md:rounded-sm md:border md:border-border md:p-4 -mx-3 md:mx-0">
            <div className="flex items-center justify-between mb-2 md:mb-3 px-3 md:px-0">
              <p className="font-label text-muted-foreground">
                {t("vendor_dashboard.recent.title")}
              </p>
              <Link
                to="/vendor/inbox"
                className="text-xs text-accent font-medium"
              >
                {t("vendor_dashboard.recent.view_all")}
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2 px-3 md:px-0">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : allInquiries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {t("vendor_dashboard.recent.empty")}
              </p>
            ) : (
              <div className="md:space-y-1.5 divide-y divide-border md:divide-y-0">
                {allInquiries.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    to={`/vendor/inbox/${r.id}`}
                    className="flex items-center gap-3 px-3 py-3 md:py-2 md:rounded-sm bg-card md:bg-secondary/40 hover:bg-secondary/70 transition-colors active:bg-secondary"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm md:text-xs font-medium truncate">
                        {r.host?.display_name ??
                          t("vendor_dashboard.recent.host")}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {r.event_type.replace("_", " ")}
                        {r.event_date && (
                          <>
                            {" · "}
                            <span className="tnum">{r.event_date}</span>
                          </>
                        )}
                        {r.guest_count != null && (
                          <>
                            {" · "}
                            {t("vendor_dashboard.recent.guests", {
                              count: r.guest_count,
                            })}
                          </>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${statusStyles[r.status] ?? ""}`}
                    >
                      {statusLabel[r.status] ?? r.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
