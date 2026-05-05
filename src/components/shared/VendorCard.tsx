import { motion } from "framer-motion";
import { Star, MapPin, Heart, Zap, GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSavedVendors } from "@/hooks/useSavedVendors";
import { useCompareVendors } from "@/hooks/useCompareVendors";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import { VerificationBadges } from "@/components/vendor/VerificationBadges";
// vite-imagetools auto-pictureifies anything in /assets/vendor-* (see
// vite.config.ts) into AVIF + WebP + JPG variants at 640/1024/1600
// widths. Each import below resolves to a { sources, img } picture
// object. ~50% bandwidth cut on the directory.
import vendorPhotographer from "@/assets/vendor-photographer.jpg?as=picture";
import vendorFlorist from "@/assets/vendor-florist.jpg?as=picture";
import vendorCatering from "@/assets/vendor-catering.jpg?as=picture";
import vendorDj from "@/assets/vendor-dj.jpg?as=picture";
import vendorVenue from "@/assets/vendor-venue.jpg?as=picture";
import vendorMakeup from "@/assets/vendor-makeup.jpg?as=picture";

const imageMap: Record<string, PictureSource> = {
  "vendor-photographer": vendorPhotographer,
  "vendor-florist": vendorFlorist,
  "vendor-catering": vendorCatering,
  "vendor-dj": vendorDj,
  "vendor-venue": vendorVenue,
  "vendor-makeup": vendorMakeup,
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
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm mb-4 bg-muted">
          <Picture
            source={imageMap[vendor.image]}
            alt={vendor.name}
            loading={eager ? "eager" : "lazy"}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            fetchPriority={eager ? "high" : "auto"}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/55 via-transparent to-transparent" />

          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <button
              aria-label={saved ? "Remove from saved" : "Save vendor"}
              onClick={(e) => {
                e.preventDefault();
                toggle(vendor.id, { isReal: vendor.isReal });
              }}
              className="w-9 h-9 rounded-full bg-background/85 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
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
              className={`w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
                compared
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-background/85 hover:bg-background"
              }`}
            >
              <GitCompare className="w-4 h-4" />
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

          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-background">
            <p className="font-label tracking-[0.25em]">{vendor.category}</p>
            <div className="flex items-center gap-1 text-xs">
              <Star className="w-3 h-3 fill-accent text-accent" />
              <span className="tnum font-medium">{vendor.rating}</span>
              <span className="text-background/70 tnum">({vendor.reviews})</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg leading-tight transition-colors group-hover:text-accent">
              {vendor.name}
            </h3>
            {vendor.verifiedKinds && vendor.verifiedKinds.length > 0 && (
              <VerificationBadges
                kinds={vendor.verifiedKinds}
                size="compact"
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1 leading-relaxed">
            {vendor.description}
          </p>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              {vendor.location ?? vendor.distance}
            </p>
            <p className="text-sm tnum font-medium">
              From ${vendor.startingPrice.toLocaleString()}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
