import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Store,
  MessageSquare,
  Star,
  ShieldCheck,
  ArrowRight,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { StatCard } from "@/components/shared/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { adminNavItems as navItems } from "@/data/navItems";
import { formatDate } from "@/lib/format";
import { useTranslation } from "react-i18next";

interface Counts {
  vendors: number;
  vendorsVerified: number;
  hosts: number;
  inquiriesTotal: number;
  inquiriesNew: number;
  reviewsTotal: number;
  avgRating: number;
}

interface RecentVendor {
  id: string;
  business_name: string;
  category: string;
  location: string | null;
  verified_at: string | null;
  created_at: string;
}

interface RecentInquiry {
  id: string;
  event_type: string;
  status: string;
  created_at: string;
  vendor: { business_name: string } | null;
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recentVendors, setRecentVendors] = useState<RecentVendor[]>([]);
  const [recentInquiries, setRecentInquiries] = useState<RecentInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [
        vendorsAll,
        vendorsVerified,
        hosts,
        inquiriesAll,
        inquiriesNew,
        reviews,
        recentV,
        recentI,
      ] = await Promise.all([
        supabase.from("vendor_profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("vendor_profiles")
          .select("id", { count: "exact", head: true })
          .not("verified_at", "is", null),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "host"),
        supabase.from("inquiries").select("id", { count: "exact", head: true }),
        supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .eq("status", "new"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("reviews").select("rating"),
        supabase
          .from("vendor_profiles")
          .select("id, business_name, category, location, verified_at, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("inquiries")
          .select(
            "id, event_type, status, created_at, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name)",
          )
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (cancelled) return;
      const ratings =
        (reviews.data as Array<{ rating: number }> | null) ?? [];

      setCounts({
        vendors: vendorsAll.count ?? 0,
        vendorsVerified: vendorsVerified.count ?? 0,
        hosts: hosts.count ?? 0,
        inquiriesTotal: inquiriesAll.count ?? 0,
        inquiriesNew: inquiriesNew.count ?? 0,
        reviewsTotal: ratings.length,
        avgRating:
          ratings.length === 0
            ? 0
            : ratings.reduce((s, r) => s + r.rating, 0) / ratings.length,
      });
      setRecentVendors((recentV.data as RecentVendor[]) ?? []);
      setRecentInquiries((recentI.data as unknown as RecentInquiry[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={t("dashboard.admin.title")} backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Real numbers across the platform
          </p>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          {/* Stats */}
          {loading || !counts ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-sm" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Vendors"
                value={counts.vendors}
                icon={Store}
                trend={`${counts.vendorsVerified} verified`}
              />
              <StatCard label="Hosts" value={counts.hosts} icon={Users} />
              <StatCard
                label="New inquiries"
                value={counts.inquiriesNew}
                icon={MessageSquare}
                accent
                trend={`${counts.inquiriesTotal} total`}
              />
              <StatCard
                label="Avg rating"
                value={
                  counts.reviewsTotal > 0
                    ? counts.avgRating.toFixed(1)
                    : "—"
                }
                icon={Star}
                trend={`${counts.reviewsTotal} reviews`}
              />
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Recent vendors */}
            <div className="bg-card border border-border rounded-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-label text-muted-foreground">
                  Newest vendors
                </p>
                <Link
                  to="/admin/vendors"
                  className="text-xs text-accent font-medium flex items-center gap-1 hover:underline"
                >
                  All vendors
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : recentVendors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No vendors yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentVendors.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 p-3 rounded-sm bg-secondary/40"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {v.business_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {v.category}
                          {v.location && ` · ${v.location}`}
                        </p>
                      </div>
                      {v.verified_at ? (
                        <Badge className="bg-accent/15 text-accent border border-accent/30">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent inquiries */}
            <div className="bg-card border border-border rounded-sm p-5">
              <p className="font-label text-muted-foreground mb-4">
                Recent inquiries
              </p>
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : recentInquiries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No inquiries yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentInquiries.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 p-3 rounded-sm bg-secondary/40"
                    >
                      <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate capitalize">
                          {r.event_type.replace("_", " ")} →{" "}
                          {r.vendor?.business_name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground tnum">
                          {formatDate(r.created_at, "short")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {r.status}
                      </Badge>
                    </div>
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
