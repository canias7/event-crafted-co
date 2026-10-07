// For vendors: what Vendora does for event businesses. This used to sit
// on the home page; it has its own page so the home page stays simple.
// "I'm a vendor" on the home page leads here.

import { CalendarDays, CreditCard, FileText, MessageCircle, Search, Star } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Footer } from "@/components/public/Footer";
import { ClosingBand, PhotoHero } from "@/components/public/PhotoHero";
import heroPhoto from "@/assets/photos/27.webp?as=picture";

// Text lives in locales/<lang>/forVendors.json, keyed by these ids.
const STEPS = ["discovered", "inquiries", "book", "grow"];

const TOOLS = [
  { id: "found", icon: Search },
  { id: "inbox", icon: MessageCircle },
  { id: "availability", icon: CalendarDays },
  { id: "proposals", icon: FileText },
  { id: "payments", icon: CreditCard },
  { id: "reviews", icon: Star },
];

export default function ForVendorsPage() {
  const { t } = useTranslation("forVendors");
  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PhotoHero
        photo={heroPhoto}
        position="object-[50%_22%]"
        eyebrow={t("hero.eyebrow")}
        title={
          <Trans
            t={t}
            i18nKey="hero.title"
            components={{ gold: <span className="font-editorial text-gold" /> }}
          />
        }
        sub={t("hero.sub")}
        primary={{ label: t("hero.primary"), to: "/signup/vendor" }}
        secondary={{ label: t("hero.secondary"), to: "/how-it-works#for-vendors" }}
      />

      <main id="main-content">
        {/* Steps */}
        <section className="container mx-auto px-5 py-16 md:px-8 md:py-24">
          <p className="m-0 text-center font-label text-gold">{t("steps.eyebrow")}</p>
          <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[42px]">
            {t("steps.title")}
          </h2>
          <ol className="m-0 mt-12 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {STEPS.map((id, i) => (
              <li key={id} className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 md:p-6">
                <p className="m-0 text-[30px] font-bold leading-none text-gold">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="m-0 mt-4 text-[16px] font-bold">{t(`steps.items.${id}.title`)}</p>
                <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed">{t(`steps.items.${id}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Tools */}
        <section className="border-t border-white/15">
          <div className="container mx-auto px-5 py-16 md:px-8 md:py-24">
            <p className="m-0 text-center font-label text-gold">{t("tools.eyebrow")}</p>
            <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[38px]">
              {t("tools.title")}
            </h2>
            <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
              {TOOLS.map((tool) => (
                <div key={tool.id} className="text-center">
                  <span
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15"
                    style={{ border: "1px solid rgba(201,168,106,0.4)" }}
                  >
                    <tool.icon className="h-5 w-5 text-gold" aria-hidden />
                  </span>
                  <p className="m-0 mt-3 text-[14px] font-bold">{t(`tools.items.${tool.id}.title`)}</p>
                  <p className="m-0 mt-1 text-[13px] leading-relaxed">{t(`tools.items.${tool.id}.body`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="border-t border-white/15">
          <ClosingBand
            title={
              <Trans
                t={t}
                i18nKey="closing.title"
                components={{ gold: <span className="font-editorial text-gold" /> }}
              />
            }
            sub={t("closing.sub")}
            cta={{ label: t("closing.cta"), to: "/signup/vendor" }}
          />
        </div>
      </main>

      <Footer tone="dark" />
    </div>
  );
}
