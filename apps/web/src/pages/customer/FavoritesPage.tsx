import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VENDORS_HUB_TABS } from "@/data/hubTabs";
import { MobileNav } from "@/components/shared/MobileNav";
import { VendorCard } from "@/components/shared/VendorCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { customerNavItems as navItems } from "@/data/navItems";
import { useSavedVendors } from "@/hooks/useSavedVendors";
import { type Vendor } from "@/hooks/useVendors";

const categoryImageFallback: Record<string, string> = {
  Photographer: "vendor-photographer",
  Videographer: "vendor-photographer",
  Florist: "vendor-florist",
  Catering: "vendor-catering",
  Baker: "vendor-catering",
  DJ: "vendor-dj",
  Venue: "vendor-venue",
  "Makeup Artist": "vendor-makeup",
  "Event Planner": "vendor-venue",
  Decorator: "vendor-florist",
};

interface VendorRow {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  base_price_cents: number | null;
  location: string | null;
  portfolio_summary: string | null;
  verified_at: string | null;
}

function normalize(row: VendorRow): Vendor {
  return {
    id: row.id,
    name: row.business_name,
    category: row.category,
    description:
      row.bio?.trim() ||
      row.portfolio_summary?.slice(0, 140).trim() ||
      `${row.category} on Vendora.`,
    rating: 0,
    reviews: 0,
    startingPrice:
      row.base_price_cents != null ? Math.round(row.base_price_cents / 100) : 0,
    distance: row.location ?? "",
    availability: row.verified_at ? "available" : "limited",
    image: categoryImageFallback[row.category] ?? "vendor-venue",
    location: row.location ?? undefined,
    isReal: true,
  };
}

export default function FavoritesPage() {
  const { user } = useAuth();
  const { savedIds, loading: savedLoading } = useSavedVendors();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || savedLoading) return;
    if (savedIds.size === 0) {
      setVendors([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, bio, base_price_cents, location, portfolio_summary, verified_at",
      )
      .in("id", Array.from(savedIds))
      .then(({ data }) => {
        if (cancelled) return;
        setVendors(((data as VendorRow[]) ?? []).map(normalize));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, savedIds, savedLoading]);

  const showLoading = savedLoading || loading;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-editorial text-3xl">Saved vendors</h1>
            <p className="text-sm text-muted-foreground">
              {savedIds.size === 0
                ? "Vendors you've saved while browsing will appear here"
                : `${savedIds.size} ${savedIds.size === 1 ? "vendor" : "vendors"} saved`}
            </p>
          </div>
          <SubNavTabs tabs={VENDORS_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8">
          {showLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/5] w-full rounded-sm mb-4" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <Heart className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-editorial text-3xl mb-2">
                No saved vendors yet
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Tap the heart on any vendor in the directory to save them here
                while you compare options.
              </p>
              <Link to="/vendors">
                <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                  Browse vendors
                  <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {vendors.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
