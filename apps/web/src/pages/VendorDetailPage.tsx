import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Star,
  MapPin,
  Heart,
  Clock,
  Sparkles,
  Check,
  ArrowLeft,
  Calendar,
  Share2,
  Mail,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { vendorImageUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { Lightbox } from "@/components/shared/Lightbox";
import { VideoEmbed } from "@/components/vendor/VideoEmbed";
import { ShowcaseStrip } from "@/components/vendor/ShowcaseStrip";
import { VendorSocialFeed } from "@/components/vendor/VendorSocialFeed";
import { VendorOtherListings } from "@/components/vendor/VendorOtherListings";
import { VendorBrandCard } from "@/components/vendor/VendorBrandCard";
import { VerificationBadges } from "@/components/vendor/VerificationBadges";
import { CoBookedRail } from "@/components/vendor/CoBookedRail";
import {
  ImportedReviewsList,
  type ImportedReview,
} from "@/components/vendor/ImportedReviewsList";
import { VendorFaqList } from "@/components/vendor/VendorFaqList";
import {
  VendorFaqsPublic,
} from "@/components/vendor/VendorFaqsManager";
import { SocialEmbedCard } from "@/components/vendor/SocialEmbedCard";
import { VendorBundlesPublic } from "@/components/vendor/VendorBundlesPublic";
import {
  VendorReviewsList,
  type RealReview,
} from "@/components/vendor/VendorReviewsList";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
// Lazy: 618-line modal only loads when the user clicks "Send inquiry."
const InquiryFormModal = lazy(() =>
  import("@/components/inquiries/InquiryFormModal").then((m) => ({
    default: m.InquiryFormModal,
  })),
);
import { useAuth } from "@/hooks/useAuth";
import { useVendors } from "@/hooks/useVendors";
import { useSavedVendors } from "@/hooks/useSavedVendors";

// vite-imagetools auto-pictureifies anything in /assets/vendor-*,
// /assets/vendora-*, and /assets/hero/* (see vite.config.ts) into
// AVIF + WebP + JPG variants at 640/1024/1600 widths. Each import
// resolves to a { sources, img } picture object — render with
// <Picture>, extract `.img.src` if a plain URL string is needed
// (meta tags, JSON-LD, lightbox).
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
import heroKids from "@/assets/vendora-hero-kids.jpg?as=picture";
import heroCorporate from "@/assets/hero/corporate.jpg?as=picture";
import heroNye from "@/assets/hero/nye.jpg?as=picture";
import heroFiesta from "@/assets/hero/fiesta.jpg?as=picture";
import heroBeach from "@/assets/hero/beach.jpg?as=picture";
import heroWedding from "@/assets/hero/wedding.jpg?as=picture";
import heroEngagement from "@/assets/hero/engagement.jpg?as=picture";
import { ReportButton } from "@/components/trust/ReportButton";
import { VendorPolicyBadges } from "@/components/vendor/VendorPolicyBadges";
import { VendorServiceAreaMap } from "@/components/vendor/VendorServiceAreaMap";
import { CategoryAttributesDisplay } from "@/components/vendor/CategoryAttributesDisplay";
import { SilentErrorBoundary } from "@/components/shared/SilentErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import { VendorTeamPublic } from "@/components/vendor/VendorTeamPublic";
import { VendorAvailabilityPublic } from "@/components/vendor/VendorAvailabilityPublic";

// Keep this in lockstep with VendorCard's imageMap — every key the
// useVendors normalizer might emit needs an entry here too, otherwise
// the lookup misses and the hero falls back to featureFlorals.
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

const portfolioPool: PictureSource[] = [
  featureFlorals,
  featureLounge,
  heroDinner,
  heroGala,
  heroBirthday,
  heroKids,
];

const samplePackages = [
  {
    name: "Essentials",
    price: "From $1,800",
    description: "Core coverage for intimate events up to 50 guests.",
    features: ["4 hours on-site", "Edited gallery within 2 weeks", "Online proof viewer"],
  },
  {
    name: "Signature",
    price: "From $3,200",
    description: "Most popular — full event coverage for weddings and milestones.",
    features: [
      "8 hours on-site",
      "Two-photographer team",
      "Edited gallery within 2 weeks",
      "Sneak-peek within 48 hours",
      "Print release included",
    ],
    featured: true,
  },
  {
    name: "Atelier",
    price: "Custom",
    description: "Bespoke multi-day or destination engagements.",
    features: [
      "Tailored to your event",
      "Travel & lodging arranged",
      "Custom album design",
      "White-glove production",
    ],
  },
];

const sampleReviews = [
  {
    name: "Sarah & James M.",
    event: "Wedding · Hudson Valley",
    rating: 5,
    text: "Beyond what we hoped for. They were calm, present, and somehow caught every quiet moment without us noticing they were there. Galleries delivered ahead of schedule.",
  },
  {
    name: "Elena V.",
    event: "Corporate gala · Manhattan",
    rating: 5,
    text: "Booked them for our annual fundraiser. Professional, on-brief, and the final images were unanimously the best we've ever had. Will book again.",
  },
  {
    name: "Maya & Anand",
    event: "Engagement · Brooklyn",
    rating: 5,
    text: "We're not naturally comfortable in front of a camera — somehow they made the whole afternoon feel easy. The photos genuinely look like us at our best.",
  },
];

const sampleFaqs = [
  {
    q: "How far in advance should I book?",
    a: "For peak season (May–October), 9–12 months ahead. For off-season or weekday events, 3–6 months is usually fine.",
  },
  {
    q: "Do you travel?",
    a: "Yes — happy to travel anywhere in the continental US, with travel and lodging arranged separately. International on request.",
  },
  {
    q: "What's your cancellation policy?",
    a: "Deposits are non-refundable, but transferable to a new date with 60+ days' notice. Full policy is shared in the booking contract.",
  },
];

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorDetailPage() {
  const navigate = useNavigate();
  // Route is either /vendors/:id or /v/:slug — accept both.
  const { id, slug } = useParams();
  const { session, profile, isApprovedVendor, loading: authLoading } = useAuth();
  const { vendors, loading: vendorsLoading } = useVendors();
  const { isSaved, toggle: toggleSave } = useSavedVendors();
  const [signinPromptOpen, setSigninPromptOpen] = useState(false);
  const [inquiryFormOpen, setInquiryFormOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const vendor = id
    ? vendors.find((v) => v.id === id)
    : slug
      ? vendors.find((v) => v.slug === slug)
      : undefined;
  const saved = vendor ? isSaved(vendor.id) : false;

  // Real portfolio images (only if this is a DB-backed vendor).
  interface RealPortfolioItem {
    src: string;
    caption: string | null;
  }
  const [realPortfolio, setRealPortfolio] = useState<RealPortfolioItem[]>([]);
  useEffect(() => {
    if (!vendor || !vendor.isReal) {
      setRealPortfolio([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("vendor_portfolio_images")
      .select("storage_path, caption, display_order, created_at")
      .eq("vendor_id", vendor.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
          if (cancelled) return;
          // Detail-page portfolio renders at most ~800px wide; request
          // transformed images at that size to save bandwidth.
          const items = (data ?? []).map((r) => ({
            src: vendorImageUrl(r.storage_path, { width: 1000 }),
            caption: r.caption,
          }));
          setRealPortfolio(items);
        });
    return () => {
      cancelled = true;
    };
  }, [vendor]);

  // Real vendors only show their own uploaded portfolio. Demo /
  // sampleData vendors fall back to the bundled portfolioPool art so
  // the marketing-facing showcase pages stay populated.
  const portfolioItems: RealPortfolioItem[] = vendor?.isReal
    ? realPortfolio
    : realPortfolio.length > 0
      ? realPortfolio
      : portfolioPool.map((p) => ({ src: p.img.src, caption: null }));
  // Backwards-compat: many call sites still expect a string[] of URLs.
  const portfolioImages = portfolioItems.map((p) => p.src);

  // Track a profile view (real DB-backed vendors only). Fire-and-forget.
  useEffect(() => {
    if (!vendor || !vendor.isReal) return;
    supabase
      .from("vendor_profile_views")
      .insert({
        vendor_id: vendor.id,
        viewer_id: session?.user?.id ?? null,
      })
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor?.id, vendor?.isReal]);

  // Real reviews (only for DB-backed vendors)
  const [realReviews, setRealReviews] = useState<RealReview[]>([]);
  useEffect(() => {
    if (!vendor || !vendor.isReal) {
      setRealReviews([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("reviews")
      .select(
        "id, rating, body, photo_urls, created_at, host:profiles!reviews_host_id_fkey(display_name), response:review_responses(body), inquiry:inquiries!reviews_inquiry_id_fkey(event_type, event_date)",
      )
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data as RealReview[] | null) ?? [];
        // Supabase returns response as array for has-many; flatten.
        const normalized = rows.map((r) => ({
          ...r,
          response: Array.isArray(r.response)
            ? (r.response[0] ?? null)
            : r.response,
          inquiry: Array.isArray(r.inquiry)
            ? (r.inquiry[0] ?? null)
            : r.inquiry,
        }));
        setRealReviews(normalized);
      });
    return () => {
      cancelled = true;
    };
  }, [vendor]);

  // Imported reviews from external platforms (vendor-pasted).
  const [importedReviews, setImportedReviews] = useState<ImportedReview[]>([]);
  useEffect(() => {
    if (!vendor || !vendor.isReal) {
      setImportedReviews([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("imported_reviews")
      .select("id, source, reviewer_name, rating, body, reviewed_at")
      .eq("vendor_id", vendor.id)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setImportedReviews((data as ImportedReview[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [vendor]);

  // Verification badges (kinds only — never document paths).
  const [verifiedKinds, setVerifiedKinds] = useState<string[]>([]);
  useEffect(() => {
    if (!vendor || !vendor.isReal) {
      setVerifiedKinds([]);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("vendor_public_badges")
      .select("kinds")
      .eq("vendor_id", vendor.id)
      .maybeSingle()
      .then(({ data }: { data: { kinds: string[] } | null }) => {
        if (cancelled) return;
        setVerifiedKinds(data?.kinds ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [vendor]);

  // Recommendations this vendor has curated.
  interface RecRow {
    id: string;
    recommended_id: string;
    note: string | null;
    recommended: {
      id: string;
      business_name: string;
      category: string;
      location: string | null;
    } | null;
  }
  const [recommendations, setRecommendations] = useState<RecRow[]>([]);
  useEffect(() => {
    if (!vendor || !vendor.isReal) {
      setRecommendations([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("vendor_recommendations")
      .select(
        "id, recommended_id, note, recommended:vendor_profiles!vendor_recommendations_recommended_id_fkey(id, business_name, category, location)",
      )
      .eq("recommender_id", vendor.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setRecommendations((data as RecRow[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [vendor]);

  const reviewsAvg =
    realReviews.length > 0
      ? realReviews.reduce((sum, r) => sum + r.rating, 0) / realReviews.length
      : vendor?.rating ?? 0;
  const reviewsCount =
    realReviews.length > 0 ? realReviews.length : vendor?.reviews ?? 0;

  // Pricing packages (active only, sorted by display_order then price).
  interface VendorPackage {
    id: string;
    name: string;
    description: string | null;
    price_cents: number;
    includes: string[];
  }
  const [packages, setPackages] = useState<VendorPackage[]>([]);
  useEffect(() => {
    if (!vendor || !vendor.isReal) {
      setPackages([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("vendor_packages")
      .select("id, name, description, price_cents, includes, display_order")
      .eq("vendor_id", vendor.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("price_cents", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setPackages((data as VendorPackage[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [vendor]);

  // Per-vendor title + OG/Twitter card so social shares of vendor URLs
  // unfurl with the hero image + name + category.
  useDocumentMeta(
    vendor
      ? {
          title: `${vendor.name} — ${vendor.category} on Vendora`,
          description:
            vendor.description ||
            `${vendor.category} on Vendora${vendor.location ? ` · ${vendor.location}` : ""}`,
          image: (imageMap[vendor.image] ?? featureFlorals).img.src,
          type: "product",
        }
      : { title: "Vendor — Vendora" },
  );

  // JSON-LD structured data for SEO. LocalBusiness covers vendors broadly
  // (event services, venues). Includes aggregateRating + priceRange so rich
  // snippets show stars and "$$$" tier in Google.
  useEffect(() => {
    if (!vendor) return;
    const heroForSchema = (imageMap[vendor.image] ?? featureFlorals).img.src;
    const id = "vendor-jsonld";
    const data = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: vendor.name,
      description: vendor.description,
      image: heroForSchema,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      address: vendor.location
        ? {
            "@type": "PostalAddress",
            addressLocality: vendor.location,
          }
        : undefined,
      priceRange:
        vendor.startingPrice >= 8000
          ? "$$$$"
          : vendor.startingPrice >= 3000
            ? "$$$"
            : vendor.startingPrice >= 1000
              ? "$$"
              : "$",
      aggregateRating:
        reviewsCount > 0
          ? {
              "@type": "AggregateRating",
              ratingValue: reviewsAvg.toFixed(1),
              reviewCount: reviewsCount,
              bestRating: 5,
              worstRating: 1,
            }
          : undefined,
    };
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
    return () => {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
    };
  }, [vendor, reviewsAvg, reviewsCount]);

  function handleInquiryClick() {
    if (authLoading) return;
    if (!session || !profile) {
      setSigninPromptOpen(true);
      return;
    }
    // Multi-role: any non-admin can send an inquiry (including approved
    // vendors planning their own events).
    if (profile.role === "admin") {
      toast.info("Inquiries are sent from host or vendor accounts, not admin.");
      return;
    }
    setInquiryFormOpen(true);
  }

  async function handleShare() {
    if (!vendor) return;
    const shareUrl = `${window.location.origin}/vendors/${vendor.id}`;
    const shareData = {
      title: vendor.name,
      text: `Check out ${vendor.name} on Vendora`,
      url: shareUrl,
    };
    // Web Share API is the right experience on mobile (system share
    // sheet). On desktop where it's missing, fall back to clipboard.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // AbortError fires when the user dismisses the share sheet —
        // not an error, just a cancel. Silently no-op.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  async function handleMessageClick() {
    if (authLoading || !vendor) return;
    if (!session || !profile) {
      setSigninPromptOpen(true);
      return;
    }
    // Approved vendors talk to other vendors through the partner thread;
    // hosts (everyone else non-admin) get the regular host-vendor DM.
    if (isApprovedVendor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "find_or_create_partner_thread",
        { p_other_vendor_id: vendor.id },
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      navigate(`/vendor/partners?thread=${data}`);
      return;
    }
    if (profile.role === "admin") {
      toast.info("Messages are sent from host or vendor accounts, not admin.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "find_or_create_direct_thread",
      { p_vendor_id: vendor.id },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(`/customer/messages?thread=${data}`);
  }

  const related = useMemo(() => {
    if (!vendor) return [];
    const sameCat = vendors.filter(
      (v) => v.id !== vendor.id && v.category === vendor.category,
    );
    if (sameCat.length >= 3) return sameCat.slice(0, 3);
    const others = vendors.filter((v) => v.id !== vendor.id && v.category !== vendor.category);
    return [...sameCat, ...others].slice(0, 3);
  }, [vendor]);

  if (!vendor && vendorsLoading) {
    return <VendorDetailSkeleton />;
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <div className="pt-32 pb-24 container mx-auto px-6 text-center">
          <p className="font-label text-muted-foreground mb-4">404</p>
          <h1 className="font-display text-3xl mb-3">Vendor not found</h1>
          <p className="text-sm text-muted-foreground mb-8">
            We couldn't find the vendor you're looking for.
          </p>
          <Link to="/vendors">
            <Button variant="outline" className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to directory
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const heroPicture = imageMap[vendor.image] ?? featureFlorals;

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <PublicNav />

      {/* Cinematic vendor hero */}
      <section className="relative h-[80svh] min-h-[560px] w-full overflow-hidden">
        <div className="absolute inset-0">
          {vendor.heroImageUrl ? (
            <img
              src={vendor.heroImageUrl}
              alt={vendor.name}
              loading="eager"
              fetchPriority="high"
              className="w-full h-full object-cover"
            />
          ) : (
            <Picture
              source={heroPicture}
              alt={vendor.name}
              loading="eager"
              fetchPriority="high"
              sizes="100vw"
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/55 via-foreground/30 to-foreground/85" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/55 via-transparent to-transparent" />
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
              Back to directory
            </Link>
          </div>

          <div className="flex-1 flex items-end pb-12 md:pb-16">
            <div className="container mx-auto px-6 md:px-8">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.15 }}
                className="flex items-center gap-4 mb-5"
              >
                <p className="font-label text-accent tracking-[0.4em]">— {vendor.category.toUpperCase()}</p>
                {vendor.responderTier === "fast" && (
                  <Badge className="bg-accent text-accent-foreground backdrop-blur-sm border-none gap-1">
                    <Zap className="w-3 h-3 fill-accent-foreground" />
                    Fast responder
                  </Badge>
                )}
                {vendor.availability === "available" ? (
                  <Badge className="bg-accent/15 text-accent border border-accent/30 backdrop-blur-sm">
                    Available
                  </Badge>
                ) : (
                  <Badge className="bg-background/15 text-background border border-background/30 backdrop-blur-sm">
                    Limited availability
                  </Badge>
                )}
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.3, duration: 0.9 }}
                className="text-hero font-display text-background leading-[1.0] mb-4 max-w-3xl"
              >
                {vendor.name}
              </motion.h1>
              {verifiedKinds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.4 }}
                  className="mb-5"
                >
                  <VerificationBadges kinds={verifiedKinds} />
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.5 }}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 text-background/85 text-sm"
              >
                {reviewsCount > 0 && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 fill-accent text-accent" />
                      <span className="font-medium tnum">
                        {reviewsAvg.toFixed(1)}
                      </span>
                      <span className="text-background/60 tnum">
                        ({reviewsCount} reviews)
                      </span>
                    </div>
                    <span className="hidden md:inline text-background/30">·</span>
                  </>
                )}
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{vendor.location ?? vendor.distance}</span>
                </div>
                <span className="hidden md:inline text-background/30">·</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Replies in &lt; 3 hours via AI-assisted drafts</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 md:px-8">
          <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-16">
              {/* Cream-Ocean brand card — peach gradient + radial sun
                  + italic-serif name + stat strip. Mirrors the mobile
                  vendor profile sheet identity hero. */}
              {vendor.isReal && <VendorBrandCard vendorId={vendor.id} />}

              {/* About */}
              <div>
                <p className="font-label text-accent mb-4">About</p>
                <h2 className="font-display text-3xl mb-6 leading-tight">
                  {vendor.description}
                </h2>
                <div className="space-y-4 text-foreground/75 leading-relaxed">
                  <p>
                    Based in {vendor.location ?? "the city"}, {vendor.name} brings a
                    distinctive editorial sensibility to every event — small enough
                    to be personal, experienced enough to disappear into the
                    background when you need them to.
                  </p>
                  <p>
                    Every booking includes an in-person or video consultation, a
                    detailed run-of-show, and direct access on the day of your
                    event. We don't believe in upsells or fine print. What you see
                    here is what you get.
                  </p>
                </div>
              </div>

              {/* Packages — real DB packages take priority; fall back to
                  the sample tiers so demo vendors still show meaningful
                  pricing UI. */}
              <div>
                <p className="font-label text-accent mb-4">Packages</p>
                <h2 className="font-display text-3xl mb-8">
                  {packages.length > 0
                    ? packages.length === 1
                      ? "Available package"
                      : `${packages.length} ways to work together`
                    : "Three ways to work together"}
                </h2>
                {packages.length === 0 && vendor.isReal ? (
                  <p className="text-sm text-muted-foreground italic max-w-lg">
                    Packages aren't published yet — message {vendor.name} for
                    a tailored quote.
                  </p>
                ) : packages.length > 0 ? (
                  <div className={`grid gap-4 ${packages.length >= 3 ? "md:grid-cols-3" : packages.length === 2 ? "md:grid-cols-2" : "md:grid-cols-1 max-w-md"}`}>
                    {packages.map((pkg, i) => {
                      const featured = packages.length >= 2 && i === Math.floor(packages.length / 2);
                      return (
                        <div
                          key={pkg.id}
                          className={`relative rounded-sm p-6 border transition-colors ${
                            featured
                              ? "border-accent bg-accent/5"
                              : "border-border bg-card"
                          }`}
                        >
                          {featured && (
                            <Badge className="absolute -top-2.5 left-6 bg-accent text-accent-foreground">
                              Most popular
                            </Badge>
                          )}
                          <p className="font-label text-muted-foreground mb-2">
                            {pkg.name}
                          </p>
                          <p className="font-display text-2xl mb-3 tnum">
                            ${(pkg.price_cents / 100).toLocaleString()}
                          </p>
                          {pkg.description && (
                            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                              {pkg.description}
                            </p>
                          )}
                          {pkg.includes.length > 0 && (
                            <ul className="space-y-2.5">
                              {pkg.includes.map((f, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                  <Check className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                                  <span className="text-foreground/85">{f}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid md:grid-cols-3 gap-4">
                    {samplePackages.map((pkg) => (
                      <div
                        key={pkg.name}
                        className={`relative rounded-sm p-6 border transition-colors ${
                          pkg.featured
                            ? "border-accent bg-accent/5"
                            : "border-border bg-card"
                        }`}
                      >
                        {pkg.featured && (
                          <Badge className="absolute -top-2.5 left-6 bg-accent text-accent-foreground">
                            Most popular
                          </Badge>
                        )}
                        <p className="font-label text-muted-foreground mb-2">{pkg.name}</p>
                        <p className="font-display text-2xl mb-3 tnum">{pkg.price}</p>
                        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                          {pkg.description}
                        </p>
                        <ul className="space-y-2.5">
                          {pkg.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-sm">
                              <Check className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                              <span className="text-foreground/85">{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Intro video — optional, only when vendor sets one */}
              {vendor.introVideoUrl && (
                <div>
                  <p className="font-label text-accent mb-4">Meet the team</p>
                  <h2 className="font-display text-3xl mb-8">In their own words</h2>
                  <div className="aspect-video w-full overflow-hidden rounded-sm bg-muted">
                    <VideoEmbed
                      url={vendor.introVideoUrl}
                      title={`${vendor.name} intro`}
                    />
                  </div>
                </div>
              )}

              {/* Portfolio — hidden entirely on real vendors who
                  haven't uploaded any photos yet. The empty grid +
                  "Recent work" headline read as a broken section
                  rather than a not-yet-populated one. */}
              {portfolioItems.length > 0 && (
              <div>
                <p className="font-label text-accent mb-4">Portfolio</p>
                <h2 className="font-display text-3xl mb-8">Recent work</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {portfolioItems.map((item, i) => {
                    const altText =
                      item.caption ?? `${vendor.name} portfolio ${i + 1}`;
                    return (
                    <motion.button
                      type="button"
                      key={`${item.src}-${i}`}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ ...spring, delay: i * 0.05 }}
                      onClick={() => setLightboxIndex(i)}
                      className={`group overflow-hidden rounded-sm bg-muted block ${
                        i === 0 ? "col-span-2 row-span-2 aspect-square md:aspect-[4/3]" : "aspect-square"
                      }`}
                      aria-label={`Open ${altText}`}
                    >
                      <img
                        src={item.src}
                        alt={altText}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                      />
                    </motion.button>
                    );
                  })}
                </div>
              </div>
              )}

              {/* Each section wrapped in a per-component silent
                  error boundary so a single rogue component (most
                  common offender: leaflet inside the service-area
                  map for vendors with weird geocode data) can't take
                  the whole detail page down — it just hides itself. */}
              {vendor.isReal && (
                <SilentErrorBoundary label="VendorBundlesPublic">
                  <VendorBundlesPublic vendorId={vendor.id} />
                </SilentErrorBoundary>
              )}

              {/* Category-specific structured fields (capacity, ceremony
                  types, package hours, etc — schema lives in
                  data/categoryAttributes.ts). Renders nothing for
                  categories without a schema yet. */}
              {vendor.isReal && (
                <SilentErrorBoundary label="CategoryAttributesDisplay">
                  <CategoryAttributesDisplay
                    vendorId={vendor.id}
                    category={vendor.category}
                  />
                </SilentErrorBoundary>
              )}

              {/* Showcase reels — vertical clips, autoplay-on-view */}
              {vendor.isReal && (
                <SilentErrorBoundary label="ShowcaseStrip">
                  <ShowcaseStrip vendorId={vendor.id} />
                </SilentErrorBoundary>
              )}

              {/* Social feed — vendor_posts grid + vendor_buzz cards.
                  Surfaces the same content the mobile host vendor page
                  shows. Renders nothing if both are empty. */}
              {vendor.isReal && (
                <SilentErrorBoundary label="VendorSocialFeed">
                  <VendorSocialFeed vendorId={vendor.id} />
                </SilentErrorBoundary>
              )}

              {/* "More from this vendor" — every approved listing owned
                  by the same user_id, excluding this one. Mirrors the
                  Other Listings section in the mobile VendorProfileSheet. */}
              {vendor.isReal && (
                <SilentErrorBoundary label="VendorOtherListings">
                  <VendorOtherListings vendorId={vendor.id} />
                </SilentErrorBoundary>
              )}

              {/* Team — owner + staff cards. Renders nothing when empty. */}
              {vendor.isReal && (
                <SilentErrorBoundary label="VendorTeamPublic">
                  <VendorTeamPublic vendorId={vendor.id} />
                </SilentErrorBoundary>
              )}

              {/* Availability — Turo/Airbnb-style calendar with
                  blocked dates struck through. */}
              {vendor.isReal && (
                <SilentErrorBoundary label="VendorAvailabilityPublic">
                  <VendorAvailabilityPublic vendorId={vendor.id} />
                </SilentErrorBoundary>
              )}

              {/* Service area coverage map (leaflet) — wrapped because
                  this is the most likely thrower; bad geocode coords
                  or a stale leaflet build can crash inside the
                  renderer. */}
              {vendor.isReal && (
                <SilentErrorBoundary label="VendorServiceAreaMap">
                  <VendorServiceAreaMap
                    vendorId={vendor.id}
                    category={vendor.category}
                  />
                </SilentErrorBoundary>
              )}

              {/* Reviews — real vendors only show their own reviews;
                  demo vendors fall back to sampleReviews so the
                  marketing pages still feel populated. */}
              <VendorReviewsList
                realReviews={realReviews}
                samples={vendor.isReal ? [] : sampleReviews}
                averageRating={reviewsAvg}
                totalCount={reviewsCount}
                vendorName={vendor.name}
              />

              {/* Imported reviews from other platforms */}
              <ImportedReviewsList
                reviews={importedReviews}
                vendorName={vendor.name}
              />

              {/* Often booked with (cross-sell from booking signal + curated) */}
              {vendor.isReal && (
                <CoBookedRail
                  cobookedFor={vendor.id}
                  eyebrow="Often booked with"
                  title={`Hosts who booked ${vendor.name} also booked`}
                />
              )}

              {/* Vendors we love (from this vendor) */}
              {recommendations.length > 0 && (
                <div>
                  <p className="font-label text-accent mb-4">Recommendations</p>
                  <h2 className="font-display text-3xl mb-6">
                    Vendors {vendor.name} loves
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recommendations.map((r) => (
                      <Link
                        key={r.id}
                        to={`/vendors/${r.recommended_id}`}
                        className="group block rounded-sm border border-border bg-card p-4 hover:border-foreground/30 transition-colors"
                      >
                        <p className="font-display text-base group-hover:text-accent transition-colors">
                          {r.recommended?.business_name ?? "Vendor"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.recommended?.category}
                          {r.recommended?.location
                            ? ` · ${r.recommended.location}`
                            : ""}
                        </p>
                        {r.note && (
                          <p className="text-xs text-foreground/75 leading-relaxed mt-3 italic line-clamp-3">
                            "{r.note}"
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* FAQ */}
              {/* Vendor's own FAQ entries take precedence; static
                  sampleFaqs only shows when the vendor hasn't set up any. */}
              {vendor.isReal ? (
                <>
                  <VendorFaqsPublic vendorId={vendor.id} />
                </>
              ) : (
                <VendorFaqList items={sampleFaqs} />
              )}
            </div>

            {/* Sticky inquiry sidebar */}
            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 space-y-4">
                <div className="bg-card border border-border rounded-sm p-6 card-shadow">
                  <p className="font-label text-muted-foreground mb-2">Starting at</p>
                  <p className="font-display text-3xl mb-1 tnum">
                    ${vendor.startingPrice.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mb-6">
                    Final pricing depends on date, package, and event details.
                  </p>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2.5 text-sm">
                      <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
                      <span className="text-foreground/80">
                        AI-drafted reply within 3 hours
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm">
                      <Calendar className="w-4 h-4 text-accent flex-shrink-0" />
                      <span className="text-foreground/80">
                        Live availability calendar
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-accent flex-shrink-0" />
                      <span className="text-foreground/80">
                        No platform fee for hosts
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={handleInquiryClick}
                    disabled={authLoading}
                    className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Send Inquiry
                  </Button>

                  <Button
                    onClick={handleMessageClick}
                    disabled={authLoading}
                    variant="outline"
                    className="w-full h-10 rounded-full mt-2"
                  >
                    Message vendor
                  </Button>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Button
                      variant="outline"
                      className="rounded-full h-10"
                      onClick={() => toggleSave(vendor.id, { isReal: vendor.isReal })}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 mr-2 ${
                          saved ? "fill-accent text-accent" : ""
                        }`}
                      />
                      {saved ? "Saved" : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full h-10"
                      onClick={handleShare}
                    >
                      <Share2 className="w-3.5 h-3.5 mr-2" />
                      Share
                    </Button>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-sm p-5 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground/85">No pay-to-rank.</span>{" "}
                  Vendora doesn't accept money to influence search ranking. Vendors
                  appear based on fit and review quality, not ad spend.
                </div>

                {vendor.isReal && (
                  <VendorPolicyBadges
                    depositPct={vendor.depositPct}
                    cancellationPolicy={vendor.cancellationPolicy}
                    rescheduleWindowDays={vendor.rescheduleWindowDays}
                    policyNotes={vendor.policyNotes}
                  />
                )}

                {vendor.isReal && (
                  <div className="text-center pt-1">
                    <ReportButton
                      contentType="vendor_profile"
                      contentId={vendor.id}
                      variant="link"
                      size="sm"
                      label="Report this profile"
                    />
                  </div>
                )}

                {vendor.isReal && (
                  <SocialEmbedCard
                    instagramHandle={vendor.instagramHandle ?? null}
                    tiktokHandle={vendor.tiktokHandle ?? null}
                  />
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Related vendors */}
      {related.length > 0 && (
        <section className="py-16 md:py-24 border-t border-border">
          <div className="container mx-auto px-6 md:px-8">
            <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
              <div>
                <p className="font-label text-accent mb-4">More to explore</p>
                <h2 className="font-display text-3xl md:text-4xl">
                  You might also love
                </h2>
              </div>
              <Link to="/vendors">
                <Button variant="ghost" className="rounded-full">
                  Browse all vendors
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
              {related.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />

      {/* Mobile sticky inquiry bar — keeps Send Inquiry one tap away */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 flex items-center gap-3 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]">
        <div className="flex-1 min-w-0">
          <p className="font-label text-muted-foreground text-[10px] tracking-[0.2em]">
            From
          </p>
          <p className="font-display text-lg tnum leading-tight">
            ${vendor.startingPrice.toLocaleString()}
          </p>
        </div>
        <Button
          onClick={handleInquiryClick}
          disabled={authLoading}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          <Mail className="w-4 h-4 mr-2" />
          Send Inquiry
        </Button>
      </div>

      {/* Logged-out: prompt to sign in/up before inquiring */}
      <Dialog open={signinPromptOpen} onOpenChange={setSigninPromptOpen}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              Send an inquiry to {vendor.name}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed pt-2">
              Inquiries are routed to vendors with AI-drafted replies in under 3
              hours. Sign up as a host to send your first inquiry — it's free.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Link to="/signup" className="block">
              <Button className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90">
                Create a free host account
              </Button>
            </Link>
            <Link to="/login" className="block">
              <Button variant="outline" className="w-full h-11 rounded-full">
                I already have an account
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logged-in host: real inquiry form. Lazy chunk only loads on
          first open — most visitors browsing vendor pages never click. */}
      {inquiryFormOpen && (
        <Suspense fallback={null}>
          <InquiryFormModal
            open={inquiryFormOpen}
            onOpenChange={setInquiryFormOpen}
            preferredVendorName={vendor.name}
          />
        </Suspense>
      )}

      <Lightbox
        images={portfolioItems.map((item, i) => ({
          src: item.src,
          alt: item.caption ?? `${vendor.name} portfolio ${i + 1}`,
          caption: item.caption,
        }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}

// Mirrors the real detail-page layout (hero + two-column body) so the
// swap to actual content has near-zero layout shift. Shown while
// useVendors() hydrates on cold cache / deep-link navigation; warm
// cache hits skip this entirely and render the real page immediately.
function VendorDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <PublicNav />

      <section className="relative h-[80svh] min-h-[560px] w-full overflow-hidden bg-muted/40">
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/10 via-foreground/5 to-foreground/15" />
        <div className="relative z-10 h-full flex flex-col">
          <div className="container mx-auto px-6 md:px-8 pt-24">
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex-1 flex items-end pb-12 md:pb-16">
            <div className="container mx-auto px-6 md:px-8">
              <Skeleton className="h-3 w-24 mb-5" />
              <Skeleton className="h-12 md:h-16 w-3/4 max-w-2xl mb-3" />
              <Skeleton className="h-12 md:h-16 w-1/2 max-w-xl mb-6" />
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 md:px-8">
          <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">
            <div className="lg:col-span-2 space-y-16">
              <div>
                <Skeleton className="h-3 w-16 mb-4" />
                <Skeleton className="h-8 w-3/4 mb-3" />
                <Skeleton className="h-8 w-1/2 mb-6" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </div>

              <div>
                <Skeleton className="h-3 w-20 mb-4" />
                <Skeleton className="h-8 w-2/3 mb-8" />
                <div className="grid md:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-72 w-full rounded-sm" />
                  ))}
                </div>
              </div>

              <div>
                <Skeleton className="h-3 w-20 mb-4" />
                <Skeleton className="h-8 w-1/2 mb-8" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Skeleton className="col-span-2 row-span-2 aspect-square md:aspect-[4/3] rounded-sm" />
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="aspect-square rounded-sm" />
                  ))}
                </div>
              </div>
            </div>

            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 space-y-4">
                <Skeleton className="h-[420px] w-full rounded-sm" />
                <Skeleton className="h-20 w-full rounded-sm" />
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
