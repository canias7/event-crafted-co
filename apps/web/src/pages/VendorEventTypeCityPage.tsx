import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { citySlugify, citySlugDisplay } from "@/lib/citySlug";

// Event-type + city vendor listing — the multi-event SEO play.
// Generates URLs like /baby-shower-vendors/austin-tx, which Knot
// can't compete for since they're wedding-only. The page intersects
// vendors who serve the event type with a city filter, and links
// back to specific category subpages for deeper browsing.
//
// Event-type slug → config below. Add new event types here and to the
// sitemap edge function in lock-step.
//
// Each type's words live in locales/<language>/cityPages.json under
// eventTypes.<slug>: `display` ("Wedding Vendors"), `short` (the title
// without "Vendors"), `noun` (verbose name used in body copy: "a baby
// shower" vs the slug) and `description` (one-liner under the title).
// The top categories' link labels are under topCategories.<name>.

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

interface EventTypeConfig {
  /** Vendor categories most relevant to this event type. Used both as
   *  filtering hints and to populate the cross-link rail. */
  topCategories: string[];
}

export const eventTypeConfig: Record<string, EventTypeConfig> = {
  wedding: {
    topCategories: ["Photographer", "Florist", "Venue", "Catering", "DJ"],
  },
  birthday: {
    topCategories: ["Photographer", "Catering", "DJ", "Venue", "Decorator"],
  },
  "baby-shower": {
    topCategories: ["Photographer", "Florist", "Catering", "Decorator", "Venue"],
  },
  anniversary: {
    topCategories: ["Photographer", "Catering", "Florist", "Venue"],
  },
  "holiday-dinner": {
    topCategories: ["Catering", "Florist", "Decorator", "DJ"],
  },
  corporate: {
    topCategories: ["Venue", "Catering", "AV", "Photographer", "Event Planner"],
  },
  graduation: {
    topCategories: ["Photographer", "Catering", "DJ", "Decorator"],
  },
  bridal: {
    topCategories: ["Florist", "Photographer", "Catering", "Venue"],
  },
  engagement: {
    topCategories: ["Photographer", "Florist", "Venue", "Catering"],
  },
};

export const allEventTypeSlugs = Object.keys(eventTypeConfig);

export default function VendorEventTypeCityPage() {
  const { t } = useTranslation("cityPages");
  const { eventTypeSlug, citySlug } = useParams();
  const { vendors, loading } = useVendors();
  const config = eventTypeSlug ? eventTypeConfig[eventTypeSlug] : null;
  const cityLabel = citySlug ? citySlugDisplay(citySlug) : "";

  if (!config || !cityLabel) {
    return <Navigate to="/vendors" replace />;
  }

  const matched = useMemo<Vendor[]>(() => {
    if (!citySlug) return [];
    const relevantCats = new Set(config.topCategories);
    return vendors.filter((v) => {
      const loc = v.location ?? v.distance ?? "";
      if (citySlugify(loc) !== citySlug) return false;
      // For event-type pages, prioritize vendors whose category is in
      // the top-categories list. Fall back to all vendors in the city
      // if there are too few — better to show something useful than
      // an empty state.
      return relevantCats.has(v.category);
    });
  }, [vendors, citySlug, config]);

  const fallbackInCity = useMemo<Vendor[]>(() => {
    if (matched.length >= 3 || !citySlug) return [];
    return vendors.filter((v) => {
      const loc = v.location ?? v.distance ?? "";
      return citySlugify(loc) === citySlug;
    });
  }, [vendors, citySlug, matched.length]);

  const display = matched.length >= 3 ? matched : fallbackInCity;

  const eventType = {
    display: t(`eventTypes.${eventTypeSlug}.display`),
    short: t(`eventTypes.${eventTypeSlug}.short`),
    noun: t(`eventTypes.${eventTypeSlug}.noun`),
    description: t(`eventTypes.${eventTypeSlug}.description`),
  };

  const title = t("eventTypeCity.meta.title", { display: eventType.display, city: cityLabel });
  const description = t("eventTypeCity.meta.description", {
    description: eventType.description,
    city: cityLabel,
    noun: eventType.noun,
  });

  useDocumentMeta({
    title,
    description,
    type: "website",
  });

  return (
    <div className="min-h-screen public-canvas">
      <PublicNav />

      <section className="pt-32 pb-12 md:pt-36 md:pb-16 border-b border-border">
        <div className="container mx-auto px-5 md:px-8 max-w-4xl">
          <Link
            to="/vendors"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent transition-colors mb-6"
          >
            <ArrowLeft className="w-3 h-3" />
            {t("eventTypeCity.back")}
          </Link>
          <p className="font-label text-accent tracking-[0.4em] mb-4 inline-flex items-center gap-2">
            <MapPin className="w-3 h-3" />
            {cityLabel.toUpperCase()}
          </p>
          <h1 className="font-editorial text-5xl md:text-6xl leading-[1.0] mb-5">
            <Trans
              t={t}
              i18nKey="eventTypeCity.title"
              values={{ eventType: eventType.short, city: cityLabel }}
              components={{ accent: <span className="text-accent" /> }}
            />
          </h1>
          <p className="text-base md:text-lg text-foreground max-w-2xl leading-relaxed">
            {t("eventTypeCity.intro", { description: eventType.description, city: cityLabel, noun: eventType.noun })}
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-5 md:px-8 max-w-6xl">
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
          ) : display.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40 mb-4" />
              <h2 className="font-editorial text-3xl mb-3">
                {t("eventTypeCity.empty.title", { city: cityLabel, noun: eventType.noun })}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                {t("eventTypeCity.empty.body")}
              </p>
              <Link to={`/vendors/in/${citySlug}`}>
                <Button>
                  {t("eventTypeCity.empty.cta", { city: cityLabel })}
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-8">
                <p className="font-label text-muted-foreground tnum">
                  {t("vendorCount", { count: display.length })}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                {display.map((vendor, i) => (
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

      {/* Cross-link rail to specific categories for this event type */}
      <section className="py-12 md:py-16 border-t border-border bg-secondary/20">
        <div className="container mx-auto px-5 md:px-8 max-w-6xl">
          <p className="font-label text-accent mb-4">{t("eventTypeCity.browseByCategory")}</p>
          <h2 className="font-editorial text-3xl md:text-3xl mb-6">
            {t("eventTypeCity.mightNeed", { noun: eventType.noun })}
          </h2>
          <div className="flex flex-wrap gap-2">
            {config.topCategories.map((cat) => {
              const slug = cat.toLowerCase().replace(/\s+/g, "-").replace(
                /[^a-z-]/g,
                "",
              );
              return (
                <Link
                  key={cat}
                  to={`/vendors/${slug}/in/${citySlug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
                >
                  {t("eventTypeCity.categoryInCity", {
                    category: t(`topCategories.${cat}`, { defaultValue: `${cat}s` }),
                    city: cityLabel,
                  })}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: title,
          description,
          numberOfItems: display.length,
          itemListElement: display.slice(0, 30).map((v, i) => ({
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

      <Footer />
    </div>
  );
}
