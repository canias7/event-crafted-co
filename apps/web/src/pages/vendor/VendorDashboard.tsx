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

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  subtitle,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="card-soft p-6 md:p-8 flex flex-col justify-between min-h-[140px]">
      <div className="flex items-start justify-between">
        <p className="font-label text-muted-foreground tracking-wider">{label}</p>
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
            accent ? "bg-accent/15 text-accent" : "bg-secondary/80 text-muted-foreground"
          }`}
        >
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <div>
        <p className="font-editorial text-5xl md:text-6xl tnum tracking-tight">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
        )}
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
  const currentHour = new Date().getHours();
  const timeGreeting = currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={t("dashboard.vendor.title")} backPath="/" />

      <main id="main-content" className="flex-1 pb-24 lg:pb-0">
        {/* Premium editorial header */}
        <header className="px-6 md:px-10 lg:px-14 pt-10 md:pt-14 pb-8 md:pb-12">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              {loading ? (
                <>
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-14 w-80" />
                </>
              ) : (
                <>
                  <p className="font-label text-muted-foreground tracking-widest">
                    {timeGreeting}
                  </p>
                  <h1 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-none">
                    {vendorProfile?.business_name ?? `Welcome, ${greeting}`}
                  </h1>
                  {vendorProfile?.category && (
                    <p className="text-base text-muted-foreground max-w-lg">
                      {vendorProfile.category}
                      {vendorProfile.location && ` · ${vendorProfile.location}`}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 pt-2">
              {vendorProfile?.verified_at && (
                <Badge className="bg-accent/15 text-accent border border-accent/30 hidden sm:flex rounded-full px-4 py-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 mr-2" />
                  Verified
                </Badge>
              )}
              <NotificationBell variant="light" />
            </div>
          </div>
        </header>

        <div className="px-6 md:px-10 lg:px-14 space-y-8 md:space-y-12">
          {/* Rejection banner */}
          {vendorProfile?.application_status === "rejected" && (
            <div className="card-soft p-6 flex items-start gap-4 border-destructive/20">
              <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-foreground">
                  {t("vendor_dashboard.header.application_rejected_title")}
                </p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {vendorProfile.application_review_notes ??
                    t("vendor_dashboard.header.application_rejected_default")}
                </p>
              </div>
            </div>
          )}

          {/* Profile setup CTA */}
          {!loading && !vendorProfile && (
            <div className="card-soft p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-editorial text-2xl md:text-3xl mb-2">
                  {t("vendor_dashboard.header.setup_title")}
                </h2>
                <p className="text-muted-foreground leading-relaxed max-w-xl">
                  {t("vendor_dashboard.header.setup_body")}
                </p>
              </div>
              <Link to="/vendor/listing" className="shrink-0">
                <Button size="lg" className="rounded-full px-8 gap-2">
                  {t("vendor_dashboard.header.complete_profile")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          )}

          {/* KPI cards - generous 4-up grid */}
          <section>
            <h2 className="font-editorial text-2xl md:text-3xl mb-6 md:mb-8">
              At a glance
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <StatCard
                label={t("dashboard.vendor.stat_new_requests")}
                value={stats.newRequests}
                icon={Bell}
                accent
                subtitle="Awaiting your response"
              />
              <StatCard
                label={t("dashboard.customer.stat_awaiting")}
                value={stats.awaiting}
                icon={Clock}
                subtitle="In progress"
              />
              <StatCard
                label={t("dashboard.vendor.stat_won")}
                value={stats.booked}
                icon={CheckCircle2}
                subtitle="Confirmed bookings"
              />
              <StatCard
                label={t("dashboard.customer.stat_inquiries")}
                value={stats.total}
                icon={Inbox}
                subtitle="All time"
              />
            </div>
          </section>

          {/* Performance charts - breathable layout */}
          {vendorProfile && (
            <section>
              <h2 className="font-editorial text-2xl md:text-3xl mb-6 md:mb-8">
                Performance
              </h2>
              <Suspense
                fallback={
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <Skeleton className="h-[200px] rounded-3xl" />
                      <Skeleton className="h-[200px] rounded-3xl" />
                      <Skeleton className="h-[200px] rounded-3xl" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Skeleton className="h-[200px] rounded-3xl" />
                      <Skeleton className="h-[200px] rounded-3xl" />
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
            </section>
          )}

          {/* Recent inquiries - editorial list */}
          <section className="pb-8">
            <div className="flex items-end justify-between mb-6 md:mb-8">
              <h2 className="font-editorial text-2xl md:text-3xl">
                {t("vendor_dashboard.recent.title")}
              </h2>
              <Link
                to="/vendor/inbox"
                className="text-sm text-accent font-medium hover:underline underline-offset-4"
              >
                {t("vendor_dashboard.recent.view_all")}
              </Link>
            </div>
            
            {loading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-3xl" />
                ))}
              </div>
            ) : allInquiries.length === 0 ? (
              <div className="card-soft p-12 text-center">
                <p className="text-muted-foreground">
                  {t("vendor_dashboard.recent.empty")}
                </p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {allInquiries.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    to={`/vendor/inbox/${r.id}`}
                    className="card-soft p-5 md:p-6 flex items-center gap-4 md:gap-6 hover:scale-[1.01] transition-transform duration-200"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base md:text-lg font-medium text-foreground truncate">
                        {r.host?.display_name ?? t("vendor_dashboard.recent.host")}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 capitalize">
                        {r.event_type.replace("_", " ")}
                        {r.event_date && (
                          <>
                            <span className="mx-2 opacity-40">·</span>
                            <span className="tnum">{r.event_date}</span>
                          </>
                        )}
                        {r.guest_count != null && (
                          <>
                            <span className="mx-2 opacity-40">·</span>
                            {t("vendor_dashboard.recent.guests", {
                              count: r.guest_count,
                            })}
                          </>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs px-4 py-1.5 rounded-full shrink-0 ${statusStyles[r.status] ?? ""}`}
                    >
                      {statusLabel[r.status] ?? r.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
