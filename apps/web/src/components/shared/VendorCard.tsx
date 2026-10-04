import {
  MapPin,
  Heart,
  ImageIcon,
} from "lucide-react";
import { formatListingPrice } from "@vendora/core";
import { useSavedVendors } from "@/hooks/useSavedVendors";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import { VerificationBadges } from "@/components/vendor/VerificationBadges";
import { StudioVerifiedBadge } from "@/components/vendor/StudioVerifiedBadge";
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
    priceMinCents?: number | null;
    priceMaxCents?: number | null;
    customPricing?: boolean | null;
    pricingModels?: string[] | null;
    distance: string;
    availability: string;
    image: string;
    heroImageUrl?: string | null;
    location?: string;
    responderTier?: "fast" | "standard" | null;
    isReal?: boolean;
    verifiedKinds?: string[];
    /** True when this vendor's subscription_tier === 'studio'. Shows
     *  a blue check next to the name on the card. Distinct from
     *  verifiedKinds, which is document-based KYC. */
    studioVerified?: boolean;
  };
  /** Above-the-fold cards should pass eager so the first paint isn't a flash of empty squares. */
  eager?: boolean;
  /** `dark` for dark pages (the vendors page): faint white fill, white-at-15% hairline, cream text, champagne accents. */
  tone?: "light" | "dark";
  /** Taller 4:5 photo, for wider cards. */
  tall?: boolean;
}

export function VendorCard({ vendor, eager = false, tone = "light", tall = false }: VendorCardProps) {
  const { isSaved, toggle } = useSavedVendors();
  const saved = isSaved(vendor.id);
  const dark = tone === "dark";

  // Flat card (brand standard): cream fill, hairline border that darkens
  // on hover, nothing lifts. Photo inset with its own corners, then the
  // category in small bronze capitals, the name, and location | price.
  // On dark pages the hairline brightens instead and the accents turn
  // champagne.
  return (
    <Link
      to={`/vendors/${vendor.id}`}
      className={`group flex h-full flex-col rounded-2xl border p-2 transition-colors ${
        dark
          ? "border-white/15 bg-white/[0.03] text-[#f4f1ea] hover:border-white/40"
          : "border-border bg-card hover:border-foreground/30"
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-xl ${tall ? "aspect-[4/5]" : "aspect-[4/3]"} ${
          dark ? "bg-white/5" : "bg-muted"
        }`}
      >
        {vendor.heroImageUrl ? (
          <img
            src={vendor.heroImageUrl}
            alt={vendor.name}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          // No portfolio photo on the listing → neutral placeholder.
          // We never substitute stock category art / posts / logos:
          // the marketplace card only shows what the vendor put
          // into their listing.
          <div
            className={`w-full h-full flex flex-col items-center justify-center gap-1 ${
              dark ? "text-[#f4f1ea]/75" : "bg-muted text-muted-foreground"
            }`}
          >
            <ImageIcon className="w-6 h-6" aria-hidden="true" />
            <span className="text-xs">No listing photos yet</span>
          </div>
        )}
        {/* Only the save button sits on the photo. */}
        <button
          aria-label={saved ? "Remove from saved" : "Save vendor"}
          onClick={(e) => {
            e.preventDefault();
            toggle(vendor.id, { isReal: vendor.isReal });
          }}
          className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 transition-colors hover:bg-white"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              saved ? "fill-accent text-accent" : "text-foreground"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-4">
        <p
          className={`m-0 truncate text-[11px] font-bold uppercase tracking-[0.18em] ${
            dark ? "text-gold" : "text-accent"
          }`}
        >
          {vendor.category}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <h3
            className={`m-0 min-w-0 truncate font-editorial text-[19px] leading-tight transition-colors ${
              dark ? "group-hover:text-gold" : "group-hover:text-accent"
            }`}
          >
            {vendor.name}
          </h3>
          {vendor.studioVerified && <StudioVerifiedBadge />}
          {vendor.verifiedKinds && vendor.verifiedKinds.length > 0 && (
            <VerificationBadges kinds={vendor.verifiedKinds} size="compact" />
          )}
        </div>
        <div className="mt-auto flex items-center gap-3 pt-4 text-[13px]">
          <p className="m-0 flex min-w-0 flex-1 items-center gap-1.5">
            <MapPin className={`h-3.5 w-3.5 shrink-0 ${dark ? "text-gold" : "text-accent"}`} aria-hidden />
            <span className="truncate">{vendor.location ?? vendor.distance}</span>
          </p>
          <span className={`h-5 w-px shrink-0 ${dark ? "bg-white/15" : "bg-border"}`} aria-hidden />
          <p className="m-0 shrink-0 tnum">
            {formatListingPrice(vendor.priceMinCents, vendor.priceMaxCents)}
          </p>
        </div>
      </div>
    </Link>
  );
}
