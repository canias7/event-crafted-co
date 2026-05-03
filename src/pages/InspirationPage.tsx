import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { inspirationEntries } from "@/data/inspiration";
import heroBg from "@/assets/vendora-hero-gala.jpg";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function InspirationPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic hero */}
      <section className="relative h-[55svh] min-h-[400px] w-full overflow-hidden">
        <img
          src={heroBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/45 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/55 via-transparent to-foreground/20" />

        <div className="relative z-10 h-full flex items-end pb-12 md:pb-16">
          <div className="container mx-auto px-6 md:px-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 }}
              className="flex items-center gap-4 mb-5"
            >
              <p className="font-label text-accent tracking-[0.4em]">
                — INSPIRATION
              </p>
              <span className="h-px w-8 bg-accent/40" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.3, duration: 0.9 }}
              className="text-hero font-display text-background leading-[1.0] max-w-3xl"
            >
              Real events,{" "}
              <span className="italic font-light text-accent">told well.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.55 }}
              className="text-base md:text-lg text-background/80 mt-5 max-w-md leading-relaxed font-light"
            >
              Weddings, milestone birthdays, holiday dinners, anniversaries —
              real events planned by real Vendora hosts and the vendors who
              brought them to life.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Grid of stories */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 md:px-8">
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-16">
            {inspirationEntries.map((entry, i) => (
              <Link
                key={entry.slug}
                to={`/inspiration/${entry.slug}`}
                className="group block"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...spring, delay: Math.min(i * 0.05, 0.3) }}
                >
                  <div className="aspect-[4/3] overflow-hidden rounded-sm mb-5 bg-muted">
                    <img
                      src={entry.hero}
                      alt={entry.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="font-label text-accent mb-2 tracking-[0.25em]">
                    {entry.eventTypeLabel} · {entry.location}
                  </p>
                  <h2 className="font-display text-2xl md:text-3xl mb-3 leading-tight transition-colors group-hover:text-accent">
                    {entry.title}
                  </h2>
                  <p className="text-sm text-foreground/70 leading-relaxed mb-3 line-clamp-3">
                    {entry.excerpt}
                  </p>
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                    Read the story
                    <ArrowRight className="w-3 h-3" />
                  </p>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
