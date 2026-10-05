import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Search, Store, X, ArrowRight, MapPin, CalendarDays, SlidersHorizontal } from "lucide-react";
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
import { ClosingBand } from "@/components/public/PhotoHero";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import heroGala from "@/assets/vendora-hero-gala.jpg?as=picture";
import tilePhotography from "@/assets/categories/photography.jpg?as=picture";
import tileVenues from "@/assets/categories/venues.jpg?as=picture";
import tileCatering from "@/assets/categories/catering.jpg?as=picture";
import tileBeauty from "@/assets/categories/beauty.jpg?as=picture";
import tilePlanning from "@/assets/categories/planning.jpg?as=picture";
import tileDecor from "@/assets/categories/decor.jpg?as=picture";
import tileEntertainment from "@/assets/categories/entertainment.jpg?as=picture";
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
import { BROWSE_CATEGORIES } from "@/data/browseCategories";
import { useCategoryNames } from "@/lib/categoryNames";

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

// Category photo tiles under the hero (the same seven categories as
// Explore's menu); "More filters" opens the full list. Labels stay
// English here (they're the keys); the visitor's language is applied
// when they're shown.
const TILE_IMAGES: Record<string, PictureSource> = {
  Photography: tilePhotography,
  Venues: tileVenues,
  Catering: tileCatering,
  Beauty: tileBeauty,
  Planning: tilePlanning,
  "Decor & florals": tileDecor,
  Entertainment: tileEntertainment,
};
const TILES = BROWSE_CATEGORIES.map((c) => ({ ...c, image: TILE_IMAGES[c.label] }));
const sameSet = (a: Set<string>, b: string[]) =>
  a.size === b.length && b.every((x) => a.has(x));

export default function VendorBrowsePage() {
  const { t, i18n } = useTranslation("vendors");
  const categoryNames = useCategoryNames();
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

  const activeTile = TILES.find((tile) => sameSet(activeCategories, tile.subs));
  const pill =
    "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.04] px-4 text-[14px] font-bold text-[#f4f1ea] transition-colors hover:border-white/40";

  // What's narrowing the list, as removable pills in the filter bar.
  const activeFilters: { label: string; clear: () => void }[] = [
    ...(activeTile
      ? [{ label: categoryNames.browse(activeTile.label), clear: () => setActiveCategories(new Set()) }]
      : Array.from(activeCategories).map((cat) => ({ label: categoryNames.sub(cat), clear: () => toggleCategory(cat) }))),
    ...(search.trim() ? [{ label: `"${search.trim()}"`, clear: () => setSearch("") }] : []),
    ...(locationFilter.trim() ? [{ label: locationFilter.trim(), clear: () => setLocationFilter("") }] : []),
    ...(dateFilter
      ? [{ label: new Date(`${dateFilter}T00:00:00`).toLocaleDateString(i18n.language, { month: "short", day: "numeric", year: "numeric" }), clear: () => setDateFilter("") }]
      : []),
  ];

  function clearAll() {
    setSearch("");
    setLocationFilter("");
    setDateFilter("");
    setActiveCategories(new Set());
  }

  function scrollToResults(e: React.FormEvent) {
    e.preventDefault();
    document.getElementById("vendor-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: INK }}>
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
              "linear-gradient(180deg, rgba(10,11,14,0.62) 0%, rgba(10,11,14,0.4) 40%, rgba(20,22,26,0.7) 78%, rgb(20,22,26) 100%)",
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
              <Trans
                t={t}
                i18nKey="hero.title"
                components={{ br: <br />, gold: <span style={{ color: GOLD }} /> }}
              />
            </h1>
            <p
              className="hero-intro mx-auto mt-4 max-w-lg text-[15px] leading-relaxed md:text-lg lg:mx-0"
              style={{ color: "rgba(244,241,234,0.85)" }}
            >
              {t("hero.intro")}
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
              <span className="sr-only">{t("search.label")}</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("search.placeholder")}
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-placeholder"
                style={{ color: INK }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t("search.clear")}
                  className="text-foreground hover:text-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <label className="flex h-12 items-center gap-2.5 border-t border-border px-3 md:h-11 md:w-56 md:border-l md:border-t-0">
              <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="sr-only">{t("search.location")}</span>
              <input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder={t("search.location")}
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-placeholder"
                style={{ color: INK }}
              />
              {locationFilter && (
                <button
                  type="button"
                  onClick={() => setLocationFilter("")}
                  aria-label={t("search.clearLocation")}
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
              <span className="sr-only">{t("search.date")}</span>
              {/* Text until used, so it reads "Event date" rather than the
                  browser's mm/dd/yyyy; becomes a date picker on focus. */}
              <input
                id="date-filter"
                type={dateFilter || dateFocused ? "date" : "text"}
                value={dateFilter}
                placeholder={t("search.date")}
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
                  aria-label={t("search.clearDate")}
                  className="text-foreground hover:text-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <Button type="submit" size="lg" className="shrink-0 gap-2">
              {t("search.submit")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>

      <main id="main-content">
        {/* ═══════ BROWSE BY CATEGORY — photo tiles ═══════ */}
        <section className="container mx-auto px-5 pt-8 md:px-8 md:pt-10">
          <div className="flex items-end justify-between gap-3">
            <h2 className="m-0 text-[26px] leading-tight md:text-[34px]">{t("browse.title")}</h2>
            {activeCategories.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategories(new Set())}
                className="inline-flex h-9 items-center gap-1.5 text-[14px] font-bold text-gold transition-colors hover:text-white"
              >
                {t("browse.allVendors")} <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="no-scrollbar -mx-5 mt-6 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:-mx-8 md:scroll-px-8 md:px-8 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0">
            {TILES.map((tile) => {
              const selected = activeTile?.label === tile.label;
              return (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => setActiveCategories(selected ? new Set() : new Set(tile.subs))}
                  aria-pressed={selected}
                  className={`group relative aspect-[4/5] w-[42vw] max-w-[200px] shrink-0 snap-start overflow-hidden rounded-2xl text-left outline-none ring-offset-[#14161a] transition-shadow focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 sm:w-[30vw] lg:w-auto lg:max-w-none ${
                    selected ? "ring-2 ring-gold ring-offset-2" : ""
                  }`}
                >
                  <Picture
                    source={tile.image}
                    alt=""
                    sizes="(min-width: 1024px) 14vw, 42vw"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  />
                  <span
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(180deg, rgba(10,11,14,0) 40%, rgba(10,11,14,0.85) 100%)" }}
                    aria-hidden
                  />
                  <span
                    className={`absolute inset-x-3 bottom-3 text-[15px] font-bold leading-tight transition-colors ${
                      selected ? "text-gold" : "text-[#f4f1ea]"
                    }`}
                  >
                    {categoryNames.browse(tile.label)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ═══════ RESULTS ═══════ */}
        <section id="vendor-results" className="scroll-mt-2 pt-12 md:pt-16">
          <div className="container mx-auto px-5 md:px-8">
            <h2 className="m-0 text-[32px] leading-tight md:text-[44px]">{t("results.title")}</h2>
            {hiddenByDate > 0 && (
              <p className="m-0 mt-2 text-[14px] text-[#f4f1ea]/80">
                {t("results.hiddenByDate", { count: hiddenByDate })}
              </p>
            )}
            {category !== "All" && slugByCategory[category] && (
              <Link
                to={`/vendors/category/${slugByCategory[category]}`}
                className="mt-2 inline-flex items-center gap-1 text-[14px] font-bold text-gold hover:text-white"
              >
                {t("results.viewGroupPage", {
                  group: categoryNames.group(slugByCategory[category], groupOfSub(category) ?? category),
                })}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {/* Filter bar: stays at the top while you scroll the results. */}
          <div className="sticky top-0 z-30 mt-6 border-y border-white/10 bg-[#14161a]/90 backdrop-blur-md">
            <div className="container mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 md:flex-nowrap md:px-8">
              <p className="m-0 mr-auto shrink-0 text-[14px] font-bold md:mr-0">
                {loading && vendors.length === 0 ? t("filters.loading") : t("filters.count", { count: filtered.length })}
              </p>
              <div
                className={`no-scrollbar order-last min-w-0 basis-full items-center gap-2 overflow-x-auto md:order-none md:flex md:flex-1 md:basis-auto ${
                  activeFilters.length > 0 ? "flex" : "hidden"
                }`}
              >
                {activeFilters.map((f, i) => (
                  <span
                    key={`${i}-${f.label}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#f4f1ea] px-3 text-[13px] font-bold text-foreground"
                  >
                    {f.label}
                    <button type="button" onClick={f.clear} aria-label={t("filters.remove", { label: f.label })} className="hover:text-accent">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {activeFilters.length > 1 && (
                  <button type="button" onClick={clearAll} className="shrink-0 text-[13px] font-bold text-gold hover:text-white">
                    {t("filters.clearAll")}
                  </button>
                )}
              </div>

              {/* Full category list, multi-select. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={t("filters.more")} className={`${pill} !px-3 md:!px-4`}>
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                    <span className="hidden md:inline">{t("filters.more")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" collisionPadding={20} className="w-64 max-h-[70vh] overflow-y-auto">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("filters.byCategory")}
                  </DropdownMenuLabel>
                  {activeCategories.size > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveCategories(new Set())}
                        className="w-full text-left px-2 py-1.5 text-xs text-accent hover:bg-accent/10 rounded-sm"
                      >
                        {t("filters.clearSelections")}
                      </button>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {CATEGORY_GROUPS.map((group, gi) => (
                    <div key={group.slug}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {categoryNames.group(group.slug, group.name)}
                      </DropdownMenuLabel>
                      {group.subs.map((sub) => (
                        <DropdownMenuCheckboxItem
                          key={sub}
                          checked={activeCategories.has(sub)}
                          onCheckedChange={() => toggleCategory(sub)}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {categoryNames.sub(sub)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Select value={sort} onValueChange={(v) => setSort(v as keyof typeof sortOptions)}>
                <SelectTrigger
                  aria-label={t("filters.sortLabel")}
                  className="h-11 w-[172px] shrink-0 rounded-full border-white/15 bg-white/[0.04] px-4 text-[14px] font-bold text-[#f4f1ea]"
                >
                  <SelectValue placeholder={t("filters.sortPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">{t("filters.sort.popular")}</SelectItem>
                  <SelectItem value="rating">{t("filters.sort.rating")}</SelectItem>
                  <SelectItem value="price-low">{t("filters.sort.price-low")}</SelectItem>
                  <SelectItem value="price-high">{t("filters.sort.price-high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="container mx-auto px-5 pb-16 pt-6 md:px-8 md:pb-24">
            {vendors.length === 0 && loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/15 bg-white/[0.03] p-2">
                    <Skeleton className="aspect-[4/5] w-full rounded-xl bg-white/10" />
                    <div className="space-y-2 px-3 pb-3 pt-4">
                      <Skeleton className="h-3 w-1/3 bg-white/10" />
                      <Skeleton className="h-5 w-2/3 bg-white/10" />
                      <Skeleton className="h-4 w-full bg-white/10" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((vendor, i) => (
                  <motion.div
                    key={vendor.id}
                    className="min-w-0"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: Math.min(i * 0.05, 0.4) }}
                  >
                    <VendorCard vendor={vendor} eager={i < 4} tone="dark" tall />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/15 px-6 py-20 text-center">
                <Store className="mx-auto mb-4 h-10 w-10 text-gold" aria-hidden />
                <h3 className="m-0 mb-2 text-2xl">{t("empty.title")}</h3>
                <p className="m-0 mx-auto max-w-sm text-[15px] text-[#f4f1ea]/80">
                  {t("empty.body")}
                </p>
                <Button variant="outline" className="mt-6" onClick={clearAll}>
                  {t("empty.clear")}
                </Button>
              </div>
            )}
          </div>
        </section>

        <div className="border-t border-white/10">
          <ClosingBand
            title={
              <Trans
                t={t}
                i18nKey="closing.title"
                components={{ gold: <span className="font-editorial text-gold" /> }}
              />
            }
            sub={t("closing.sub")}
            cta={{ label: t("closing.cta"), to: "/signup/vendor" }}
          />
        </div>
      </main>

      <Footer tone="dark" />
    </div>
  );
}
