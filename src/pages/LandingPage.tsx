import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Calendar, Sparkles, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import heroImage from "@/assets/vendora-hero.jpg";
import featureFlorals from "@/assets/vendora-feature-1.jpg";
import featureVenue from "@/assets/vendora-feature-2.jpg";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

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
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Hero */}
      <section className="relative pt-28 pb-24 md:pt-40 md:pb-40 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
          <div
            className="absolute inset-0"
            style={{ background: "var(--gradient-hero)" }}
          />
        </div>

        <div className="container mx-auto px-6 md:px-8 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            <p className="font-label text-accent mb-8 tracking-[0.25em]">VENDORA</p>
            <h1 className="text-hero font-display max-w-4xl mx-auto mb-8 leading-[1.02]">
              Plan your perfect event —{" "}
              <span className="italic font-light text-accent">effortlessly.</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-12 leading-relaxed">
              Vendora connects you with trusted vendors and the tools to plan,
              book, and manage every detail of your event — beautifully, in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link to="/customer/dashboard">
                <Button size="lg" className="h-12 px-8 rounded-full text-sm tracking-wide">
                  Start Planning
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/vendors">
                <Button size="lg" variant="ghost" className="h-12 px-6 rounded-full text-sm">
                  Browse vendors
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Trust strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-24 md:mt-32 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-xs uppercase tracking-[0.2em] text-muted-foreground/70"
          >
            <span>Featured in Vogue</span>
            <span className="hidden md:inline">·</span>
            <span>Condé Nast Traveler</span>
            <span className="hidden md:inline">·</span>
            <span>Architectural Digest</span>
            <span className="hidden md:inline">·</span>
            <span>Brides Magazine</span>
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
