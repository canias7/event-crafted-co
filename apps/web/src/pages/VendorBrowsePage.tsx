import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Store, X, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { SaveSearchButton } from "@/components/savedSearches/SaveSearchButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { categoryConfig } from "@/pages/VendorCategoryPage";
import {
  CATEGORY_GROUPS,
  ALL_SUBS,
  groupOfSub,
} from "@/data/categoryTaxonomy";
import { Picture } from "@/components/shared/Picture";
import heroBrowse from "@/assets/vendora-hero-cinematic.jpg?as=picture";
import { CompareBar } from "@/components/shared/CompareBar";

// Sub-name → group-slug. Used to deep-link from a single-sub filter to
// the parent group page (e.g. "Photography" → "/vendors/category/media").
const slugByCategory: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const g of CATEGORY_GROUPS) {
    for (const sub of g.subs) map[sub] = g.slug;
  }
  return map;
})();

// Filter options: every sub-category (no "All" pseudo-option here —
// the dropdown trigger handles "All" via the empty selection state).
const categories = ["All", ...ALL_SUBS];

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

  // Multi-category filter. URL ?category=A,B,C parses into a Set.
  // Empty Set === "All". Hydrates from sessionStorage if the quiz set
  // categories there and the URL didn't carry them.
  const initialCategories = (() => {
    const fromUrl = searchParams.get("category");
    if (fromUrl) {
      return new Set(
        fromUrl
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    if (typeof sessionStorage !== "undefined") {
      try {
        const raw = sessionStorage.getItem("vendora-quiz-answers");
        if (raw) {
          const ans = JSON.parse(raw) as { categories?: string[] };
          if (Array.isArray(ans.categories) && ans.categories.length > 0) {
            return new Set(ans.categories);
          }
        }
      } catch {
        /* ignore */
      }
    }
    return new Set<string>();
  })();
  const [activeCategories, setActiveCategories] =
    useState<Set<string>>(initialCategories);
  // Single-category state kept for the dropdown's controlled value;
  // mirrors the first active category, "All" when none.
  const category = activeCategories.size === 1
    ? Array.from(activeCategories)[0]
    : "All";

  const [locationFilter, setLocationFilter] = useState<string>(
    searchParams.get("location") ?? "",
  );
  const [sort, setSort] = useState<keyof typeof sortOptions>("popular");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  function toggleCategory(cat: string) {
    if (cat === "All") {
      setActiveCategories(new Set());
      return;
    }
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function setCategory(cat: string) {
    if (cat === "All") setActiveCategories(new Set());
    else setActiveCategories(new Set([cat]));
  }

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
  // Two sources: one-off blocks (vendor_unavailable_dates) AND
  // recurring weekly rules where the picked day-of-week is marked
  // unavailable. Client-side union; RLS public-reads both tables.
  useEffect(() => {
    if (!dateFilter) {
      setUnavailableIds(new Set());
      return;
    }
    let cancelled = false;
    const dow = new Date(`${dateFilter}T00:00:00`).getDay();
    Promise.all([
      supabase
        .from("vendor_unavailable_dates")
        .select("vendor_id")
        .eq("date", dateFilter),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_availability_rules")
        .select("vendor_id")
        .eq("day_of_week", dow)
        .eq("is_unavailable", true),
    ]).then(([oneOff, recurring]) => {
      if (cancelled) return;
      const ids = new Set<string>();
      for (const r of (oneOff.data ?? []) as Array<{ vendor_id: string }>) {
        ids.add(r.vendor_id);
      }
      for (const r of (recurring.data ?? []) as Array<{ vendor_id: string }>) {
        ids.add(r.vendor_id);
      }
      setUnavailableIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [dateFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const loc = locationFilter.trim().toLowerCase();
    return vendors
      .filter(
        (v) => activeCategories.size === 0 || activeCategories.has(v.category),
      )
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
  }, [vendors, search, activeCategories, sort, unavailableIds, locationFilter]);

  const hiddenByDate =
    dateFilter && unavailableIds.size > 0
      ? vendors.filter((v) => unavailableIds.has(v.id)).length
      : 0;

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic hero strip */}
      <section className="relative h-[60svh] min-h-[440px] w-full overflow-hidden">
        <div className="absolute inset-0">
          <Picture
            source={heroBrowse}
            alt=""
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            className="w-full h-full object-cover"
          />
        </div>
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
            {/* Category multi-select. Replaces an old single-select +
                horizontal pill row with one consistent dropdown — same
                pattern as the public-nav Vendors menu. Shows count when
                multiple are picked, single name when one. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-full md:w-44 h-11 rounded-full bg-secondary/80 px-4 inline-flex items-center justify-between text-sm font-medium hover:bg-secondary transition-colors"
                >
                  <span className="truncate">
                    {activeCategories.size === 0
                      ? "All categories"
                      : activeCategories.size === 1
                        ? Array.from(activeCategories)[0]
                        : `${activeCategories.size} categories`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 ml-2 shrink-0" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-64 max-h-[70vh] overflow-y-auto"
              >
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Filter by category
                </DropdownMenuLabel>
                {activeCategories.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveCategories(new Set())}
                      className="w-full text-left px-2 py-1.5 text-xs text-accent hover:bg-accent/10 rounded-sm"
                    >
                      Clear all selections
                    </button>
                    <DropdownMenuSeparator />
                  </>
                )}
                {CATEGORY_GROUPS.map((group, gi) => (
                  <div key={group.slug}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {group.name}
                    </DropdownMenuLabel>
                    {group.subs.map((sub) => (
                      <DropdownMenuCheckboxItem
                        key={sub}
                        checked={activeCategories.has(sub)}
                        onCheckedChange={() => toggleCategory(sub)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {sub}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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

          {/* Active-category chips for visibility when multiple are
              picked. Click X to remove individual filters. */}
          {activeCategories.size > 0 && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {Array.from(activeCategories).map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-foreground text-background text-xs font-medium"
                >
                  {cat}
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    aria-label={`Remove ${cat} filter`}
                    className="hover:opacity-70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
            <div className="flex items-center gap-2 flex-wrap">
              {category !== "All" && slugByCategory[category] && (
                <Link
                  to={`/vendors/category/${slugByCategory[category]}`}
                  className="text-xs text-accent font-medium flex items-center gap-1 hover:underline"
                >
                  View {groupOfSub(category) ?? category} page
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
              <SaveSearchButton filters={{ q: search, category }} />
            </div>
          </div>

          {vendors.length === 0 && loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/3] w-full rounded-sm mb-3" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {filtered.map((vendor, i) => (
                <motion.div
                  key={vendor.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: Math.min(i * 0.05, 0.4) }}
                >
                  <VendorCard vendor={vendor} eager={i < 6} />
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
      <CompareBar />
    </div>
  );
}
