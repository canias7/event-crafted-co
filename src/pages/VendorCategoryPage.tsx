import { useEffect, useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { useVendors } from "@/hooks/useVendors";

import vendorPhotographer from "@/assets/vendor-photographer.jpg";
import vendorFlorist from "@/assets/vendor-florist.jpg";
import vendorCatering from "@/assets/vendor-catering.jpg";
import vendorDj from "@/assets/vendor-dj.jpg";
import vendorVenue from "@/assets/vendor-venue.jpg";
import vendorMakeup from "@/assets/vendor-makeup.jpg";

interface CategoryConfig {
  name: string;
  display: string;
  description: string;
  longCopy: string;
  hero: string;
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
};

export const allCategorySlugs = Object.keys(categoryConfig);

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorCategoryPage() {
  const { slug } = useParams();
  const config = slug ? categoryConfig[slug] : null;
  const { vendors, loading } = useVendors();

  useEffect(() => {
    if (config) {
      document.title = `${config.display} on Vendora — ${config.description}`;
    }
    return () => {
      document.title = "Vendora — Premium Event Planning & Vendor Marketplace";
    };
  }, [config]);

  const filtered = useMemo(
    () => (config ? vendors.filter((v) => v.category === config.name) : []),
    [vendors, config],
  );

  if (!config) {
    return <Navigate to="/vendors" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic category hero */}
      <section className="relative h-[55svh] min-h-[400px] w-full overflow-hidden">
        <img
          src={config.hero}
          alt={config.display}
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
              {filtered.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
