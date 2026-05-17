import { motion } from "framer-motion";
import {
  MapPin,
  Heart,
  GitCompare,
  ImageIcon,
} from "lucide-react";
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
export const imageMap: Record<string, PictureSource> = {
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
    heroImageUrl?: string | null;
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
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl mb-3 bg-muted">
          {vendor.heroImageUrl ? (
            <img
              src={vendor.heroImageUrl}
              alt={vendor.name}
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : "auto"}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            // No portfolio photo on the listing → neutral placeholder.
            // We never substitute stock category art / posts / logos:
            // the marketplace card only shows what the vendor put
            // into their listing.
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
              <ImageIcon className="w-6 h-6" aria-hidden="true" />
              <span className="text-xs">No listing photos yet</span>
            </div>
          )}
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

          {/* Nothing overlays the photo on purpose — only the save /
              compare buttons in the top-right corner sit on top of the
              image. Category, rating, and availability surface in the
              text block below instead. */}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-editorial text-lg leading-tight transition-colors group-hover:text-accent">
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
