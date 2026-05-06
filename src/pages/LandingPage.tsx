import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Picture } from "@/components/shared/Picture";
import hostHero from "@/assets/vendora-hero-dinner.jpg?as=picture";
import vendorHero from "@/assets/vendora-hero-gala.jpg?as=picture";

// Two-up landing: a host audience and a partner (vendor) audience
// each get their own half. Header + footer wrap the split so the
// nav still feels like one page; on small screens the panels stack
// vertically instead of side-by-side.
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-foreground text-background flex flex-col">
      <PublicNav />
      <main id="main-content" className="flex-1 grid md:grid-cols-2">
        <SplitPanel
          eyebrow="For Hosts"
          title="Plan something"
          accent="unforgettable."
          subtitle="A curated marketplace of vetted vendors and the calm tools to run your event end-to-end — invitations, payments, guest list, all in sync."
          ctaLabel="Start planning"
          ctaTo="/signup"
          secondaryLabel="Browse vendors"
          secondaryTo="/vendors"
          image={hostHero}
          imageAlt="A host's dinner party reception"
        />
        <SplitPanel
          eyebrow="For Partners"
          title="Get found by"
          accent="serious hosts."
          subtitle="Hand-selected vendors only. Inquiries, contracts, payments, calendar — every part of the gig in one place, designed by people who hate spreadsheets too."
          ctaLabel="Apply to join"
          ctaTo="/vendor-apply"
          secondaryLabel="See how it works"
          secondaryTo="/changelog"
          image={vendorHero}
          imageAlt="A vendor styling a gala setup"
          tone="invert"
        />
      </main>
      <Footer />
    </div>
  );
}

function SplitPanel({
  eyebrow,
  title,
  accent,
  subtitle,
  ctaLabel,
  ctaTo,
  secondaryLabel,
  secondaryTo,
  image,
  imageAlt,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  accent: string;
  subtitle: string;
  ctaLabel: string;
  ctaTo: string;
  secondaryLabel: string;
  secondaryTo: string;
  image: Parameters<typeof Picture>[0]["source"];
  imageAlt: string;
  tone?: "default" | "invert";
}) {
  // Two visual treatments so the panels read as distinct halves
  // rather than a mirror — the host side stays on the dark canvas,
  // the partner side flips to the cream/background tone.
  const inverted = tone === "invert";
  return (
    <section
      className={`relative isolate overflow-hidden flex flex-col justify-end min-h-[calc(100vh-9rem)] md:min-h-[calc(100vh-7rem)] ${
        inverted ? "bg-background text-foreground" : "bg-foreground text-background"
      }`}
    >
      <div className="absolute inset-0 -z-10">
        <Picture
          source={image}
          alt={imageAlt}
          className="w-full h-full object-cover opacity-50"
        />
        <div
          className={`absolute inset-0 ${
            inverted
              ? "bg-gradient-to-t from-background via-background/85 to-background/40"
              : "bg-gradient-to-t from-foreground via-foreground/85 to-foreground/40"
          }`}
          aria-hidden
        />
      </div>
      <div className="relative px-6 md:px-12 py-12 md:py-20 max-w-xl">
        <p className="font-label text-accent mb-4">— {eyebrow}</p>
        <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight">
          {title}
          <br />
          <span className="text-accent">{accent}</span>
        </h2>
        <p className="text-sm md:text-base opacity-80 mt-5 leading-relaxed max-w-md">
          {subtitle}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-8">
          <Link
            to={ctaTo}
            className={`inline-flex items-center gap-1.5 px-5 h-11 rounded-full text-sm font-medium transition-colors ${
              inverted
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-background text-foreground hover:bg-background/90"
            }`}
          >
            {ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to={secondaryTo}
            className="inline-flex items-center gap-1.5 px-5 h-11 rounded-full text-sm font-medium border border-current/30 hover:border-current transition-colors opacity-90"
          >
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
