import { Download, Mail, Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Picture } from "@/components/shared/Picture";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import heroDinner from "@/assets/vendora-hero-dinner.jpg?as=picture";
import heroGala from "@/assets/vendora-hero-gala.jpg?as=picture";
import featureFlorals from "@/assets/vendora-feature-1.jpg?as=picture";
import featureVenue from "@/assets/vendora-feature-2.jpg?as=picture";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

const STATS: Array<{ value: string; label: string }> = [
  { value: "10+", label: "Vendor categories" },
  { value: "All", label: "US event types" },
  { value: "Multi", label: "Language ready" },
];

const SCREENSHOTS = [
  {
    src: heroDinner,
    alt: "Vendora landing — cinematic event imagery",
    caption: "Landing page",
  },
  {
    src: featureFlorals,
    alt: "Vendora vendor profile with portfolio + packages",
    caption: "Vendor profile",
  },
  {
    src: featureVenue,
    alt: "Vendora event microsite — countdown + schedule + RSVP",
    caption: "Guest microsite",
  },
  {
    src: heroGala,
    alt: "Vendora analytics dashboard for vendors",
    caption: "Vendor analytics",
  },
];

const QUICK_FACTS = [
  {
    label: "What it is",
    body: "A vendor-first event marketplace plus the planning tools hosts need to run their event without leaving the platform — weddings, milestone birthdays, holiday gatherings, baby showers, anniversaries.",
  },
  {
    label: "Founded",
    body: "2026 — pre-launch, building in public.",
  },
  {
    label: "How vendors are vetted",
    body: "Hand-reviewed by an editorial team for portfolio quality, references, and professional standing. Open marketplace mechanics — closed editorial gate.",
  },
  {
    label: "Differentiators",
    body: "Vendor-first signup flow, programmatic SEO depth (per-city + per-category landing pages), trust verification badges (identity / insurance / business license / background check), real-event editorial galleries, two-way calendar sync.",
  },
  {
    label: "Coverage",
    body: "United States. Multi-language ready (English + Spanish at launch).",
  },
];

export default function PressPage() {
  const [copied, setCopied] = useState(false);

  useDocumentMeta({
    title: "Press kit — Vendora",
    description:
      "Brand assets, screenshots, founder bios, and contact info for press, partners, and editorial coverage of Vendora.",
  });

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText("press@vendora.app");
      setCopied(true);
      toast.success("Press email copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Hero */}
      <section className="border-b border-border pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — PRESS KIT
          </p>
          <h1 className="font-editorial text-5xl md:text-6xl leading-[1.0] mb-5">
            Everything you need to{" "}
            <span className="italic font-light text-accent">write about us.</span>
          </h1>
          <p className="text-base md:text-lg text-foreground/75 max-w-2xl leading-relaxed mb-8">
            Logos, screenshots, the elevator pitch, and a real human you can
            email. If you need anything that's not here, ask — we'd rather
            send the right asset than have you ship the wrong one.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              onClick={copyEmail}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <Mail className="w-3.5 h-3.5 mr-1.5" />
              )}
              press@vendora.app
              <Copy className="w-3 h-3 ml-1.5 opacity-60" />
            </Button>
            <a
              href="/changelog"
              className="text-xs text-accent hover:underline inline-flex items-center gap-1 ml-2"
            >
              See what's shipped
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-b border-border">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <div className="grid grid-cols-3 gap-4">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.08 }}
                className="text-center md:text-left"
              >
                <p className="font-editorial text-4xl md:text-5xl tnum mb-1">
                  {s.value}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {s.label}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick facts */}
      <section className="py-14 md:py-20">
        <div className="container mx-auto px-6 md:px-8 max-w-3xl">
          <p className="font-label text-accent mb-3 tracking-[0.4em]">
            — QUICK FACTS
          </p>
          <h2 className="font-editorial text-4xl md:text-4xl mb-10">
            The 60-second version
          </h2>
          <dl className="space-y-6">
            {QUICK_FACTS.map((f) => (
              <div key={f.label}>
                <dt className="text-xs uppercase tracking-[0.3em] text-accent mb-1.5">
                  {f.label}
                </dt>
                <dd className="text-base text-foreground/80 leading-relaxed">
                  {f.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Logo + brand */}
      <section className="py-14 md:py-20 border-t border-border">
        <div className="container mx-auto px-6 md:px-8 max-w-3xl">
          <p className="font-label text-accent mb-3 tracking-[0.4em]">
            — BRAND
          </p>
          <h2 className="font-editorial text-4xl md:text-4xl mb-8">
            Logos and palette
          </h2>

          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            <div className="rounded-sm border border-border bg-foreground p-10 flex items-center justify-center">
              <span className="font-editorial text-5xl text-background">
                Vendora
              </span>
            </div>
            <div className="rounded-sm border border-border bg-background p-10 flex items-center justify-center">
              <span className="font-editorial text-5xl text-foreground">
                Vendora
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            The wordmark uses our display typeface and works on dark or
            light. Don't reproduce the mark on a colored background other
            than #0a0a0a or #ffffff. Don't add effects, gradients, drop
            shadows, or rotate it.
          </p>

          <div className="flex items-center gap-3 text-xs flex-wrap mb-8">
            <a
              href="/pwa-512.png"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              <Download className="w-3 h-3" />
              App icon (512×512)
            </a>
            <a
              href="/pwa-192.png"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              <Download className="w-3 h-3" />
              App icon (192×192)
            </a>
          </div>

          <h3 className="font-editorial text-2xl mb-4">Color palette</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {[
              { name: "Ink", hex: "#0A0A0A", swatch: "bg-foreground" },
              { name: "Cream", hex: "#FAF7F2", swatch: "bg-background border border-border" },
              { name: "Accent", hex: "#A08259", swatch: "bg-accent" },
              { name: "Muted", hex: "#8B8580", swatch: "bg-muted-foreground" },
            ].map((c) => (
              <div key={c.name}>
                <div className={`h-16 rounded-sm ${c.swatch}`} />
                <p className="font-display text-sm mt-2">{c.name}</p>
                <p className="text-[11px] text-muted-foreground tnum">{c.hex}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="py-14 md:py-20 border-t border-border">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <p className="font-label text-accent mb-3 tracking-[0.4em]">
            — SCREENSHOTS
          </p>
          <h2 className="font-editorial text-4xl md:text-4xl mb-8">
            Use these for editorial
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl mb-8 leading-relaxed">
            Right-click and save, or email us if you want vendor-anonymized
            versions for an article that needs them.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {SCREENSHOTS.map((s) => (
              <figure
                key={s.caption}
                className="rounded-sm overflow-hidden border border-border bg-card"
              >
                <div className="aspect-[4/3] bg-muted overflow-hidden">
                  <Picture
                    source={s.src}
                    alt={s.alt}
                    loading="lazy"
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="w-full h-full object-cover"
                  />
                </div>
                <figcaption className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
                  {s.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-14 md:py-20 border-t border-border bg-card/40">
        <div className="container mx-auto px-6 md:px-8 max-w-3xl text-center">
          <p className="font-label text-accent mb-3 tracking-[0.4em]">
            — CONTACT
          </p>
          <h2 className="font-editorial text-4xl md:text-4xl mb-3">
            Let's talk
          </h2>
          <p className="text-base text-foreground/75 mb-8 leading-relaxed max-w-xl mx-auto">
            Editorial requests, interviews, partnership inquiries — we
            actually read these and reply within a business day.
          </p>
          <Button
            type="button"
            onClick={copyEmail}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Mail className="w-3.5 h-3.5 mr-1.5" />
            )}
            press@vendora.app
            <Copy className="w-3 h-3 ml-1.5 opacity-60" />
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
