import { useMemo } from "react";
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

import vendorPhotographer from "@/assets/vendor-photographer.jpg?as=picture";
import vendorFlorist from "@/assets/vendor-florist.jpg?as=picture";
import vendorCatering from "@/assets/vendor-catering.jpg?as=picture";
import vendorDj from "@/assets/vendor-dj.jpg?as=picture";
import vendorVenue from "@/assets/vendor-venue.jpg?as=picture";
import vendorMakeup from "@/assets/vendor-makeup.jpg?as=picture";

interface CategoryConfig {
  name: string;
  display: string;
  description: string;
  longCopy: string;
  hero: PictureSource;
  /** When true, the category landing page shows a "coming soon" splash
   * and the category isn't selectable in the vendor signup dropdown. */
  comingSoon?: boolean;
}

export const categoryConfig: Record<string, CategoryConfig> = {
  photographers: {
    name: "Photographer",
    display: "Photographers",
    description:
      "Editorial, documentary, and fine-art photographers for weddings, milestones, and editorial events.",
    longCopy:
      "From candid wedding-day documentary work to polished editorial portraits, the photographers on Vendora have been hand-selected for their distinctive eye and reliability under pressure.",
    hero: vendorPhotographer,
  },
  florists: {
    name: "Florist",
    display: "Florists",
    description:
      "Garden-style installations, sculptural arrangements, and seasonal florals for events of every scale.",
    longCopy:
      "Whether you want a single dramatic centerpiece or a full ceremony installation, our florists work with seasonal blooms and a careful color sensibility.",
    hero: vendorFlorist,
  },
  catering: {
    name: "Catering",
    display: "Catering",
    description:
      "Tasting menus, family-style feasts, and bespoke beverage programs from kitchens that take the food seriously.",
    longCopy:
      "From private chef dinners to multi-course wedding receptions and holiday gatherings, the catering teams on Vendora bring kitchen-craft and event experience together.",
    hero: vendorCatering,
  },
  djs: {
    name: "DJ",
    display: "DJs",
    description:
      "Curated DJs and music programmers — from soul and electronic crossovers to dinner-party jazz.",
    longCopy:
      "Music sets the room. Vendora DJs handle the full arc of an event — ceremony, dinner, reception, late-night — with taste and crowd-reading instincts.",
    hero: vendorDj,
  },
  venues: {
    name: "Venue",
    display: "Venues",
    description:
      "Lofts, gardens, restaurants, and architectural spaces — venues that make the event before guests arrive.",
    longCopy:
      "We list venues that have personality on their own and don't need to be over-decorated. From skyline lofts to intimate restaurants, find a space that matches your event.",
    hero: vendorVenue,
  },
  "makeup-artists": {
    name: "Makeup Artist",
    display: "Makeup Artists",
    description:
      "Editorial bridal beauty, soft-glam, and on-location styling for events of every kind.",
    longCopy:
      "Camera-ready beauty for events that will be photographed forever — wedding, anniversary, milestone birthday, or editorial shoot.",
    hero: vendorMakeup,
  },
  videographers: {
    name: "Videographer",
    display: "Videographers",
    description:
      "Cinematic event films and documentary highlight reels.",
    longCopy:
      "Pair with a photographer for full-coverage event documentation — film captures motion, sound, and presence that stills can't.",
    hero: vendorPhotographer,
  },
  bakers: {
    name: "Baker",
    display: "Bakers",
    description:
      "Cakes, dessert tables, and pastry programs for weddings, birthdays, and holiday gatherings.",
    longCopy:
      "From sculptural wedding cakes to seasonal pies and small-batch desserts, our bakers bring craft and flavor to the table.",
    hero: vendorCatering,
  },
  "event-planners": {
    name: "Event Planner",
    display: "Event Planners",
    description:
      "Full-service planners and day-of coordinators for events that need to run on rails.",
    longCopy:
      "Planners on Vendora handle the production layer — vendor management, run-of-show, day-of coordination — so you can be present at your own event.",
    hero: vendorVenue,
  },
  decorators: {
    name: "Decorator",
    display: "Decorators",
    description:
      "Tablescapes, lighting design, and full event styling.",
    longCopy:
      "Beyond florals — linens, lighting, signage, and the small details that make a room feel like an editorial set.",
    hero: vendorFlorist,
  },
  bartenders: {
    name: "Bartender",
    display: "Bartenders",
    description:
      "Hourly-billed mixologists and bar staff for private events of any size.",
    longCopy:
      "Cocktail menus tailored to the evening, plus the staff to actually pour them. Often booked alongside catering for a coordinated bar program.",
    hero: vendorVenue,
  },
  waitstaff: {
    name: "Waitstaff",
    display: "Waitstaff",
    description:
      "Servers and butlers for plated dinners, passed-canape receptions, and high-touch service.",
    longCopy:
      "Trained service staff who know how to time a course, clear plates without interrupting, and keep the room moving.",
    hero: vendorCatering,
  },
  security: {
    name: "Security",
    display: "Security",
    description:
      "Licensed event security — access control, crowd management, VIP protection.",
    longCopy:
      "Licensed and insured security personnel for events that need controlled entry, large-crowd management, or high-profile guest protection.",
    hero: vendorVenue,
  },
  valets: {
    name: "Valet",
    display: "Valet",
    description:
      "Insured valet teams for venues without on-site parking.",
    longCopy:
      "Coordinated valet for events at restaurants, private homes, or any venue where guest parking is the difference between effortless arrival and a stressful start.",
    hero: vendorVenue,
  },
  "day-of-coordinators": {
    name: "Day-of Coordinator",
    display: "Day-of Coordinators",
    description:
      "Run-of-show specialists for the day itself — lower commitment than full-service planning.",
    longCopy:
      "Take over 4-8 weeks before the event to confirm vendors, build the timeline, and run the day. The right call when you've planned everything yourself but want a pro behind the wheel on the day.",
    hero: vendorVenue,
  },
  // ─── Expanded marketplace ─── matches The Knot's category breadth.
  bands: {
    name: "Band",
    display: "Bands",
    description:
      "Live music for ceremony, cocktail hour, and reception — from horn-section party bands to acoustic trios.",
    longCopy:
      "A live band is the difference between dancing and just hearing music play. Vendora bands handle the full arc — first dance through last call — with a curated repertoire and the read-the-room instincts that turn a reception into an event people remember.",
    hero: vendorDj,
  },
  beauty: {
    name: "Beauty",
    display: "Beauty",
    description:
      "Hair + makeup teams for bridal parties, milestone events, and editorial shoots.",
    longCopy:
      "Beyond bridal — Vendora beauty pros handle hair styling, makeup, on-location touch-ups, and full-team weekends. Camera-ready looks for events that get photographed forever.",
    hero: vendorMakeup,
  },
  "bridal-salons": {
    name: "Bridal Salon",
    display: "Bridal Salons",
    description:
      "Wedding-dress shops, alterations specialists, and accessories ateliers.",
    longCopy:
      "Salons that carry curated designer racks plus the tailoring talent to make sure the dress fits the way it should on the day. Find by region, designer focus, or price tier.",
    hero: vendorMakeup,
  },
  "dance-instructors": {
    name: "Dance Instructor",
    display: "Dance Instructors",
    description:
      "First-dance choreography and pre-event lessons for wedding parties.",
    longCopy:
      "From a polished first dance to teaching a wedding party the basics of swing or salsa for the reception. Sessions are usually 4-8 lessons leading up to the event.",
    hero: vendorVenue,
  },
  ensembles: {
    name: "Ensemble",
    display: "Ensembles & Soloists",
    description:
      "String quartets, jazz trios, soloists, and acoustic pairings for ceremonies and cocktail hours.",
    longCopy:
      "Live music without the full-band footprint. Ensembles fit ceremonies, cocktail receptions, dinner sets, and lounge transitions — anywhere a smaller, more atmospheric sound is right.",
    hero: vendorDj,
  },
  "favors-gifts": {
    name: "Favors & Gifts",
    display: "Favors & Gifts",
    description:
      "Welcome bags, custom favors, gifting curators, and bridal-party gifts.",
    longCopy:
      "Curators who handle the welcome-bag-and-favor program — sourcing, custom branding, assembly, and delivery to the venue. Saves you the assembly-line evening before the event.",
    hero: vendorFlorist,
  },
  hotels: {
    name: "Hotel Block",
    display: "Hotel Room Blocks",
    description:
      "Negotiated room blocks for guests at out-of-town events.",
    longCopy:
      "We're partnering with hotel groups to offer pre-negotiated room blocks for your guests. This category is launching soon — sign up for early access and we'll let you know.",
    hero: vendorVenue,
    comingSoon: true,
  },
  invitations: {
    name: "Invitation Designer",
    display: "Invitations & Paper Goods",
    description:
      "Custom invitation suites, save-the-dates, day-of paper, and signage.",
    longCopy:
      "From letterpress save-the-dates to full day-of paper programs — menus, place cards, signage, ceremony booklets. Vendora invitation designers handle the full paper arc with consistent styling.",
    hero: vendorFlorist,
  },
  jewelers: {
    name: "Jeweler",
    display: "Jewelers",
    description:
      "Engagement rings, wedding bands, and bespoke fine jewelry.",
    longCopy:
      "Independent jewelers and design studios — bench-jeweler-made wedding bands, vintage and ethical-sourced engagement rings, and custom commissions for milestone events.",
    hero: vendorMakeup,
  },
  officiants: {
    name: "Officiant",
    display: "Officiants",
    description:
      "Ordained ministers, secular officiants, and ceremony writers for weddings of any tradition.",
    longCopy:
      "From traditional clergy to secular officiants who'll co-write a custom ceremony with you. Vendora officiants are experienced at large gatherings and unfamiliar venues — they make the ceremony feel like the room is theirs.",
    hero: vendorVenue,
  },
  "photo-booths": {
    name: "Photo Booth",
    display: "Photo Booths",
    description:
      "Open-air photo booths, mirror booths, GIF booths, and instant-print stations.",
    longCopy:
      "The most-used party feature at every reception. Vendora photo booth operators bring the kit, props, attendant, and instant prints — plus a digital gallery for the host afterward.",
    hero: vendorPhotographer,
  },
  rentals: {
    name: "Rentals",
    display: "Rentals",
    description:
      "Tables, chairs, linens, lighting, dance floors, and event-day infrastructure.",
    longCopy:
      "The structural layer of an event. Rental companies on Vendora handle everything from a single sweetheart table to full-build tented receptions — coordinated with your planner so deliveries hit the right windows.",
    hero: vendorVenue,
  },
  transportation: {
    name: "Transportation",
    display: "Transportation",
    description:
      "Shuttles, limos, and vintage cars for guest movement and photo moments.",
    longCopy:
      "Coordinated guest shuttles between hotel and venue, vintage getaway cars, and limousine transfers. Especially useful for venues without on-site parking or destination-style weekends.",
    hero: vendorVenue,
  },
  "travel-specialists": {
    name: "Travel Specialist",
    display: "Travel Specialists",
    description:
      "Honeymoon planners, destination-wedding coordinators, and group-travel agents.",
    longCopy:
      "From honeymoon itineraries to coordinating a 60-person destination weekend. Vendora travel specialists know which villas sleep 30, which airlines block-book, and which destinations actually deliver on the brochure.",
    hero: vendorVenue,
  },
};

export const allCategorySlugs = Object.keys(categoryConfig);

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorCategoryPage() {
  const { slug } = useParams();
  const config = slug ? categoryConfig[slug] : null;
  const { vendors, loading } = useVendors();

  useDocumentMeta({
    title: config
      ? `${config.display} on Vendora — ${config.description}`
      : "Vendor category — Vendora",
    description: config?.description,
    // Picture object → use the JPG fallback as the social-share image
    // (modern crawlers pick AVIF/WebP from <source> in the page itself).
    image: config?.hero?.img.src,
  });

  const filtered = useMemo(
    () => (config ? vendors.filter((v) => v.category === config.name) : []),
    [vendors, config],
  );

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
          <div className="max-w-2xl mb-12">
            <p className="text-foreground/70 leading-relaxed">
              {config.longCopy}
            </p>
          </div>

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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/5] w-full rounded-sm mb-4" />
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
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
