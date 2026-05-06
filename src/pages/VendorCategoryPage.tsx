import { useMemo, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { FaqSection } from "@/components/seo/FaqSection";
import { useVendors } from "@/hooks/useVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { CATEGORY_FAQS } from "@/data/categoryFaqs";
import { citySlugify, citySlugDisplay } from "@/lib/citySlug";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import { CATEGORY_GROUPS, groupOfSub } from "@/data/categoryTaxonomy";

import vendorPhotographer from "@/assets/vendor-photographer.jpg?as=picture";
import vendorFlorist from "@/assets/vendor-florist.jpg?as=picture";
import vendorCatering from "@/assets/vendor-catering.jpg?as=picture";
import vendorDj from "@/assets/vendor-dj.jpg?as=picture";
import vendorVenue from "@/assets/vendor-venue.jpg?as=picture";
import vendorMakeup from "@/assets/vendor-makeup.jpg?as=picture";

interface CategoryConfig {
  /** Group name — also the schema lookup key in categoryAttributes. */
  name: string;
  display: string;
  description: string;
  longCopy: string;
  hero: PictureSource;
  /** Sub-categories rendered as filter chips on the group page. */
  subs: string[];
  /** Reserved for future use — no group is coming soon today. */
  comingSoon?: boolean;
}

// Hero image per group slug. Re-uses the existing imagetools-bundled
// vendor-* assets — closest visual match per group, swap later when
// per-group editorial heroes are commissioned.
const heroByGroup: Record<string, PictureSource> = {
  venues: vendorVenue,
  "food-beverage": vendorCatering,
  entertainment: vendorDj,
  media: vendorPhotographer,
  "design-decor": vendorFlorist,
  rentals: vendorVenue,
  experiences: vendorMakeup,
  "corporate-services": vendorVenue,
};

// Single source of truth lives in categoryTaxonomy.CATEGORY_GROUPS;
// this object adapts that list to the page-config shape used here +
// in PublicNav + VendorBrowsePage.
export const categoryConfig: Record<string, CategoryConfig> =
  Object.fromEntries(
    CATEGORY_GROUPS.map((g) => [
      g.slug,
      {
        name: g.name,
        display: g.name,
        description: g.description,
        longCopy: g.longCopy,
        hero: heroByGroup[g.slug] ?? vendorVenue,
        subs: g.subs,
      },
    ]),
  ) satisfies Record<string, CategoryConfig>;


export const allCategorySlugs = Object.keys(categoryConfig);

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorCategoryPage() {
  const { slug } = useParams();
  const config = slug ? categoryConfig[slug] : null;
  const { vendors, loading } = useVendors();
  const [activeSubs, setActiveSubs] = useState<Set<string>>(new Set());

  useDocumentMeta({
    title: config
      ? `${config.display} on Vendora — ${config.description}`
      : "Vendor category — Vendora",
    description: config?.description,
    // Picture object → use the JPG fallback as the social-share image
    // (modern crawlers pick AVIF/WebP from <source> in the page itself).
    image: config?.hero?.img.src,
  });

  const filtered = useMemo(() => {
    if (!config) return [];
    return vendors.filter((v) => {
      if (groupOfSub(v.category) !== config.name) return false;
      if (activeSubs.size > 0 && !activeSubs.has(v.category)) return false;
      return true;
    });
  }, [vendors, config, activeSubs]);

  function toggleSub(sub: string) {
    setActiveSubs((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  }

  // Cities served — top 6 by vendor count for cross-linking.
  const citiesServed = useMemo(() => {
    if (!config) return [];
    const counts = new Map<string, number>();
    for (const v of filtered) {
      const slug = citySlugify(v.location ?? v.distance ?? "");
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s, c]) => ({ slug: s, label: citySlugDisplay(s), count: c }));
  }, [filtered, config]);

  // Other categories for internal linking.
  const otherCategories = useMemo(() => {
    return Object.entries(categoryConfig)
      .filter(([s]) => s !== slug)
      .slice(0, 6);
  }, [slug]);

  const faqs = config ? (CATEGORY_FAQS[slug ?? ""] ?? []) : [];

  if (!config) {
    return <Navigate to="/vendors" replace />;
  }

  // Coming-soon categories render a marketing splash with no vendor
  // grid + no inquiry CTAs. They still get a real page (vs 404) so
  // they can rank in search and capture interest.
  if (config.comingSoon) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <section className="pt-32 pb-16 md:pt-40 md:pb-24 border-b border-border">
          <div className="container mx-auto px-6 md:px-8 max-w-3xl text-center">
            <p className="font-label text-accent tracking-[0.4em] mb-4 inline-flex items-center gap-2">
              {config.display.toUpperCase()}
            </p>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.0] mb-6">
              {config.display} — coming soon
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-10">
              {config.longCopy}
            </p>
            <Link
              to="/vendors"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Browse other vendors
            </Link>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic category hero */}
      <section className="relative h-[55svh] min-h-[400px] w-full overflow-hidden">
        <Picture
          source={config.hero}
          alt={config.display}
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
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

        <div className="relative z-10 h-full flex flex-col">
          <div className="container mx-auto px-6 md:px-8 pt-24">
            <Link
              to="/vendors"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-background/70 hover:text-background transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All vendors
            </Link>
          </div>

          <div className="flex-1 flex items-end pb-12 md:pb-16">
            <div className="container mx-auto px-6 md:px-8">
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.15 }}
                className="font-label text-accent tracking-[0.4em] mb-5"
              >
                — CATEGORY
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.3, duration: 0.9 }}
                className="text-hero font-display text-background leading-[1.0] max-w-3xl"
              >
                {config.display}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.55 }}
                className="text-base md:text-lg text-background/80 mt-5 max-w-xl leading-relaxed font-light"
              >
                {config.description}
              </motion.p>
            </div>
          </div>
        </div>
      </section>

      {/* Long copy + grid */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 md:px-8">
          <div className="max-w-2xl mb-10">
            <p className="text-foreground/70 leading-relaxed">
              {config.longCopy}
            </p>
          </div>

          {/* Sub-category filter chips. Empty selection = show every
              vendor in the group; toggling chips narrows to the
              selected subs. */}
          {config.subs.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-10">
              <button
                type="button"
                onClick={() => setActiveSubs(new Set())}
                className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                  activeSubs.size === 0
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-foreground/40"
                }`}
              >
                All
              </button>
              {config.subs.map((sub) => {
                const active = activeSubs.has(sub);
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => toggleSub(sub)}
                    className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background border-border text-foreground/80 hover:border-foreground/40"
                    }`}
                  >
                    {sub}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-end justify-between mb-8">
            <p className="font-label text-muted-foreground">
              {filtered.length}{" "}
              {filtered.length === 1
                ? config.name.toLowerCase()
                : config.display.toLowerCase()}
            </p>
            <Link to="/vendors">
              <Button variant="ghost" size="sm" className="rounded-full">
                Browse all categories
              </Button>
            </Link>
          </div>

          {loading && filtered.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/3] w-full rounded-sm mb-3" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-display text-xl mb-2">
                No {config.display.toLowerCase()} on Vendora yet
              </p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                We're hand-selecting new vendors weekly. Check back soon, or
                browse our other categories.
              </p>
              <Link to="/vendors" className="inline-block mt-6">
                <Button variant="outline" className="rounded-full">
                  Browse all vendors
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {filtered.map((v, i) => (
                <VendorCard key={v.id} vendor={v} eager={i < 6} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cities the category is available in — strong internal linking */}
      {citiesServed.length > 0 && (
        <section className="py-16 border-t border-border">
          <div className="container mx-auto px-6 md:px-8 max-w-5xl">
            <p className="font-label text-accent mb-3 tracking-[0.4em]">
              — BY CITY
            </p>
            <h2 className="font-display text-3xl mb-8">
              {config.display} by city
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {citiesServed.map((c) => (
                <Link
                  key={c.slug}
                  // Use the combined city+category route so the anchor
                  // text matches the destination — better SEO signal
                  // than linking to the generic city page.
                  to={`/vendors/${slug}/in/${c.slug}`}
                  className="group rounded-sm border border-border bg-card p-4 hover:border-foreground/30 transition-colors"
                >
                  <p className="font-display text-base group-hover:text-accent transition-colors">
                    {config.display} in {c.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 tnum">
                    {c.count} vendor{c.count === 1 ? "" : "s"}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ — also serialized as FAQPage JSON-LD below */}
      <FaqSection
        items={faqs}
        title={`Booking ${config.display.toLowerCase()} on Vendora`}
      />

      {/* Cross-link to other categories */}
      {otherCategories.length > 0 && (
        <section className="py-16 border-t border-border">
          <div className="container mx-auto px-6 md:px-8 max-w-5xl">
            <p className="font-label text-accent mb-3 tracking-[0.4em]">
              — KEEP BROWSING
            </p>
            <h2 className="font-display text-3xl mb-8">Other categories</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {otherCategories.map(([s, c]) => (
                <Link
                  key={s}
                  to={`/vendors/category/${s}`}
                  className="group rounded-sm border border-border bg-card p-4 hover:border-foreground/30 transition-colors"
                >
                  <p className="font-display text-base group-hover:text-accent transition-colors">
                    {c.display}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {c.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* JSON-LD: ItemList of vendors + FAQPage */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${config.display} on Vendora`,
          description: config.description,
          numberOfItems: filtered.length,
          itemListElement: filtered.slice(0, 25).map((v, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "LocalBusiness",
              name: v.name,
              description: v.description,
              image: v.image,
              url:
                typeof window !== "undefined"
                  ? `${window.location.origin}/vendors/${v.id}`
                  : `/vendors/${v.id}`,
            },
          })),
        }}
      />
      {faqs.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }}
        />
      )}

      <Footer />
    </div>
  );
}
