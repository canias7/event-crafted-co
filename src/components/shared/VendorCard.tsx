import { motion } from "framer-motion";
import { Star, MapPin, Heart, Zap, GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSavedVendors } from "@/hooks/useSavedVendors";
import { useCompareVendors } from "@/hooks/useCompareVendors";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import { VerificationBadges } from "@/components/vendor/VerificationBadges";
// vite-imagetools auto-pictureifies anything in /assets/vendor-*,
// /assets/vendora-*, and /assets/hero/* (see vite.config.ts) into
// AVIF + WebP + JPG variants at 640/1024/1600 widths. Each import
// resolves to a { sources, img } picture object — ~50% bandwidth cut
// on the directory grid.
import vendorPhotographer from "@/assets/vendor-photographer.jpg?as=picture";
import vendorFlorist from "@/assets/vendor-florist.jpg?as=picture";
import vendorCatering from "@/assets/vendor-catering.jpg?as=picture";
import vendorDj from "@/assets/vendor-dj.jpg?as=picture";
import vendorVenue from "@/assets/vendor-venue.jpg?as=picture";
import vendorMakeup from "@/assets/vendor-makeup.jpg?as=picture";
import featureFlorals from "@/assets/vendora-feature-1.jpg?as=picture";
import featureLounge from "@/assets/vendora-feature-2.jpg?as=picture";
import heroDinner from "@/assets/vendora-hero-dinner.jpg?as=picture";
import heroGala from "@/assets/vendora-hero-gala.jpg?as=picture";
import heroBirthday from "@/assets/vendora-hero-birthday.jpg?as=picture";
import heroCinematic from "@/assets/vendora-hero-cinematic.jpg?as=picture";
import heroCorporate from "@/assets/hero/corporate.jpg?as=picture";
import heroNye from "@/assets/hero/nye.jpg?as=picture";
import heroFiesta from "@/assets/hero/fiesta.jpg?as=picture";
import heroBeach from "@/assets/hero/beach.jpg?as=picture";
import heroWedding from "@/assets/hero/wedding.jpg?as=picture";
import heroEngagement from "@/assets/hero/engagement.jpg?as=picture";

// Per-sub-category images. ~17 distinct visuals spread across the 31
// subs so cards in the same browse view don't repeat — within a
// single group page every card shows a different image. Some images
// reappear across groups (e.g. NYE's late-night vibe stands in for
// Bartending, Transportation, and Valet) which is acceptable since
// those categories live on different pages.
const imageMap: Record<string, PictureSource> = {
  "vendor-photographer": vendorPhotographer,
  "vendor-florist": vendorFlorist,
  "vendor-catering": vendorCatering,
  "vendor-dj": vendorDj,
  "vendor-venue": vendorVenue,
  "vendor-makeup": vendorMakeup,
  "feature-florals": featureFlorals,
  "feature-lounge": featureLounge,
  "hero-dinner": heroDinner,
  "hero-gala": heroGala,
  "hero-birthday": heroBirthday,
  "hero-cinematic": heroCinematic,
  "hero-corporate": heroCorporate,
  "hero-nye": heroNye,
  "hero-fiesta": heroFiesta,
  "hero-beach": heroBeach,
  "hero-wedding": heroWedding,
  "hero-engagement": heroEngagement,
};

interface VendorCardProps {
  vendor: {
    id: string;
    name: string;
    category: string;
    description: string;
    rating: number;
    reviews: number;
    startingPrice: number;
    distance: string;
    availability: string;
    image: string;
    location?: string;
    responderTier?: "fast" | "standard" | null;
    isReal?: boolean;
    verifiedKinds?: string[];
  };
  /** Above-the-fold cards should pass eager so the first paint isn't a flash of empty squares. */
  eager?: boolean;
}

export function VendorCard({ vendor, eager = false }: VendorCardProps) {
  const { isSaved, toggle } = useSavedVendors();
  const { isCompared, toggle: toggleCompare } = useCompareVendors();
  const saved = isSaved(vendor.id);
  const compared = isCompared(vendor.id);

  return (
    <Link to={`/vendors/${vendor.id}`} className="group block">
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-sm mb-3 bg-muted">
          <Picture
            source={imageMap[vendor.image]}
            alt={vendor.name}
            loading={eager ? "eager" : "lazy"}
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            fetchPriority={eager ? "high" : "auto"}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/55 via-transparent to-transparent" />

          <div className="absolute top-2 right-2 flex flex-col gap-1.5">
            <button
              aria-label={saved ? "Remove from saved" : "Save vendor"}
              onClick={(e) => {
                e.preventDefault();
                toggle(vendor.id, { isReal: vendor.isReal });
              }}
              className="w-7 h-7 rounded-full bg-background/85 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
            >
              <Heart
                className={`w-3.5 h-3.5 transition-colors ${
                  saved ? "fill-accent text-accent" : "text-foreground"
                }`}
              />
            </button>
            <button
              aria-label={compared ? "Remove from compare" : "Add to compare"}
              aria-pressed={compared}
              onClick={(e) => {
                e.preventDefault();
                toggleCompare(vendor.id);
              }}
              className={`w-7 h-7 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
                compared
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-background/85 hover:bg-background"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
            </button>
          </div>

          {vendor.responderTier === "fast" ? (
            <Badge className="absolute top-3 left-3 bg-accent text-accent-foreground backdrop-blur-sm border-none gap-1">
              <Zap className="w-3 h-3 fill-accent-foreground" />
              Fast responder
            </Badge>
          ) : vendor.availability !== "available" ? (
            <Badge className="absolute top-3 left-3 bg-background/85 text-foreground backdrop-blur-sm border-none">
              Limited availability
            </Badge>
          ) : null}

          <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between text-background">
            <p className="font-label tracking-[0.2em] text-[10px]">{vendor.category}</p>
            <div className="flex items-center gap-1 text-[11px]">
              <Star className="w-3 h-3 fill-accent text-accent" />
              <span className="tnum font-medium">{vendor.rating}</span>
              <span className="text-background/70 tnum">({vendor.reviews})</span>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-display text-base leading-tight transition-colors group-hover:text-accent">
              {vendor.name}
            </h3>
            {vendor.verifiedKinds && vendor.verifiedKinds.length > 0 && (
              <VerificationBadges
                kinds={vendor.verifiedKinds}
                size="compact"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1 leading-snug">
            {vendor.description}
          </p>
          <div className="flex items-center justify-between pt-0.5">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" />
              {vendor.location ?? vendor.distance}
            </p>
            <p className="text-xs tnum font-medium">
              From ${vendor.startingPrice.toLocaleString()}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
