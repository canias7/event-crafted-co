import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import heroWedding from "@/assets/vendora-hero-cinematic.jpg";
import heroBirthday from "@/assets/vendora-hero-birthday.jpg";
import heroGala from "@/assets/vendora-hero-gala.jpg";
import heroDinner from "@/assets/vendora-hero-dinner.jpg";
import heroKids from "@/assets/vendora-hero-kids.jpg";
import featureFlorals from "@/assets/vendora-feature-1.jpg";
import featureVenue from "@/assets/vendora-feature-2.jpg";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

const heroSlides = [
  { src: heroWedding, label: "Weddings", alt: "Luxury wedding tablescape at golden hour" },
  { src: heroBirthday, label: "Birthdays", alt: "Rooftop birthday celebration with confetti" },
  { src: heroGala, label: "Galas", alt: "Grand ballroom gala with crystal chandeliers" },
  { src: heroDinner, label: "Private Dinners", alt: "Intimate courtyard dinner under string lights" },
  { src: heroKids, label: "Milestones", alt: "Elegant first birthday party styling" },
];

const steps = [
  { n: "01", title: "Discover", desc: "Browse a curated network of trusted vendors — venues, florals, photography, catering and more." },
  { n: "02", title: "Book", desc: "Check live availability, request appointments, and confirm your bookings in a few taps." },
  { n: "03", title: "Plan", desc: "Manage timelines, payments, invitations, and guest lists from one elegant dashboard." },
];

const features = [
  { title: "Vendor discovery", desc: "Search a hand-vetted marketplace of professionals, filtered to your taste, budget, and date." },
  { title: "Seamless booking", desc: "Live calendars, instant requests, and contracts — no calls, no chasing, no friction." },
  { title: "Planning tools", desc: "Checklists, payment tracking, invitation builder, and guest management — all in sync." },
];

const faqs = [
  { q: "Is Vendora free to use?", a: "Yes — browsing vendors and managing your event is free. You only pay your vendors directly through the platform." },
  { q: "Are vendors verified?", a: "Every vendor goes through a manual review process. We verify credentials, portfolios, and references." },
  { q: "What types of events does Vendora support?", a: "Weddings, corporate events, milestone celebrations, private parties — anything that deserves to be done well." },
  { q: "Can I manage payments through Vendora?", a: "Yes. Send deposits, schedule installments, and keep every receipt in one place." },
];

export default function LandingPage() {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % heroSlides.length);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const currentSlide = heroSlides[slideIndex];

  return (
    <div className="min-h-screen bg-background">
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
            <img
              src={currentSlide.src}
              alt={currentSlide.alt}
              className="w-full h-full object-cover"
            />
          </motion.div>
        </AnimatePresence>

        {/* Preload other slides to avoid flash on first cycle */}
        <div className="hidden">
          {heroSlides.map((s) => (
            <img key={s.src} src={s.src} alt="" />
          ))}
        </div>

        {/* Cinematic gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/70 via-foreground/40 to-foreground/85" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/50 via-transparent to-foreground/30" />
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "var(--gradient-hero)" }}
        />
        {/* Letterbox bars for cinema feel */}
        <div className="absolute top-0 inset-x-0 h-16 md:h-20 bg-gradient-to-b from-foreground/80 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-foreground to-transparent pointer-events-none" />
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
                    — VENDORA
                  </motion.p>
                  <span className="h-px w-8 bg-accent/40" />
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentSlide.label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.5 }}
                      className="font-label text-background/70 tracking-[0.3em]"
                    >
                      {currentSlide.label}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <motion.h1
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.4, duration: 1 }}
                  className="text-hero font-display text-background mb-8 leading-[1.0]"
                >
                  Every detail,{" "}
                  <span className="italic font-light text-accent">
                    perfectly composed.
                  </span>
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.7 }}
                  className="text-base md:text-xl text-background/80 max-w-xl mb-12 leading-relaxed font-light"
                >
                  A curated marketplace of world-class vendors and the
                  tools to orchestrate unforgettable events — beautifully,
                  in one place.
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
                      Start Planning
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <Link to="/vendors">
                    <Button
                      size="lg"
                      variant="ghost"
                      className="h-12 px-6 rounded-full text-sm text-background hover:bg-background/10 hover:text-background"
                    >
                      Browse vendors
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
                  <span>Featured in Vogue</span>
                  <span className="hidden md:inline">·</span>
                  <span>Condé Nast Traveler</span>
                  <span className="hidden md:inline">·</span>
                  <span>Architectural Digest</span>
                  <span className="hidden lg:inline">·</span>
                  <span className="hidden lg:inline">Brides Magazine</span>
                </div>
                <div className="flex items-center gap-2">
                  {heroSlides.map((s, i) => (
                    <button
                      key={s.src}
                      onClick={() => setSlideIndex(i)}
                      aria-label={`Show ${s.label}`}
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

      {/* How it works */}
      <section className="py-24 md:py-36 border-t border-border">
        <div className="container mx-auto px-6 md:px-8">
          <div className="max-w-2xl mb-20">
            <p className="font-label text-accent mb-4">How it works</p>
            <h2 className="text-h2 font-display">
              Three simple steps to a flawless event.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {steps.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.1 }}
                className="border-t border-border pt-8"
              >
                <p className="font-label text-accent mb-6 tnum">{s.n}</p>
                <h3 className="font-display text-2xl mb-3">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature: Vendor discovery */}
      <section className="py-24 md:py-36 bg-primary text-primary-foreground relative overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] opacity-40 -z-0"
          style={{ background: "var(--gradient-glow)" }}
        />
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
                  "Vetted, verified, insured professionals",
                  "Transparent pricing and packages",
                  "Real reviews from real events",
                ].map((f) => (
                  <div key={f} className="flex items-start gap-3 text-sm">
                    <Check className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span className="text-primary-foreground/85">{f}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-[4/5] rounded-sm overflow-hidden">
                <img
                  src={featureFlorals}
                  alt="Floral arrangement"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Booking + tools */}
      <section className="py-24 md:py-36">
        <div className="container mx-auto px-6 md:px-8">
          <div className="grid md:grid-cols-2 gap-16 md:gap-24 items-center">
            <div className="md:order-2">
              <p className="font-label text-accent mb-5">Booking & tools</p>
              <h2 className="text-h2 font-display mb-6">
                Everything you need, nothing you don't.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-10 max-w-md">
                A single, calm dashboard for your timeline, payments,
                invitations, and guest list. Designed to feel less like
                software, and more like a planner who quietly keeps everything
                on track.
              </p>
              <div className="grid grid-cols-1 gap-6">
                {features.map((f) => (
                  <div key={f.title} className="border-l border-accent/40 pl-5 py-1">
                    <h3 className="font-display text-base mb-1">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:order-1 relative">
              <div className="aspect-[4/5] rounded-sm overflow-hidden">
                <img
                  src={featureVenue}
                  alt="Luxury venue"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats / quiet trust band */}
      <section className="py-20 border-y border-border bg-secondary/40">
        <div className="container mx-auto px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            {[
              { n: "12k+", l: "Events planned" },
              { n: "2,400", l: "Verified vendors" },
              { n: "4.9", l: "Average rating" },
              { n: "48", l: "Cities" },
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
      <section className="py-24 md:py-36">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          <div className="mb-16">
            <p className="font-label text-accent mb-4">Questions</p>
            <h2 className="text-h2 font-display">Quietly thorough answers.</h2>
          </div>
          <div>
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-border">
                <summary className="flex items-center justify-between py-6 cursor-pointer text-base font-medium list-none">
                  {f.q}
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-6 text-sm text-muted-foreground leading-relaxed max-w-lg">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-32 md:py-44 bg-primary text-primary-foreground overflow-hidden">
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="container mx-auto px-6 md:px-8 text-center relative">
          <h2 className="font-display text-4xl md:text-6xl max-w-3xl mx-auto mb-6 leading-[1.05]">
            Your event, <span className="italic font-light text-accent">elevated.</span>
          </h2>
          <p className="text-primary-foreground/70 max-w-md mx-auto mb-10 text-sm md:text-base">
            Join thousands of hosts planning effortlessly with Vendora.
          </p>
          <Link to="/customer/dashboard">
            <Button size="lg" variant="secondary" className="h-12 px-8 rounded-full text-sm tracking-wide">
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
