import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, Wrench, Bug, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { JsonLd } from "@/components/seo/JsonLd";
import { CHANGELOG, type ChangelogCategory } from "@/data/changelog";
import { formatDate } from "@/lib/format";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

const CATEGORY_META: Record<
  ChangelogCategory,
  { label: string; tone: string; Icon: typeof Sparkles }
> = {
  feature: {
    label: "New",
    tone: "bg-accent/15 text-accent border-accent/30",
    Icon: Sparkles,
  },
  improvement: {
    label: "Better",
    tone: "bg-secondary text-foreground border-border",
    Icon: Wrench,
  },
  fix: {
    label: "Fix",
    tone: "bg-secondary text-muted-foreground border-border",
    Icon: Bug,
  },
  security: {
    label: "Security",
    tone: "bg-foreground/10 text-foreground border-foreground/30",
    Icon: ShieldCheck,
  },
};

function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

const dayLabel = (date: string) => formatDate(date, "short");

export default function ChangelogPage() {
  useDocumentMeta({
    title: "Changelog — what's new on Vendora",
    description:
      "A running log of features, improvements, and fixes shipped to Vendora — the marketplace + planning tools for event hosts and vendors.",
  });

  const grouped = useMemo(() => {
    const out = new Map<string, typeof CHANGELOG>();
    for (const entry of CHANGELOG) {
      const key = monthLabel(entry.date);
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(entry);
    }
    return Array.from(out.entries());
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-4xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — CHANGELOG
          </p>
          <h1 className="font-display text-4xl md:text-6xl leading-[1.0] mb-5">
            What we've been{" "}
            <span className="italic font-light text-accent">shipping.</span>
          </h1>
          <p className="text-base md:text-lg text-foreground/75 max-w-2xl leading-relaxed">
            A running log of every notable feature, improvement, and fix
            we've shipped. Updated whenever something user-visible lands —
            no marketing fluff, just the work.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8 max-w-4xl">
          <div className="space-y-12">
            {grouped.map(([month, entries], gi) => (
              <motion.section
                key={month}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: Math.min(gi * 0.05, 0.3) }}
              >
                <h2 className="font-display text-2xl mb-6">{month}</h2>
                <ol className="space-y-6 border-l border-border pl-6 ml-1 relative">
                  {entries.map((entry, i) => {
                    const meta = CATEGORY_META[entry.category];
                    const Icon = meta.Icon;
                    return (
                      <li key={`${entry.date}-${i}`} className="relative">
                        <span
                          className="absolute -left-[33px] w-3 h-3 rounded-full bg-background border border-border ring-4 ring-background"
                          style={{ top: "0.4rem" }}
                        />
                        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${meta.tone}`}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {meta.label}
                          </span>
                          <p className="text-[11px] text-muted-foreground tnum">
                            {dayLabel(entry.date)}
                          </p>
                        </div>
                        <h3 className="font-display text-lg leading-tight mb-1.5">
                          {entry.title}
                        </h3>
                        <p className="text-sm text-foreground/75 leading-relaxed max-w-2xl">
                          {entry.description}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </motion.section>
            ))}
          </div>
        </div>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Vendora changelog",
          numberOfItems: CHANGELOG.length,
          itemListElement: CHANGELOG.slice(0, 30).map((e, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "CreativeWork",
              name: e.title,
              description: e.description,
              datePublished: e.date,
            },
          })),
        }}
      />

      <Footer />
    </div>
  );
}
