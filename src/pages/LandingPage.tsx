import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Picture } from "@/components/shared/Picture";
// vite-imagetools generates AVIF + WebP + JPG variants at 640/1024/1600
// widths via the default directives in vite.config.ts. Each import below
// resolves to a { sources, img } picture object instead of a raw URL.
import heroWedding from "@/assets/hero/wedding.jpg?as=picture";
import heroChristmas from "@/assets/hero/christmas.jpg?as=picture";
import heroBabyShower from "@/assets/hero/babyshower.jpg?as=picture";
import heroBirthdayMilestone from "@/assets/hero/birthday-milestone.jpg?as=picture";
import heroNYE from "@/assets/hero/nye.jpg?as=picture";
import featureFlorals from "@/assets/vendora-feature-1.jpg?as=picture";
import featureVenue from "@/assets/vendora-feature-2.jpg?as=picture";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

// Slide images + i18n keys for the rotating label/alt copy. The
// label/alt come from translations so Spanish-speaking guests see
// "Bodas / Cumpleaños" etc.
const heroSlides = [
  { src: heroWedding,            labelKey: "weddings" },
  { src: heroBirthdayMilestone,  labelKey: "milestone_birthdays" },
  { src: heroChristmas,          labelKey: "christmas" },
  { src: heroNYE,                labelKey: "nye" },
  { src: heroBabyShower,         labelKey: "baby_shower" },
] as const;

const stepKeys = ["discover", "book", "plan"] as const;
const featureKeys = ["discovery", "booking", "tools"] as const;
const faqKeys = ["is_free", "vetted", "events", "payments"] as const;

export default function LandingPage() {
  const [slideIndex, setSlideIndex] = useState(0);
  const { t } = useTranslation();
  const currentSlideLabel = t(`landing.categories.${heroSlides[slideIndex].labelKey}`);

  useEffect(() => {
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % heroSlides.length);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Preload only the next slide on idle. Beats fetching all 20 up front.
  useEffect(() => {
    const next = heroSlides[(slideIndex + 1) % heroSlides.length];
    const fallbackSrc = next.src.img.src;
    const webpSet = next.src.sources.webp;
    const img = new Image();
    if (webpSet) img.srcset = webpSet;
    img.src = fallbackSrc;
  }, [slideIndex]);

  const currentSlide = heroSlides[slideIndex];

  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          "linear-gradient(to bottom, hsl(var(--foreground)) 0%, hsl(var(--foreground)) 30%, hsl(30 15% 35%) 45%, hsl(36 22% 75%) 65%, hsl(var(--background)) 82%, hsl(var(--background)) 100%)",
      }}
    >
      <PublicNav />

      {/* Cinematic Hero */}
      <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden -mt-px">
        {/* Rotating background images with crossfade + slow Ken Burns zoom */}
        <AnimatePresence mode="sync">
          <motion.div
            key={slideIndex}
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 1.6, ease: "easeInOut" },
              scale: { duration: 11, ease: "easeOut" },
            }}
            className="absolute inset-0"
          >
            <Picture
              source={currentSlide.src}
              alt={currentSlideLabel}
              className="w-full h-full object-cover"
              loading={slideIndex === 0 ? "eager" : "lazy"}
              fetchPriority={slideIndex === 0 ? "high" : "auto"}
              sizes="100vw"
            />
          </motion.div>
        </AnimatePresence>


        {/* Cinematic gradient overlays — bleed into page background */}
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/40 to-foreground" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/55 via-transparent to-foreground/30" />
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "var(--gradient-hero)" }}
        />
        {/* Letterbox bars + seamless bleed into next section */}
        <div className="absolute top-0 inset-x-0 h-16 md:h-20 bg-gradient-to-b from-foreground/80 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-72 bg-gradient-to-t from-foreground via-foreground/70 to-transparent pointer-events-none" />
        {/* Subtle film grain */}
        <div
          className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col">
          <div className="flex-1 flex items-center">
            <div className="container mx-auto px-6 md:px-8">
              <div className="max-w-4xl">
                <div className="flex items-center gap-4 mb-6 h-5">
                  <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: 0.2 }}
                    className="font-label text-accent tracking-[0.4em]"
                  >
                    — {t("landing.hero.tagline")}
                  </motion.p>
                  <span className="h-px w-8 bg-accent/40" />
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentSlideLabel}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.5 }}
                      className="font-label text-background/70 tracking-[0.3em]"
                    >
                      {currentSlideLabel}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <motion.h1
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.4, duration: 1 }}
                  className="text-hero font-display text-background mb-8 leading-[1.0]"
                >
                  {t("landing.hero.title_lead")}{" "}
                  <span className="italic font-light text-accent">
                    {t("landing.hero.title_accent")}
                  </span>
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.7 }}
                  className="text-base md:text-xl text-background/80 max-w-xl mb-12 leading-relaxed font-light"
                >
                  {t("landing.hero.subtitle")}
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.95 }}
                  className="flex flex-col sm:flex-row gap-3 sm:items-center"
                >
                  <Link to="/customer/dashboard">
                    <Button
                      size="lg"
                      className="h-12 px-8 rounded-full text-sm tracking-wide bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      {t("landing.hero.cta_primary")}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <Link to="/vendors">
                    <Button
                      size="lg"
                      variant="ghost"
                      className="h-12 px-6 rounded-full text-sm text-background hover:bg-background/10 hover:text-background"
                    >
                      {t("landing.hero.cta_secondary")}
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Trust strip + scroll cue at bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 1 }}
            className="pb-10 md:pb-14"
          >
            <div className="container mx-auto px-6 md:px-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[10px] md:text-xs uppercase tracking-[0.3em] text-background/60">
                  <span>{t("landing.hero.trust_strip.beta")}</span>
                  <span className="hidden md:inline">·</span>
                  <span>{t("landing.hero.trust_strip.by_invitation")}</span>
                  <span className="hidden md:inline">·</span>
                  <span>{t("landing.hero.trust_strip.vetted")}</span>
                </div>
                <div className="flex items-center gap-2">
                  {heroSlides.map((s, i) => (
                    <button
                      key={s.labelKey}
                      onClick={() => setSlideIndex(i)}
                      aria-label={`Show ${t(`landing.categories.${s.labelKey}`)}`}
                      className={`h-px transition-all duration-500 ${
                        i === slideIndex
                          ? "w-10 bg-accent"
                          : "w-5 bg-background/30 hover:bg-background/60"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works — on dark gradient */}
      <section className="py-24 md:py-36 relative">
        <div className="container mx-auto px-6 md:px-8">
          <div className="max-w-2xl mb-20">
            <p className="font-label text-accent mb-4">How it works</p>
            <h2 className="text-h2 font-display text-background">
              Three simple steps to a flawless event.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {stepKeys.map((k, i) => (
              <motion.div
                key={k}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.1 }}
                className="border-t border-background/15 pt-8"
              >
                <p className="font-label text-accent mb-6 tnum">
                  {t(`landing.steps.${k}.n`)}
                </p>
                <h3 className="font-display text-2xl mb-3 text-background">
                  {t(`landing.steps.${k}.title`)}
                </h3>
                <p className="text-sm text-background/65 leading-relaxed">
                  {t(`landing.steps.${k}.desc`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature: Vendor discovery — still on dark gradient */}
      <section className="py-24 md:py-36 text-primary-foreground relative overflow-hidden">
        <div className="container mx-auto px-6 md:px-8 relative">
          <div className="grid md:grid-cols-2 gap-16 md:gap-24 items-center">
            <div>
              <p className="font-label text-accent mb-5">A curated marketplace</p>
              <h2 className="text-h2 font-display mb-6">
                Find vendors you'll trust on sight.
              </h2>
              <p className="text-primary-foreground/70 leading-relaxed mb-10 max-w-md">
                Every photographer, florist, venue, and planner on Vendora is
                personally reviewed. No noise — only people whose work you'd be
                proud to put your name next to.
              </p>
              <div className="space-y-4">
                {[
                  "Hand-selected by our editorial team",
                  "Transparent pricing — no hidden fees",
                  "Reviews from verified hosts only",
                ].map((f) => (
                  <div key={f} className="flex items-start gap-3 text-sm">
                    <Check className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span className="text-primary-foreground/85">{f}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div
                className="aspect-[4/5] rounded-sm overflow-hidden"
                style={{
                  WebkitMaskImage:
                    "radial-gradient(ellipse at center, hsl(0 0% 0%) 35%, hsl(0 0% 0% / 0.5) 70%, transparent 100%)",
                  maskImage:
                    "radial-gradient(ellipse at center, hsl(0 0% 0%) 35%, hsl(0 0% 0% / 0.5) 70%, transparent 100%)",
                }}
              >
                <Picture
                  source={featureFlorals}
                  alt="Floral arrangement"
                  loading="lazy"
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Booking + tools — mid transition zone */}
      <section className="py-24 md:py-36 relative">
        <div className="container mx-auto px-6 md:px-8">
          <div className="grid md:grid-cols-2 gap-16 md:gap-24 items-center">
            <div className="md:order-2">
              <p className="font-label text-accent mb-5">Booking & tools</p>
              <h2 className="text-h2 font-display mb-6 text-foreground">
                Everything you need, nothing you don't.
              </h2>
              <p className="text-foreground/70 leading-relaxed mb-10 max-w-md">
                A single, calm dashboard for your timeline, payments,
                invitations, and guest list. Designed to feel less like
                software, and more like a planner who quietly keeps everything
                on track.
              </p>
              <div className="grid grid-cols-1 gap-6">
                {featureKeys.map((k) => (
                  <div key={k} className="border-l border-accent/40 pl-5 py-1">
                    <h3 className="font-display text-base mb-1 text-foreground">
                      {t(`landing.features.${k}.title`)}
                    </h3>
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      {t(`landing.features.${k}.desc`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:order-1 relative">
              <div className="aspect-[4/5] rounded-sm overflow-hidden">
                <Picture
                  source={featureVenue}
                  alt="Luxury venue"
                  loading="lazy"
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats / quiet trust band */}
      <section className="py-20 border-y border-border/40 backdrop-blur-sm bg-background/30">
        <div className="container mx-auto px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            {[
              { n: "3%", l: "on confirmed bookings" },
              { n: "<3min", l: "AI-assisted reply time" },
              { n: "0", l: "pay-to-rank, ever" },
              { n: "100%", l: "vendor-owned data" },
            ].map((s) => (
              <div key={s.l}>
                <p className="font-display text-3xl md:text-4xl mb-2 tnum">{s.n}</p>
                <p className="font-label text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 md:py-36 relative">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          <div className="mb-16">
            <p className="font-label text-accent mb-4">Questions</p>
            <h2 className="text-h2 font-display">Quietly thorough answers.</h2>
          </div>
          <div>
            {faqKeys.map((k) => (
              <details key={k} className="group border-b border-border">
                <summary className="flex items-center justify-between py-6 cursor-pointer text-base font-medium list-none">
                  {t(`landing.faq.${k}.q`)}
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-6 text-sm text-muted-foreground leading-relaxed max-w-lg">
                  {t(`landing.faq.${k}.a`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — light, on white end of gradient */}
      <section className="relative py-32 md:py-44 overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="container mx-auto px-6 md:px-8 text-center relative">
          <h2 className="font-display text-4xl md:text-6xl max-w-3xl mx-auto mb-6 leading-[1.05] text-foreground">
            Your event, <span className="italic font-light text-accent">elevated.</span>
          </h2>
          <p className="text-foreground/70 max-w-md mx-auto mb-10 text-sm md:text-base">
            Join thousands of hosts planning effortlessly with Vendora.
          </p>
          <Link to="/customer/dashboard">
            <Button size="lg" className="h-12 px-8 rounded-full text-sm tracking-wide bg-foreground text-background hover:bg-foreground/90">
              Start Planning
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
