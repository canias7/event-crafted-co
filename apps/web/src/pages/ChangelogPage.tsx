import { useMemo } from "react";
import { motion } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";
import { Sparkles, Wrench, Bug, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { JsonLd } from "@/components/seo/JsonLd";
import { CHANGELOG, type ChangelogCategory } from "@/data/changelog";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

// Each category's word ("New", "Better"…) is categories.<category> in
// locales/<language>/changelog.json.
const CATEGORY_META: Record<
  ChangelogCategory,
  { tone: string; Icon: typeof Sparkles }
> = {
  feature: {
    tone: "bg-gold/15 text-gold border-gold/40",
    Icon: Sparkles,
  },
  improvement: {
    tone: "bg-white/[0.06] text-[#f4f1ea] border-white/15",
    Icon: Wrench,
  },
  fix: {
    tone: "bg-white/[0.06] text-[#f4f1ea]/80 border-white/15",
    Icon: Bug,
  },
  security: {
    tone: "bg-white/10 text-[#f4f1ea] border-white/40",
    Icon: ShieldCheck,
  },
};

// Dates follow the page's language. When the browser is set to that
// same language, its regional format is kept (en-GB "4 Oct 2026").
function dateLocale(language: string) {
  const browser = typeof navigator !== "undefined" ? navigator.language : "";
  return browser && browser.split("-")[0] === language.split("-")[0] ? browser : language;
}

// "October 2026" / "Octubre de 2026" for a "YYYY-MM" month.
function monthLabel(yearMonth: string, locale: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  // Spanish month names are lower case; a heading starts with a capital.
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

// "Oct 4, 2026" / "4 oct 2026" for a "YYYY-MM-DD" date.
function dayLabel(date: string, locale: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ChangelogPage() {
  const { t, i18n } = useTranslation("changelog");
  const locale = dateLocale(i18n.language);

  useDocumentMeta({
    title: t("meta.title"),
    description: t("meta.description"),
  });

  // Grouped by "YYYY-MM"; the month's name is written in the visitor's
  // language when it's shown.
  const grouped = useMemo(() => {
    const out = new Map<string, typeof CHANGELOG>();
    for (const entry of CHANGELOG) {
      const key = entry.date.slice(0, 7);
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(entry);
    }
    return Array.from(out.entries());
  }, []);

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PublicNav tone="dark" />

      <section className="border-b border-white/15 pt-12 md:pt-16 pb-12 md:pb-16">
        <div className="container mx-auto px-5 md:px-8 max-w-4xl">
          <p className="font-label text-gold tracking-[0.4em] mb-4">
            {t("eyebrow")}
          </p>
          <h1 className="font-editorial text-5xl md:text-6xl leading-[1.0] mb-5">
            <Trans t={t} i18nKey="title" components={{ gold: <span className="text-gold" /> }} />
          </h1>
          <p className="text-base md:text-lg max-w-2xl leading-relaxed">
            {t("intro")}
          </p>
        </div>
      </section>

      <section id="main-content" className="py-12 md:py-16">
        <div className="container mx-auto px-5 md:px-8 max-w-4xl">
          <div className="space-y-12">
            {grouped.map(([month, entries], gi) => (
              <motion.section
                key={month}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: Math.min(gi * 0.05, 0.3) }}
              >
                <h2 className="font-editorial text-3xl mb-6">{monthLabel(month, locale)}</h2>
                <ol className="space-y-6 border-l border-white/15 pl-6 ml-1 relative">
                  {entries.map((entry, i) => {
                    const meta = CATEGORY_META[entry.category];
                    const Icon = meta.Icon;
                    return (
                      <li key={`${entry.date}-${i}`} className="relative">
                        <span
                          className="absolute -left-[33px] w-3 h-3 rounded-full bg-[#14161a] border border-gold ring-4 ring-[#14161a]"
                          style={{ top: "0.4rem" }}
                        />
                        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${meta.tone}`}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {t(`categories.${entry.category}`)}
                          </span>
                          <p className="text-[11px] text-[#f4f1ea]/80 tnum">
                            {dayLabel(entry.date, locale)}
                          </p>
                        </div>
                        <h3 className="font-editorial text-xl leading-tight mb-1.5">
                          {t(`entries.${entry.id}.title`)}
                        </h3>
                        <p className="text-sm leading-relaxed max-w-2xl">
                          {t(`entries.${entry.id}.description`)}
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
          name: t("list_name"),
          numberOfItems: CHANGELOG.length,
          itemListElement: CHANGELOG.slice(0, 30).map((e, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "CreativeWork",
              name: t(`entries.${e.id}.title`),
              description: t(`entries.${e.id}.description`),
              datePublished: e.date,
            },
          })),
        }}
      />

      <Footer tone="dark" />
    </div>
  );
}
