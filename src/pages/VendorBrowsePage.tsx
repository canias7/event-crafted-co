import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Store, X, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { SaveSearchButton } from "@/components/savedSearches/SaveSearchButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { categoryConfig } from "@/pages/VendorCategoryPage";
import heroBrowse from "@/assets/vendora-hero-cinematic.jpg";

const slugByCategory: Record<string, string> = Object.entries(categoryConfig).reduce(
  (acc, [slug, c]) => ({ ...acc, [c.name]: slug }),
  {} as Record<string, string>,
);

const categories = ["All", "Photographer", "Florist", "Catering", "DJ", "Venue", "Makeup Artist"];

const sortOptions: Record<string, (a: Vendor, b: Vendor) => number> = {
  popular: (a, b) => b.reviews - a.reviews,
  rating: (a, b) => b.rating - a.rating,
  "price-low": (a, b) => a.startingPrice - b.startingPrice,
  "price-high": (a, b) => b.startingPrice - a.startingPrice,
};

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorBrowsePage() {
  const { vendors, loading } = useVendors();
  const { profile, activeEvent } = useAuth();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(
    searchParams.get("category") ?? "All",
  );
  const [locationFilter, setLocationFilter] = useState<string>(
    searchParams.get("location") ?? "",
  );
  const [sort, setSort] = useState<keyof typeof sortOptions>("popular");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  // Pre-fill the date filter from the host's onboarding event_date once.
  const [datePrefilled, setDatePrefilled] = useState(false);
  useEffect(() => {
    const seed = activeEvent?.event_date ?? profile?.event_date ?? null;
    if (!datePrefilled && seed) {
      setDateFilter(seed);
      setDatePrefilled(true);
    }
  }, [profile, activeEvent, datePrefilled]);

  // Fetch the set of vendor_ids unavailable on the chosen date.
  useEffect(() => {
    if (!dateFilter) {
      setUnavailableIds(new Set());
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("vendor_unavailable_dates")
      .select("vendor_id")
      .eq("date", dateFilter)
      .then(({ data }: { data: Array<{ vendor_id: string }> | null }) => {
        if (cancelled) return;
        setUnavailableIds(new Set((data ?? []).map((r) => r.vendor_id)));
      });
    return () => {
      cancelled = true;
    };
  }, [dateFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const loc = locationFilter.trim().toLowerCase();
    return vendors
      .filter((v) => category === "All" || v.category === category)
      .filter(
        (v) =>
          loc === "" ||
          (v.location ?? v.distance ?? "").toLowerCase().includes(loc),
      )
      .filter(
        (v) =>
          term === "" ||
          v.name.toLowerCase().includes(term) ||
          v.category.toLowerCase().includes(term) ||
          v.description.toLowerCase().includes(term),
      )
      .filter((v) => !unavailableIds.has(v.id))
      .sort(sortOptions[sort]);
  }, [vendors, search, category, sort, unavailableIds, locationFilter]);

  const hiddenByDate =
    dateFilter && unavailableIds.size > 0
      ? vendors.filter((v) => unavailableIds.has(v.id)).length
      : 0;

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic hero strip */}
      <section className="relative h-[60svh] min-h-[440px] w-full overflow-hidden">
        <img
          src={heroBrowse}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/45 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/55 via-transparent to-foreground/20" />
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />

        <div className="relative z-10 h-full flex items-end pb-16 md:pb-24">
          <div className="container mx-auto px-6 md:px-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 }}
              className="flex items-center gap-4 mb-6"
            >
              <p className="font-label text-accent tracking-[0.4em]">— THE DIRECTORY</p>
              <span className="h-px w-8 bg-accent/40" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.3, duration: 0.9 }}
              className="text-hero font-display text-background leading-[1.0] max-w-3xl"
            >
              Find your{" "}
              <span className="italic font-light text-accent">people.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.55 }}
              className="text-base md:text-lg text-background/80 mt-6 max-w-md leading-relaxed font-light"
            >
              A curated network of photographers, florists, venues, caterers, and
              planners — hand-selected by our editorial team.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-border bg-background sticky top-16 z-30 backdrop-blur-sm bg-background/90">
        <div className="container mx-auto px-6 md:px-8 py-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search vendors, categories, or keywords…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 rounded-full bg-secondary/80 border-none focus-visible:ring-1 focus-visible:ring-accent"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full md:w-44 h-11 rounded-full bg-secondary/80 border-none">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full md:w-44">
              <Label htmlFor="date-filter" className="sr-only">
                Event date
              </Label>
              <Input
                id="date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                placeholder="Event date"
                className="h-11 rounded-full bg-secondary/80 border-none focus-visible:ring-1 focus-visible:ring-accent pr-9"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter("")}
                  aria-label="Clear date filter"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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

          {locationFilter && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground">Location:</span>
              <span className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full bg-foreground text-background text-xs font-medium">
                {locationFilter}
                <button
                  type="button"
                  onClick={() => setLocationFilter("")}
                  aria-label="Clear location filter"
                  className="hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-hide">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant="ghost"
                size="sm"
                onClick={() => setCategory(cat)}
                className={`rounded-full whitespace-nowrap h-8 text-xs tracking-wide transition-all ${
                  category === cat
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
              </Button>
            ))}
            <span className="ml-auto shrink-0 flex items-center gap-2">
              <Link to="/vendors/quiz">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs h-8 text-accent hover:text-accent hover:bg-accent/10"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Take the 60-sec match quiz
                </Button>
              </Link>
              <SaveSearchButton filters={{ q: search, category }} />
            </span>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-3">
            <div>
              <p className="font-label text-muted-foreground">
                {filtered.length}{" "}
                {filtered.length === 1 ? "vendor" : "vendors"}
                {category !== "All" && (
                  <span className="ml-2 text-foreground/80">· {category}</span>
                )}
                {dateFilter && (
                  <span className="ml-2 text-foreground/80">
                    · available {dateFilter}
                  </span>
                )}
              </p>
              {hiddenByDate > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {hiddenByDate}{" "}
                  {hiddenByDate === 1 ? "vendor" : "vendors"} hidden because
                  they're booked that day.
                </p>
              )}
            </div>
            {category !== "All" && slugByCategory[category] && (
              <Link
                to={`/vendors/category/${slugByCategory[category]}`}
                className="text-xs text-accent font-medium flex items-center gap-1 hover:underline"
              >
                View {category} page
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {vendors.length === 0 && loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/5] w-full rounded-sm mb-4" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
              {filtered.map((vendor, i) => (
                <motion.div
                  key={vendor.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: Math.min(i * 0.05, 0.4) }}
                >
                  <VendorCard vendor={vendor} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-24">
              <Store className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-display text-xl mb-2">No vendors found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Try a different search term or category. We're adding new vendors weekly.
              </p>
              <Button
                variant="outline"
                className="mt-6 rounded-full"
                onClick={() => {
                  setSearch("");
                  setCategory("All");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
