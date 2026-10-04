import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Store, X, ArrowRight, ChevronDown, MapPin, CalendarDays, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Picture } from "@/components/shared/Picture";
import heroGala from "@/assets/vendora-hero-gala.jpg?as=picture";
import { VendorCard } from "@/components/shared/VendorCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { categoryConfig } from "@/pages/VendorCategoryPage";
import {
  CATEGORY_GROUPS,
  ALL_SUBS,
  groupOfSub,
} from "@/data/categoryTaxonomy";

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

const INK = "#14161a";
const CREAM = "#f4f1ea";
const GOLD = "#c9a86a";

// Quick-pick chips under the hero. Each one is a set of sub-categories
// (the DB stores sub names); "More filters" opens the full list.
const subsOf = (slug: string) =>
  CATEGORY_GROUPS.find((g) => g.slug === slug)?.subs ?? [];
const QUICK_CHIPS: { label: string; subs: string[] }[] = [
  { label: "Photography", subs: subsOf("media") },
  { label: "Venues", subs: subsOf("venues") },
  { label: "Beauty", subs: ["Beauty", "Grooming Services"] },
  { label: "Planning", subs: ["Event Coordinators"] },
  { label: "Catering", subs: subsOf("food-beverage") },
];
const sameSet = (a: Set<string>, b: string[]) =>
  a.size === b.length && b.every((x) => a.has(x));

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
  const [dateFocused, setDateFocused] = useState(false);
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

  // Date filter prefill removed when host_events was dropped — the
  // legacy multi-event hint isn't queried anymore. Filter defaults to
  // empty.

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

  const activeChip = QUICK_CHIPS.find((c) => sameSet(activeCategories, c.subs));
  const chipClass = (selected: boolean) =>
    `inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-5 text-[14px] font-bold transition-colors ${
      selected
        ? "bg-primary text-primary-foreground"
        : "border border-border bg-white text-foreground hover:border-foreground/30"
    }`;

  function scrollToResults(e: React.FormEvent) {
    e.preventDefault();
    document.getElementById("vendor-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: CREAM }}>
      {/* ═══════ HERO — photo, matching the landing page ═══════ */}
      <section className="relative overflow-hidden" style={{ backgroundColor: INK }}>
        <div className="absolute inset-0">
          <Picture
            source={heroGala}
            alt=""
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            className="h-full w-full object-cover"
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,11,14,0.62) 0%, rgba(10,11,14,0.4) 40%, rgba(10,11,14,0.55) 75%, rgba(16,14,10,0.85) 100%)",
          }}
        />

        <PublicNav tone="overlay" />

        <div className="container relative z-10 mx-auto px-5 pb-10 pt-4 md:px-8 md:pb-14 md:pt-8">
          <div className="text-center lg:text-left">
            <h1
              className="hero-headline m-0 mx-auto max-w-3xl lg:mx-0"
              style={{
                color: CREAM,
                fontSize: "clamp(40px, 6.4vw, 72px)",
                lineHeight: 1.04,
                letterSpacing: "-1.5px",
              }}
            >
              Find your
              <br />
              <span style={{ color: GOLD }}>unforgettable.</span>
            </h1>
            <p
              className="hero-intro mx-auto mt-4 max-w-lg text-[15px] leading-relaxed md:text-lg lg:mx-0"
              style={{ color: "rgba(244,241,234,0.85)" }}
            >
              Meet the vendors who bring your vision to life.
            </p>
          </div>

          {/* Search card */}
          <form
            onSubmit={scrollToResults}
            className="mt-8 flex flex-col gap-2 rounded-2xl p-2 md:flex-row md:items-center"
            style={{ backgroundColor: "rgba(251,249,244,0.97)" }}
          >
            <label className="flex h-12 flex-1 items-center gap-2.5 px-3 md:h-11">
              <Search className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="sr-only">Search vendors or services</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendors or services"
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-placeholder"
                style={{ color: INK }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="text-foreground hover:text-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <label className="flex h-12 items-center gap-2.5 border-t border-border px-3 md:h-11 md:w-56 md:border-l md:border-t-0">
              <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="sr-only">Location</span>
              <input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Location"
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-placeholder"
                style={{ color: INK }}
              />
              {locationFilter && (
                <button
                  type="button"
                  onClick={() => setLocationFilter("")}
                  aria-label="Clear location filter"
                  className="text-foreground hover:text-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <label
              htmlFor="date-filter"
              className="flex h-12 items-center gap-2.5 border-t border-border px-3 md:h-11 md:w-56 md:border-l md:border-t-0"
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="sr-only">Event date</span>
              {/* Text until used, so it reads "Event date" rather than the
                  browser's mm/dd/yyyy; becomes a date picker on focus. */}
              <input
                id="date-filter"
                type={dateFilter || dateFocused ? "date" : "text"}
                value={dateFilter}
                placeholder="Event date"
                onFocus={(e) => {
                  setDateFocused(true);
                  const el = e.currentTarget;
                  requestAnimationFrame(() => {
                    try {
                      el.showPicker?.();
                    } catch {
                      /* not allowed without a click on some browsers */
                    }
                  });
                }}
                onBlur={() => setDateFocused(false)}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-placeholder"
                style={{ color: INK }}
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter("")}
                  aria-label="Clear date filter"
                  className="text-foreground hover:text-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <Button type="submit" size="lg" className="shrink-0 gap-2">
              Find vendors
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>

      {/* ═══════ FILTERS + RESULTS ═══════ */}
      <section id="vendor-results" className="scroll-mt-4 py-8 md:py-10">
        <div className="container mx-auto px-5 md:px-8">
          {/* Category chips + More filters */}
          <div className="flex items-center gap-3">
            <div className="no-scrollbar -ml-5 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pl-5 md:ml-0 md:pl-0">
              <button
                type="button"
                onClick={() => setActiveCategories(new Set())}
                className={chipClass(activeCategories.size === 0)}
                aria-pressed={activeCategories.size === 0}
              >
                All vendors
              </button>
              {QUICK_CHIPS.map((c) => {
                const selected = activeChip?.label === c.label;
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setActiveCategories(new Set(c.subs))}
                    className={chipClass(selected)}
                    aria-pressed={selected}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <span className="hidden h-8 w-px shrink-0 bg-border md:block" aria-hidden />
            {/* Full category list, multi-select. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More filters"
                  className={`${chipClass(false)} gap-2 !px-4 md:!px-5`}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  <span className="hidden md:inline">
                    {activeCategories.size > 0 && !activeChip
                      ? `${activeCategories.size} selected`
                      : "More filters"}
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 md:block" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
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
          </div>

          {/* Picks from "More filters" that aren't a quick chip. */}
          {activeCategories.size > 0 && !activeChip && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {Array.from(activeCategories).map((cat) => (
                <span
                  key={cat}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary px-2.5 text-xs font-bold text-primary-foreground"
                >
                  {cat}
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    aria-label={`Remove ${cat} filter`}
                    className="hover:text-gold"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Heading + sort */}
          <div className="mt-8 flex flex-wrap items-end justify-between gap-3 md:mt-10">
            <div>
              <h2 className="m-0 font-editorial text-[32px] leading-tight md:text-[44px]">
                Discover vendors
              </h2>
              {hiddenByDate > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {hiddenByDate}{" "}
                  {hiddenByDate === 1 ? "vendor" : "vendors"} hidden because
                  they're booked that day.
                </p>
              )}
              {category !== "All" && slugByCategory[category] && (
                <Link
                  to={`/vendors/category/${slugByCategory[category]}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                >
                  View {groupOfSub(category) ?? category} page
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as keyof typeof sortOptions)}>
                <SelectTrigger
                  aria-label="Sort vendors"
                  className="h-11 w-44 rounded-full border-border bg-white px-4"
                >
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
          </div>

          <div className="mt-6">
          {vendors.length === 0 && loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-2">
                  <Skeleton className="aspect-[4/3] w-full rounded-xl" />
                  <div className="space-y-2 px-3 pb-3 pt-4">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {filtered.map((vendor, i) => (
                <motion.div
                  key={vendor.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: Math.min(i * 0.05, 0.4) }}
                >
                  <VendorCard vendor={vendor} eager={i < 4} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-24">
              <Store className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-editorial text-2xl mb-2">No vendors found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Try a different search term or category. We're adding new vendors weekly.
              </p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => {
                  setSearch("");
                  setLocationFilter("");
                  setDateFilter("");
                  setCategory("All");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
