// Press kit. Only facts that are true today: claims that weren't (stock
// photos captioned as screenshots, an "editorial team" checking
// references, calendar sync, real-event galleries, US-wide coverage…)
// came off in Oct 2026 and are tracked in the owner's "Press page — to
// work on later" doc until they're real.

import { Download, Mail, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { CONTACT_EMAIL, Footer } from "@/components/public/Footer";
import { VendoraLogo } from "@/components/shared/VendoraLogo";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

// The words for the stats, quick facts and colour names live in
// locales/<language>/press.json (stats.<id>, facts.items.<id>,
// brand.palette.<id>).
const STATS: Array<{ id: string; value: string }> = [
  { id: "categories", value: "31" },
  { id: "languages", value: "3" },
  { id: "free_listing", value: "$0" },
];

const QUICK_FACTS = ["what", "founded", "reviewed", "vendors_get", "finding", "languages"];

const PALETTE = [
  { id: "ink", hex: "#14161A" },
  { id: "ivory", hex: "#F4F1EA" },
  { id: "cream", hex: "#FBF9F4" },
  { id: "bronze", hex: "#8A6F3E" },
  { id: "champagne", hex: "#C9A86A" },
];

export default function PressPage() {
  const { t } = useTranslation("press");
  const [copied, setCopied] = useState(false);

  useDocumentMeta({
    title: t("meta.title"),
    description: t("meta.description"),
  });

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      toast.success(t("toast.copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("toast.copy_failed"));
    }
  }

  const emailButton = (
    <Button type="button" onClick={copyEmail}>
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
      {CONTACT_EMAIL}
      <Copy className="ml-1.5 h-3 w-3" />
    </Button>
  );

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PublicNav tone="dark" />

      {/* Hero */}
      <section className="border-b border-white/15 pb-12 pt-12 md:pb-16 md:pt-16">
        <div className="container mx-auto max-w-5xl px-5 md:px-8">
          <p className="mb-4 font-label text-gold">{t("hero.eyebrow")}</p>
          <h1 className="mb-5 font-editorial text-5xl leading-[1.0] md:text-6xl">
            <Trans t={t} i18nKey="hero.title" components={{ gold: <span className="text-gold" /> }} />
          </h1>
          <p className="mb-8 max-w-2xl text-base leading-relaxed md:text-lg">
            {t("hero.body")}
          </p>
          {emailButton}
        </div>
      </section>

      {/* Stats */}
      <section id="main-content" className="border-b border-white/15 py-12">
        <div className="container mx-auto max-w-5xl px-5 md:px-8">
          <div className="grid grid-cols-3 gap-4">
            {STATS.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.08 }}
                className="text-center md:text-left"
              >
                <p className="mb-1 font-editorial text-4xl tnum md:text-5xl">{s.value}</p>
                {/* Hyphenate long words (Russian «подрядчиков») so they stay in their third of a phone screen. */}
                <p className="text-xs uppercase tracking-[0.2em] hyphens-auto [overflow-wrap:anywhere]">
                  {t(`stats.${s.id}`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick facts */}
      <section className="py-14 md:py-20">
        <div className="container mx-auto max-w-3xl px-5 md:px-8">
          <p className="mb-3 font-label text-gold">{t("facts.eyebrow")}</p>
          <h2 className="mb-10 font-editorial text-4xl">{t("facts.title")}</h2>
          <dl className="space-y-6">
            {QUICK_FACTS.map((id) => (
              <div key={id}>
                <dt className="mb-1.5 text-xs uppercase tracking-[0.3em] text-gold">{t(`facts.items.${id}.label`)}</dt>
                <dd className="m-0 text-base leading-relaxed">{t(`facts.items.${id}.body`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Logo + brand */}
      <section className="border-t border-white/15 py-14 md:py-20">
        <div className="container mx-auto max-w-3xl px-5 md:px-8">
          <p className="mb-3 font-label text-gold">{t("brand.eyebrow")}</p>
          <h2 className="mb-8 font-editorial text-4xl">{t("brand.title")}</h2>

          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {/* The full lockup on both, as in every page's header. It is
                259px wide: one tile per row below 768px, 24px sides on
                phones so it fits a 360px screen. */}
            <div className="flex items-center justify-center rounded-2xl border border-white/15 bg-[#14161a] px-6 py-10 md:p-10">
              <VendoraLogo size="md" color="#f4f1ea" withTagline />
            </div>
            <div className="flex items-center justify-center rounded-2xl border border-white/15 bg-[#f4f1ea] px-6 py-10 md:p-10">
              <VendoraLogo size="md" color="#14161a" withTagline />
            </div>
          </div>

          <p className="mb-6 text-sm leading-relaxed">
            {t("brand.usage")}
          </p>

          <div className="mb-10 flex flex-wrap items-center gap-3 text-xs">
            <a
              href="/pwa-512.png"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 font-bold transition-colors hover:border-white/40"
            >
              <Download className="h-3 w-3" />
              {t("brand.app_icon", { size: "512×512" })}
            </a>
            <a
              href="/pwa-192.png"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 font-bold transition-colors hover:border-white/40"
            >
              <Download className="h-3 w-3" />
              {t("brand.app_icon", { size: "192×192" })}
            </a>
          </div>

          <h3 className="mb-4 font-editorial text-2xl">{t("brand.colours")}</h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {PALETTE.map((c) => (
              <div key={c.id}>
                <div
                  className="h-16 rounded-2xl border border-white/15"
                  style={{ backgroundColor: c.hex }}
                />
                <p className="mt-2 text-sm font-bold">{t(`brand.palette.${c.id}`)}</p>
                <p className="m-0 text-[11px] tnum text-[#f4f1ea]/80">{c.hex}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-white/15 py-14 md:py-20">
        <div className="container mx-auto max-w-3xl px-5 text-center md:px-8">
          <p className="mb-3 font-label text-gold">{t("contact.eyebrow")}</p>
          <h2 className="mb-3 font-editorial text-4xl">{t("contact.title")}</h2>
          <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed">
            {t("contact.body")}
          </p>
          {emailButton}
        </div>
      </section>

      <Footer tone="dark" />
    </div>
  );
}
