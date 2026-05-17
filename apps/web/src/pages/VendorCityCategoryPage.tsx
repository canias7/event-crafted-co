import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { FaqSection } from "@/components/seo/FaqSection";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { Picture } from "@/components/shared/Picture";
import { citySlugify, citySlugDisplay } from "@/lib/citySlug";
import { categoryConfig } from "@/pages/VendorCategoryPage";
import {
  CATEGORY_GROUPS,
  groupOfSub,
} from "@/data/categoryTaxonomy";
import { CATEGORY_FAQS } from "@/data/categoryFaqs";

// Combined city + category vendor listing page. Generated programmatically:
// every (category, city-with-vendors) tuple gets its own indexable URL like
// /vendors/photographers/in/austin-tx. This is the SEO play — Knot owns the
// SERP for "[category] in [city]" today; this page exists to start contesting
// those queries with hand-vetted, schema.org-tagged result pages.
//
// The page is intentionally similar in shape to VendorCityPage and
// VendorCategoryPage so cross-linking between them feels native.

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorCityCategoryPage() {
  const { categorySlug, citySlug } = useParams();
  const { vendors, loading } = useVendors();
  const config = categorySlug ? categoryConfig[categorySlug] : null;
  const cityLabel = citySlug ? citySlugDisplay(citySlug) : "";

  // Bad slug → bounce to the all-vendors listing rather than 404. We don't
  // want crawlers indexing soft-404s; better to 301 to a known-good page.
  if (!config || !cityLabel) {
    return <Navigate to="/vendors" replace />;
  }

  const matched = useMemo<Vendor[]>(() => {
    if (!categorySlug || !citySlug) return [];
    return vendors.filter((v) => {
      if (groupOfSub(v.category) !== config.name) return false;
      const loc = v.location ?? v.distance ?? "";
      return citySlugify(loc) === citySlug;
    });
  }, [vendors, categorySlug, citySlug, config]);

  // Other cities with vendors of this group for cross-linking. Drives
  // the "also serving…" rail at the bottom — internal links Google likes.
  const otherCities = useMemo(() => {
    if (!citySlug) return [];
    const counts = new Map<string, number>();
    for (const v of vendors) {
      if (groupOfSub(v.category) !== config.name) continue;
      const loc = v.location ?? v.distance ?? "";
      const slug = citySlugify(loc);
      if (!slug || slug === citySlug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([slug, count]) => ({
        slug,
        label: citySlugDisplay(slug),
        count,
      }));
  }, [vendors, citySlug, config]);

  // Other groups in this city — "while you're here, browse Florists
  // in Austin" links. Counts roll up sub-categories into their parent
  // group so the cross-link goes to the group page.
  const otherCategoriesInCity = useMemo(() => {
    if (!citySlug) return [];
    const groupCounts = new Map<string, number>();
    for (const v of vendors) {
      const loc = v.location ?? v.distance ?? "";
      if (citySlugify(loc) !== citySlug) continue;
      const group = groupOfSub(v.category);
      if (!group || group === config.name) continue;
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    }
    return CATEGORY_GROUPS
      .filter((g) => groupCounts.has(g.name))
      .map((g) => ({
        slug: g.slug,
        display: g.name,
        count: groupCounts.get(g.name) ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [vendors, citySlug, config]);

  const faqs = useMemo(
    () =>
      (CATEGORY_FAQS[categorySlug] ?? []).map((f) => ({
        ...f,
        // Append city qualifier so each FAQ is unique per page (helps
        // with FAQPage rich result eligibility).
        q: f.q.includes(cityLabel) ? f.q : `${f.q} in ${cityLabel}?`.replace(
          "??",
          "?",
        ),
      })),
    [categorySlug, cityLabel],
  );

  const title = `${config.display} in ${cityLabel} — Vendora`;
  const description = `Hand-vetted ${config.display.toLowerCase()} in ${cityLabel}. Browse pricing, packages, real reviews, and book the right ${config.name.toLowerCase()} for your event through Vendora.`;

  useDocumentMeta({
    title,
    description,
    type: "website",
  });

  return (
    <div className="min-h-screen public-canvas">
      <PublicNav />

      {/* Hero */}
      <section className="relative pt-32 pb-12 md:pt-36 md:pb-16 border-b border-border overflow-hidden">
        <Picture
          source={config.hero}
          alt=""
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
          className="absolute inset-0 w-full h-full object-cover opacity-15"
        />
        <div className="container mx-auto px-6 md:px-8 max-w-4xl relative">
          <Link
            to={`/vendors/category/${categorySlug}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-3 h-3" />
            All {config.display}
          </Link>
          <p className="font-label text-accent tracking-[0.4em] mb-4 inline-flex items-center gap-2">
            <MapPin className="w-3 h-3" />
            {cityLabel.toUpperCase()}
          </p>
          <h1 className="font-editorial text-5xl md:text-6xl leading-[1.0] mb-5">
            {config.display} in{" "}
            <span className="italic font-light text-accent">{cityLabel}</span>
          </h1>
          <p className="text-base md:text-lg text-foreground/75 max-w-2xl leading-relaxed">
            {config.longCopy} Showing the curated list of{" "}
            {config.display.toLowerCase()} serving {cityLabel}.
          </p>
        </div>
      </section>

      {/* Listings */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="aspect-[4/5] w-full rounded-sm" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : matched.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40 mb-4" />
              <h2 className="font-editorial text-3xl mb-3">
                No {config.display.toLowerCase()} in {cityLabel} yet
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                We're still building out coverage here. Browse other{" "}
                {config.display.toLowerCase()} on Vendora — many travel for
                events.
              </p>
              <Link to={`/vendors/category/${categorySlug}`}>
                <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                  All {config.display}
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-8">
                <p className="font-label text-muted-foreground tnum">
                  {matched.length}{" "}
                  {matched.length === 1
                    ? config.name.toLowerCase()
                    : config.display.toLowerCase()}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                {matched.map((vendor, i) => (
                  <motion.div
                    key={vendor.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...spring, delay: Math.min(i * 0.04, 0.2) }}
                  >
                    <VendorCard vendor={vendor} />
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Cross-link rails */}
      {(otherCities.length > 0 || otherCategoriesInCity.length > 0) && (
        <section className="py-12 md:py-16 border-t border-border bg-secondary/20">
          <div className="container mx-auto px-6 md:px-8 max-w-6xl space-y-12">
            {otherCities.length > 0 && (
              <div>
                <p className="font-label text-accent mb-4">Also serving</p>
                <h2 className="font-editorial text-3xl md:text-3xl mb-6">
                  {config.display} in other cities
                </h2>
                <div className="flex flex-wrap gap-2">
                  {otherCities.map((c) => (
                    <Link
                      key={c.slug}
                      to={`/vendors/${categorySlug}/in/${c.slug}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
                    >
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      {c.label}
                      <span className="text-xs text-muted-foreground tnum">
                        {c.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {otherCategoriesInCity.length > 0 && (
              <div>
                <p className="font-label text-accent mb-4">
                  More in {cityLabel}
                </p>
                <h2 className="font-editorial text-3xl md:text-3xl mb-6">
                  Other vendors in {cityLabel}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {otherCategoriesInCity.map((c) => (
                    <Link
                      key={c.slug}
                      to={`/vendors/${c.slug}/in/${citySlug}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
                    >
                      {c.display}
                      <span className="text-xs text-muted-foreground tnum">
                        {c.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {faqs.length > 0 && <FaqSection items={faqs} eyebrow="Common questions" />}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${config.display} in ${cityLabel}`,
          description,
          numberOfItems: matched.length,
          itemListElement: matched.slice(0, 30).map((v, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "LocalBusiness",
              "@id": `https://vendora.app/vendors/${v.id}`,
              name: v.name,
              category: v.category,
              address: v.location ?? cityLabel,
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
              acceptedAnswer: {
                "@type": "Answer",
                text: f.a,
              },
            })),
          }}
        />
      )}

      <Footer />
    </div>
  );
}
