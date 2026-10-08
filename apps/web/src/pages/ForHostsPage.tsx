// For hosts: what Vendora does for someone planning an event. This used
// to sit on the home page; it has its own page so the home page stays
// simple. "I'm planning an event" on the home page leads here.

import { CalendarDays, CreditCard, FileText, MessageCircle, Search, Star } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Footer } from "@/components/public/Footer";
import { ClosingBand, PhotoHero } from "@/components/public/PhotoHero";
import { Picture } from "@/components/shared/Picture";
import heroPhoto from "@/assets/photos/45.webp?as=picture";
import discoverPhoto from "@/assets/photos/08.webp?as=picture";
import connectPhoto from "@/assets/photos/17.webp?as=picture";
import planPhoto from "@/assets/photos/22.webp?as=picture";
import bookPhoto from "@/assets/photos/26.webp?as=picture";

// Text lives in locales/<lang>/forHosts.json, keyed by these ids.
const STEPS = [
  { id: "discover", image: discoverPhoto },
  { id: "connect", image: connectPhoto },
  { id: "plan", image: planPhoto },
  { id: "book", image: bookPhoto },
];

const EVENT_TYPES = ["weddings", "birthdays", "corporate", "parties", "social", "more"];

const TOOLS = [
  { id: "search", icon: Search },
  { id: "messaging", icon: MessageCircle },
  { id: "availability", icon: CalendarDays },
  { id: "quotes", icon: FileText },
  { id: "payments", icon: CreditCard },
  { id: "reviews", icon: Star },
];

export default function ForHostsPage() {
  const { t } = useTranslation("forHosts");
  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PhotoHero
        photo={heroPhoto}
        position="object-[50%_30%]"
        eyebrow={t("hero.eyebrow")}
        title={
          <Trans
            t={t}
            i18nKey="hero.title"
            components={{ gold: <span className="font-editorial text-gold" /> }}
          />
        }
        sub={t("hero.sub")}
        primary={{ label: t("hero.primary"), to: "/vendors" }}
        secondary={{ label: t("hero.secondary"), to: "/how-it-works#for-hosts" }}
      />

      <main id="main-content">
        {/* Steps */}
        <section className="container mx-auto px-5 py-16 md:px-8 md:py-24">
          <p className="m-0 text-center font-label text-gold">{t("steps.eyebrow")}</p>
          <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[42px]">
            {t("steps.title")}
          </h2>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_260px] lg:gap-12">
            <ol className="m-0 grid list-none grid-cols-2 gap-x-5 gap-y-10 p-0 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.id} className="text-center">
                  {/* Arch-top photo */}
                  <div
                    className="mx-auto aspect-[3/4] w-full max-w-[190px] overflow-hidden bg-white/[0.03]"
                    style={{
                      borderRadius: "999px 999px 22px 22px",
                      border: "1px solid rgba(201,168,106,0.4)",
                      padding: "6px",
                    }}
                  >
                    <div className="h-full w-full overflow-hidden" style={{ borderRadius: "999px 999px 18px 18px" }}>
                      <Picture source={s.image} alt="" sizes="190px" className="h-full w-full object-cover" />
                    </div>
                  </div>
                  <p className="m-0 mt-4 text-[16px] font-bold">
                    {i + 1}. {t(`steps.items.${s.id}.title`)}
                  </p>
                  <p className="m-0 mx-auto mt-1.5 max-w-[220px] text-[13.5px] leading-relaxed">
                    {t(`steps.items.${s.id}.body`)}
                  </p>
                </li>
              ))}
            </ol>

            <div className="self-start rounded-2xl border border-white/15 bg-white/[0.03] p-6">
              <p className="m-0 text-[22px] font-bold leading-snug">
                {t("event_types.title_line1")}
                <br />
                {t("event_types.title_line2")} <span className="text-gold">✦</span>
              </p>
              <ul className="m-0 mt-4 list-none space-y-2.5 p-0">
                {EVENT_TYPES.map((type) => (
                  <li key={type} className="border-b border-white/15 pb-2.5 text-[14px] last:border-0 last:pb-0">
                    {t(`event_types.items.${type}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
            cta={{ label: t("closing.cta"), to: "/vendors" }}
          />
        </div>
      </main>

      <Footer tone="dark" />
    </div>
  );
}
