import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VendorCard } from "@/components/shared/VendorCard";
import { Skeleton } from "@/components/ui/skeleton";
import { customerNavItems } from "@/data/navItems";
import { VENDORS_HUB_TABS } from "@/data/hubTabs";
import { useVendors, type Vendor } from "@/hooks/useVendors";

const categories = ["All", "Photographer", "Florist", "Catering", "DJ", "Venue", "Makeup Artist"];

const sortOptions: Record<string, (a: Vendor, b: Vendor) => number> = {
  popular: (a, b) => b.reviews - a.reviews,
  rating: (a, b) => b.rating - a.rating,
  "price-low": (a, b) => a.startingPrice - b.startingPrice,
  "price-high": (a, b) => b.startingPrice - a.startingPrice,
};

export default function CustomerVendorsBrowsePage() {
  const { vendors, loading } = useVendors();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<keyof typeof sortOptions>("popular");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vendors
      .filter((v) => category === "All" || v.category === category)
      .filter(
        (v) =>
          term === "" ||
          v.name.toLowerCase().includes(term) ||
          v.category.toLowerCase().includes(term) ||
          v.description.toLowerCase().includes(term),
      )
      .sort(sortOptions[sort]);
  }, [vendors, search, category, sort]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={customerNavItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-display text-xl">Vendors</h1>
            <p className="text-sm text-muted-foreground">
              Browse our curated network without leaving your dashboard
            </p>
          </div>
          <SubNavTabs tabs={VENDORS_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search vendors, categories, or keywords…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 rounded-full bg-secondary/80 border-none"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full md:w-44 h-11 rounded-full bg-secondary/80 border-none">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as keyof typeof sortOptions)}>
              <SelectTrigger className="w-full md:w-44 h-11 rounded-full bg-secondary/80 border-none">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popular">Most reviewed</SelectItem>
                <SelectItem value="rating">Highest rated</SelectItem>
                <SelectItem value="price-low">Price: low to high</SelectItem>
                <SelectItem value="price-high">Price: high to low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No vendors match your filters yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((v, i) => (
                <VendorCard key={v.id} vendor={v} eager={i < 6} />
              ))}
            </div>
          )}
        </div>

        <MobileNav items={customerNavItems} />
      </main>
    </div>
  );
}