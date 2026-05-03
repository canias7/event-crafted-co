import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
} from "lucide-react";
import { toast } from "sonner";
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
import { InquiryFormModal } from "@/components/inquiries/InquiryFormModal";
import { useAuth } from "@/hooks/useAuth";
import { useVendors } from "@/hooks/useVendors";
import { useSavedVendors } from "@/hooks/useSavedVendors";

import vendorPhotographer from "@/assets/vendor-photographer.jpg";
import vendorFlorist from "@/assets/vendor-florist.jpg";
import vendorCatering from "@/assets/vendor-catering.jpg";
import vendorDj from "@/assets/vendor-dj.jpg";
import vendorVenue from "@/assets/vendor-venue.jpg";
import vendorMakeup from "@/assets/vendor-makeup.jpg";
import featureFlorals from "@/assets/vendora-feature-1.jpg";
import featureVenue from "@/assets/vendora-feature-2.jpg";
import heroDinner from "@/assets/vendora-hero-dinner.jpg";
import heroGala from "@/assets/vendora-hero-gala.jpg";
import heroBirthday from "@/assets/vendora-hero-birthday.jpg";
import heroKids from "@/assets/vendora-hero-kids.jpg";

const imageMap: Record<string, string> = {
  "vendor-photographer": vendorPhotographer,
  "vendor-florist": vendorFlorist,
  "vendor-catering": vendorCatering,
  "vendor-dj": vendorDj,
  "vendor-venue": vendorVenue,
  "vendor-makeup": vendorMakeup,
};

const portfolioPool = [
  featureFlorals,
  featureVenue,
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
  const { id } = useParams();
  const { session, profile, loading: authLoading } = useAuth();
  const { vendors, loading: vendorsLoading } = useVendors();
  const { isSaved, toggle: toggleSave } = useSavedVendors();
  const [signinPromptOpen, setSigninPromptOpen] = useState(false);
  const [inquiryFormOpen, setInquiryFormOpen] = useState(false);

  const vendor = vendors.find((v) => v.id === id);
  const saved = vendor ? isSaved(vendor.id) : false;

  function handleInquiryClick() {
    if (authLoading) return;
    if (!session || !profile) {
      setSigninPromptOpen(true);
      return;
    }
    if (profile.role === "host") {
      setInquiryFormOpen(true);
      return;
    }
    toast.info(
      profile.role === "vendor"
        ? "Switch to a host account to send inquiries."
        : "Inquiries can only be sent from host accounts.",
    );
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
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <div className="pt-32 pb-24 container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <p className="font-label text-muted-foreground">Loading vendor…</p>
          </div>
        </div>
      </div>
    );
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

  const heroImg = imageMap[vendor.image] ?? featureFlorals;

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic vendor hero */}
      <section className="relative h-[80svh] min-h-[560px] w-full overflow-hidden">
        <img
          src={heroImg}
          alt={vendor.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
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
                className="text-hero font-display text-background leading-[1.0] mb-6 max-w-3xl"
              >
                {vendor.name}
              </motion.h1>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.5 }}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 text-background/85 text-sm"
              >
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-accent text-accent" />
                  <span className="font-medium tnum">{vendor.rating}</span>
                  <span className="text-background/60 tnum">({vendor.reviews} reviews)</span>
                </div>
                <span className="hidden md:inline text-background/30">·</span>
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

              {/* Packages */}
              <div>
                <p className="font-label text-accent mb-4">Packages</p>
                <h2 className="font-display text-3xl mb-8">Three ways to work together</h2>
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
              </div>

              {/* Portfolio */}
              <div>
                <p className="font-label text-accent mb-4">Portfolio</p>
                <h2 className="font-display text-3xl mb-8">Recent work</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {portfolioPool.map((src, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ ...spring, delay: i * 0.05 }}
                      className={`overflow-hidden rounded-sm bg-muted ${
                        i === 0 ? "col-span-2 row-span-2 aspect-square md:aspect-[4/3]" : "aspect-square"
                      }`}
                    >
                      <img
                        src={src}
                        alt={`${vendor.name} portfolio ${i + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700"
                      />
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Reviews */}
              <div>
                <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
                  <div>
                    <p className="font-label text-accent mb-4">Reviews</p>
                    <h2 className="font-display text-3xl">
                      <span className="tnum">{vendor.rating}</span>{" "}
                      <span className="text-muted-foreground font-light">·</span>{" "}
                      <span className="text-muted-foreground font-light tnum">
                        {vendor.reviews} reviews
                      </span>
                    </h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                    ))}
                  </div>
                </div>
                <div className="space-y-8">
                  {sampleReviews.map((r, i) => (
                    <div key={i} className="border-t border-border pt-8 first:border-t-0 first:pt-0">
                      <div className="flex items-center gap-1 mb-3">
                        {Array.from({ length: r.rating }).map((_, j) => (
                          <Star key={j} className="w-3.5 h-3.5 fill-accent text-accent" />
                        ))}
                      </div>
                      <p className="text-foreground/85 leading-relaxed mb-4">
                        "{r.text}"
                      </p>
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.event}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQ */}
              <div>
                <p className="font-label text-accent mb-4">FAQ</p>
                <h2 className="font-display text-3xl mb-6">Common questions</h2>
                <div>
                  {sampleFaqs.map((f) => (
                    <details key={f.q} className="group border-b border-border">
                      <summary className="flex items-center justify-between py-5 cursor-pointer text-base font-medium list-none">
                        {f.q}
                      </summary>
                      <p className="pb-5 text-sm text-muted-foreground leading-relaxed max-w-lg">
                        {f.a}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
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
                    <Button variant="outline" className="rounded-full h-10">
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {related.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />

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

      {/* Logged-in host: real inquiry form */}
      <InquiryFormModal
        open={inquiryFormOpen}
        onOpenChange={setInquiryFormOpen}
        preferredVendorName={vendor.name}
      />
    </div>
  );
}
