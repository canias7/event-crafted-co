import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, MapPin, Users, ArrowRight, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { SaveToBoardModal } from "@/components/moodboards/SaveToBoardModal";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import {
  fetchInspirationEntries,
  findInspirationBySlug,
  inspirationEntries,
  type InspirationEntry,
} from "@/data/inspiration";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function InspirationDetailPage() {
  const { slug } = useParams();
  // Bundled lookup first so first paint has content; merged DB lookup hydrates.
  const [entries, setEntries] = useState<InspirationEntry[]>(inspirationEntries);
  const [hydrated, setHydrated] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchInspirationEntries().then((fetched) => {
      if (cancelled) return;
      setEntries(fetched.length > 0 ? fetched : inspirationEntries);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const entry = findInspirationBySlug(slug, entries);

  useDocumentMeta(
    entry
      ? {
          title: `${entry.title} — Vendora`,
          description: entry.excerpt,
          image: typeof entry.hero === "string" ? entry.hero : undefined,
          type: "article",
        }
      : { title: "Inspiration — Vendora" },
  );

  // Article JSON-LD for SEO (rich snippets in Google).
  useEffect(() => {
    if (!entry) return;
    const id = "inspiration-jsonld";
    const data = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: entry.title,
      description: entry.excerpt,
      image: entry.hero,
      author: { "@type": "Organization", name: "Vendora" },
      publisher: {
        "@type": "Organization",
        name: "Vendora",
      },
      articleSection: entry.eventTypeLabel,
      keywords: [entry.eventType, entry.location, "event"].filter(Boolean),
      url: typeof window !== "undefined" ? window.location.href : undefined,
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
  }, [entry]);

  if (!entry && hydrated) {
    return <Navigate to="/inspiration" replace />;
  }
  if (!entry) {
    return null;
  }

  // Pick three other entries to suggest at the bottom
  const related = entries.filter((e) => e.slug !== entry.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic hero */}
      <section className="relative h-[80svh] min-h-[560px] w-full overflow-hidden">
        <img
          src={entry.hero}
          alt={entry.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/55 via-foreground/30 to-foreground/85" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/55 via-transparent to-transparent" />

        <div className="relative z-10 h-full flex flex-col">
          <div className="container mx-auto px-6 md:px-8 pt-24 flex items-center justify-between gap-4">
            <Link
              to="/inspiration"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-background/70 hover:text-background transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All inspiration
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSaveOpen(true)}
              className="rounded-full bg-background/10 backdrop-blur-sm border-background/30 text-background hover:bg-background/20 hover:text-background"
            >
              <Bookmark className="w-3.5 h-3.5 mr-1.5" />
              Save to board
            </Button>
          </div>

          <div className="flex-1 flex items-end pb-12 md:pb-16">
            <div className="container mx-auto px-6 md:px-8">
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.15 }}
                className="font-label text-accent tracking-[0.4em] mb-5"
              >
                — {entry.eventTypeLabel.toUpperCase()}
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.3, duration: 0.9 }}
                className="text-hero font-display text-background leading-[1.0] mb-6 max-w-4xl"
              >
                {entry.title}
              </motion.h1>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.5 }}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 text-background/85 text-sm"
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{entry.date}</span>
                </div>
                <span className="hidden md:inline text-background/30">·</span>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{entry.location}</span>
                </div>
                <span className="hidden md:inline text-background/30">·</span>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span className="tnum">{entry.guests}</span> guests
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 md:px-8 max-w-3xl">
          <p className="font-label text-accent mb-4">The story</p>
          <h2 className="font-display text-2xl md:text-3xl mb-8 leading-tight">
            {entry.hosts}
          </h2>
          <div className="space-y-5 text-foreground/80 leading-relaxed">
            {entry.body.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          <div className="mt-12 pt-10 border-t border-border">
            <p className="font-label text-accent mb-4">The vendor team</p>
            <ul className="space-y-2">
              {entry.vendorCredits.map((credit, i) => (
                <li
                  key={i}
                  className="text-sm text-foreground/85 leading-relaxed"
                >
                  {credit}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-12 pt-10 border-t border-border text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Planning something similar?
            </p>
            <Link to="/vendors">
              <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                Browse vendors
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-6 md:px-8">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <p className="font-label text-accent mb-3">More to explore</p>
              <h2 className="font-display text-3xl">Other events</h2>
            </div>
            <Link to="/inspiration">
              <Button variant="ghost" className="rounded-full">
                All inspiration
              </Button>
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
            {related.map((e) => (
              <Link key={e.slug} to={`/inspiration/${e.slug}`} className="group block">
                <div className="aspect-[4/3] overflow-hidden rounded-sm mb-4 bg-muted">
                  <img
                    src={e.hero}
                    alt={e.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>
                <p className="font-label text-accent mb-1.5 tracking-[0.2em]">
                  {e.eventTypeLabel}
                </p>
                <h3 className="font-display text-lg leading-tight transition-colors group-hover:text-accent">
                  {e.title}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />

      <SaveToBoardModal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        imageUrl={typeof entry.hero === "string" ? entry.hero : ""}
        sourceUrl={
          typeof window !== "undefined" ? window.location.href : undefined
        }
        caption={entry.title}
      />
    </div>
  );
}
