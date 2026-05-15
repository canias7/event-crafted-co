import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { FaqSection } from "@/components/seo/FaqSection";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { CITY_FAQS } from "@/data/categoryFaqs";
import { categoryConfig } from "@/pages/VendorCategoryPage";
import { citySlugify, citySlugDisplay } from "@/lib/citySlug";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

const slugByCategory: Record<string, string> = Object.entries(
  categoryConfig,
).reduce(
  (acc, [slug, cfg]) => {
    acc[cfg.name] = slug;
    return acc;
  },
  {} as Record<string, string>,
);

export default function VendorCityPage() {
  const { citySlug } = useParams();
  const { vendors, loading } = useVendors();
  const cityLabel = citySlug ? citySlugDisplay(citySlug) : "";

  const inCity = useMemo<Vendor[]>(() => {
    if (!citySlug) return [];
    return vendors.filter((v) => {
      const loc = v.location ?? v.distance ?? "";
      return citySlugify(loc) === citySlug;
    });
  }, [vendors, citySlug]);

  // Group by category for the breakdown rail.
  const byCategory = useMemo(() => {
    const m = new Map<string, Vendor[]>();
    for (const v of inCity) {
      if (!m.has(v.category)) m.set(v.category, []);
      m.get(v.category)!.push(v);
    }
    return Array.from(m.entries()).sort(
      (a, b) => b[1].length - a[1].length,
    );
  }, [inCity]);

  // Other cities for cross-linking — top 8 with most vendors.
  const nearbyCities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vendors) {
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
  }, [vendors, citySlug]);

  const faqs = useMemo(() => CITY_FAQS(cityLabel), [cityLabel]);

  useDocumentMeta({
    title: `Event vendors in ${cityLabel} — Vendora`,
    description: `Hand-vetted photographers, florists, venues, caterers, and planners in ${cityLabel}. Browse pricing, real reviews, and book directly through Vendora.`,
    type: "website",
  });

  if (!citySlug) return <Navigate to="/vendors/locations" replace />;
  if (!loading && inCity.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <section className="pt-32 pb-20">
          <div className="container mx-auto px-6 md:px-8 max-w-2xl text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
              <MapPin className="w-5 h-5 text-muted-foreground" />
            </div>
            <h1 className="font-editorial text-4xl mb-3">
              No vendors in {cityLabel} yet
            </h1>
            <p className="text-muted-foreground mb-8">
              Vendora is still curating its {cityLabel} chapter. Browse
              the full directory or another city below.
            </p>
            <Link to="/vendors/locations">
              <Button variant="outline" className="rounded-full">
                Browse all cities
              </Button>
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

      {/* Editorial hero */}
      <section className="border-b border-border pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <Link
            to="/vendors/locations"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All cities
          </Link>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring }}
            className="font-label text-accent tracking-[0.4em] mb-4"
          >
            — VENDORS IN {cityLabel.toUpperCase()}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1, duration: 0.9 }}
            className="font-editorial text-5xl md:text-6xl leading-[1.0] mb-6"
          >
            The {cityLabel} list,{" "}
            <span className="italic font-light text-accent">
              hand-curated.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.25 }}
            className="text-base md:text-lg text-foreground/75 max-w-2xl leading-relaxed"
          >
            {inCity.length}{" "}
            {inCity.length === 1 ? "vendor" : "vendors"} based in or
            near {cityLabel} on Vendora today — across photography,
            florals, catering, venues, and the rest of the event stack.
            Every one is vetted by our editorial team for portfolio
            quality, references, and reliability before they're listed.
          </motion.p>
          {byCategory.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-8">
              {byCategory.map(([cat, list]) => {
                const slug = slugByCategory[cat];
                if (!slug) return null;
                // Link to the city + category combined SEO page so the
                // anchor text doubles as both UI nav and SEO juice.
                return (
                  <Link
                    key={cat}
                    to={`/vendors/${slug}/in/${citySlug}`}
                    className="text-xs uppercase tracking-wide bg-secondary/60 hover:bg-secondary text-foreground/80 px-3 py-1.5 rounded-full transition-colors"
                  >
                    {cat}
                    <span className="text-muted-foreground ml-1.5 tnum">
                      {list.length}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Vendor grid */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-6 md:px-8">
          <div className="flex items-end justify-between mb-8 max-w-5xl mx-auto">
            <p className="font-label text-muted-foreground">
              {inCity.length}{" "}
              {inCity.length === 1 ? "vendor" : "vendors"} in {cityLabel}
            </p>
          </div>
          {loading && inCity.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/3] w-full rounded-sm mb-3" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {inCity.map((v, i) => (
                <VendorCard key={v.id} vendor={v} eager={i < 6} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <FaqSection items={faqs} title={`Planning an event in ${cityLabel}`} />

      {/* Related cities for crawl + browse */}
      {nearbyCities.length > 0 && (
        <section className="py-16 border-t border-border">
          <div className="container mx-auto px-6 md:px-8 max-w-5xl">
            <p className="font-label text-accent mb-3 tracking-[0.4em]">
              — OTHER CITIES
            </p>
            <h2 className="font-editorial text-4xl mb-8">
              Vendors in nearby markets
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {nearbyCities.map((c) => (
                <Link
                  key={c.slug}
                  to={`/vendors/in/${c.slug}`}
                  className="group rounded-2xl border border-border bg-card p-4 hover:border-foreground/30 transition-colors"
                >
                  <p className="font-display text-base group-hover:text-accent transition-colors">
                    {c.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 tnum">
                    {c.count} {c.count === 1 ? "vendor" : "vendors"}
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
          name: `Event vendors in ${cityLabel}`,
          description: `Hand-vetted event vendors based in ${cityLabel}.`,
          numberOfItems: inCity.length,
          itemListElement: inCity.slice(0, 25).map((v, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "LocalBusiness",
              name: v.name,
              description: v.description,
              image: v.image,
              address: {
                "@type": "PostalAddress",
                addressLocality: cityLabel.split(",")[0]?.trim(),
                addressRegion: cityLabel.split(",")[1]?.trim(),
              },
              url:
                typeof window !== "undefined"
                  ? `${window.location.origin}/vendors/${v.id}`
                  : `/vendors/${v.id}`,
            },
          })),
        }}
      />
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

      <Footer />
    </div>
  );
}
