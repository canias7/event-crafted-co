import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Inbox,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { StatCard } from "@/components/shared/StatCard";
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

const profileFieldsForCompleteness: Array<keyof VendorProfile> = [
  "business_name",
  "category",
  "bio",
  "base_price_cents",
  "location",
  "service_radius_miles",
  "portfolio_summary",
];

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

function fmtMoney(c: number | null) {
  return c == null ? "—" : `$${(c / 100).toLocaleString()}`;
}

export default function VendorDashboard() {
  const { user, profile } = useAuth();
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [stats, setStats] = useState({
    newRequests: 0,
    awaiting: 0,
    booked: 0,
    total: 0,
  });
  const [insights, setInsights] = useState({
    views30d: 0,
    avgRating: 0,
    reviewCount: 0,
  });
  const [recent, setRecent] = useState<RecentInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: vp } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at",
        )
        .eq("user_id", user.id)
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
        setStats({
          total: rows.length,
          newRequests: rows.filter((r) => r.status === "new").length,
          awaiting: rows.filter(
            (r) => r.status === "new" || r.status === "drafted",
          ).length,
          booked: rows.filter((r) => r.status === "won").length,
        });
        setRecent(rows.slice(0, 5));

        // Insights: views (last 30 days) + reviews aggregate
        const since = new Date();
        since.setDate(since.getDate() - 30);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [{ count: viewCount }, { data: reviews }] = await Promise.all([
          (supabase as any)
            .from("vendor_profile_views")
            .select("id", { count: "exact", head: true })
            .eq("vendor_id", vpRow.id)
            .gte("viewed_at", since.toISOString()),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("reviews")
            .select("rating")
            .eq("vendor_id", vpRow.id),
        ]);
        if (cancelled) return;
        const ratingRows =
          (reviews as Array<{ rating: number }> | null) ?? [];
        setInsights({
          views30d: viewCount ?? 0,
          reviewCount: ratingRows.length,
          avgRating:
            ratingRows.length === 0
              ? 0
              : ratingRows.reduce((s, r) => s + r.rating, 0) /
                ratingRows.length,
        });
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const completeness = vendorProfile
    ? Math.round(
        (profileFieldsForCompleteness.filter(
          (f) => vendorProfile[f] != null && vendorProfile[f] !== "",
        ).length /
          profileFieldsForCompleteness.length) *
          100,
      )
    : 0;

  const greeting = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            {loading ? (
              <Skeleton className="h-6 w-44 mb-1" />
            ) : (
              <h1 className="font-display text-xl">
                {vendorProfile?.business_name ?? `Welcome, ${greeting}`}
              </h1>
            )}
            <p className="text-sm text-muted-foreground">
              {vendorProfile?.category ?? "Vendor dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {vendorProfile?.verified_at ? (
              <Badge className="bg-accent/15 text-accent border border-accent/30 hidden sm:flex">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                Verified
              </Badge>
            ) : vendorProfile ? (
              <Badge variant="outline" className="hidden sm:flex">
                Pending review
              </Badge>
            ) : null}
            {vendorProfile && (
              <Link to={`/vendors/${vendorProfile.id}`} target="_blank">
                <Button variant="outline" size="sm" className="rounded-full hidden sm:inline-flex">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Preview
                </Button>
              </Link>
            )}
            <Button variant="outline" size="sm" className="h-9">
              <Bell className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-8">
          {/* Profile-not-yet-created state */}
          {!loading && !vendorProfile && (
            <div className="rounded-sm border border-accent/30 bg-accent/5 p-6 flex items-start gap-4">
              <div className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base mb-1">
                  Set up your business profile
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Hosts can't find you yet — finish your profile to start
                  receiving inquiries.
                </p>
              </div>
              <Link to="/vendor/profile">
                <Button size="sm" className="rounded-full whitespace-nowrap">
                  Complete profile
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="New requests"
              value={stats.newRequests}
              icon={Bell}
              accent
            />
            <StatCard
              label="Awaiting reply"
              value={stats.awaiting}
              icon={Clock}
            />
            <StatCard
              label="Booked"
              value={stats.booked}
              icon={CheckCircle2}
            />
            <StatCard
              label="Total inquiries"
              value={stats.total}
              icon={Inbox}
            />
          </div>

          {/* Insights */}
          {vendorProfile && (
            <div>
              <p className="font-label text-muted-foreground mb-3">Insights</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-sm border border-border bg-card px-5 py-4">
                  <p className="font-label text-muted-foreground">
                    Views · 30d
                  </p>
                  <p className="font-display text-2xl tnum mt-1">
                    {insights.views30d}
                  </p>
                </div>
                <div className="rounded-sm border border-border bg-card px-5 py-4">
                  <p className="font-label text-muted-foreground">
                    Conversion
                  </p>
                  <p className="font-display text-2xl tnum mt-1">
                    {stats.total > 0
                      ? `${Math.round((stats.booked / stats.total) * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Booked / inquired
                  </p>
                </div>
                <div className="rounded-sm border border-border bg-card px-5 py-4">
                  <p className="font-label text-muted-foreground">
                    Avg rating
                  </p>
                  <p className="font-display text-2xl tnum mt-1">
                    {insights.reviewCount > 0
                      ? insights.avgRating.toFixed(1)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-sm border border-border bg-card px-5 py-4">
                  <p className="font-label text-muted-foreground">Reviews</p>
                  <p className="font-display text-2xl tnum mt-1">
                    {insights.reviewCount}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Profile completeness */}
          {vendorProfile && completeness < 100 && (
            <div className="bg-card rounded-sm border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-label text-muted-foreground">
                  Profile completeness
                </p>
                <span className="text-sm font-medium tnum">{completeness}%</span>
              </div>
              <Progress value={completeness} className="h-2 mb-3" />
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Add a richer bio, pricing, and portfolio summary to help
                  hosts and the AI agent.
                </p>
                <Link to="/vendor/profile">
                  <Button variant="outline" size="sm" className="rounded-full">
                    Edit profile
                  </Button>
                </Link>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Inbox shortcut */}
            <Link
              to="/vendor/inbox"
              className="bg-card rounded-sm p-5 border border-border hover:border-accent/50 transition-colors block"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-label text-muted-foreground">Inquiry inbox</p>
                <span className="text-xs text-accent font-medium">
                  Open inbox →
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Inbox className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-display text-2xl">
                    {stats.newRequests > 0
                      ? `${stats.newRequests} new`
                      : "All caught up"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Review host inquiries and approve AI-drafted replies.
                  </p>
                </div>
              </div>
            </Link>

            {/* Recent inquiries */}
            <div className="bg-card rounded-sm border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-label text-muted-foreground">
                  Recent inquiries
                </p>
                <Link
                  to="/vendor/inbox"
                  className="text-xs text-accent font-medium"
                >
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No inquiries yet — they'll appear here as hosts reach out.
                </p>
              ) : (
                <div className="space-y-3">
                  {recent.map((r) => (
                    <Link
                      key={r.id}
                      to={`/vendor/inbox/${r.id}`}
                      className="flex items-center gap-3 p-3 rounded-sm bg-secondary/40 hover:bg-secondary/70 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.host?.display_name ?? "Host"}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
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
                              <span className="tnum">{r.guest_count}</span>{" "}
                              guests
                            </>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={statusStyles[r.status] ?? ""}
                      >
                        {statusLabel[r.status] ?? r.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
