// How it works: everything a host needs on one page. This page and
// "Plan with Vendora" (/for-hosts, which now redirects here) were merged
// on the owner's call, Oct 2026. Vendors have their own page, For vendors.
// Dark page (ink, cream text, champagne gold). Every step describes
// something the product does today.
//
// Text: howItWorks.json (hero eyebrow, the five steps, FAQ) and
// forHosts.json (hero, event types, tools, closing).

import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, FileSignature, FileText, MessageCircle, Search, Star } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Footer } from "@/components/public/Footer";
import { ClosingBand, PhotoHero } from "@/components/public/PhotoHero";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import heroPhoto from "@/assets/photos/45.webp?as=picture";
import inspirationPhoto from "@/assets/photos/25.webp?as=picture";
import meetPhoto from "@/assets/photos/07.webp?as=picture";
import conversationPhoto from "@/assets/photos/44.webp?as=picture";
import { EmailMenu } from "@/components/shared/EmailMenu";

const INK = "#14161a";
const CREAM = "#f4f1ea";
const GOLD = "#c9a86a";
const SOFT = "rgba(244,241,234,0.78)";

type Step = {
  title: string;
  body: string;
  points: string[];
  image?: PictureSource;
};

// Step text lives in locales/<lang>/howItWorks.json under
// hosts.steps.<id>; this list keeps the order and the photos.
const HOST_STEPS: { id: string; image?: PictureSource }[] = [
  { id: "inspiration", image: inspirationPhoto },
  { id: "meet", image: meetPhoto },
  { id: "conversation", image: conversationPhoto },
  { id: "plan" },
  { id: "book" },
];

const EVENT_TYPES = ["weddings", "birthdays", "corporate", "parties", "social", "more"];

const TOOLS = [
  { id: "search", icon: Search },
  { id: "messaging", icon: MessageCircle },
  { id: "availability", icon: CalendarDays },
  { id: "quotes", icon: FileText },
  { id: "payments", icon: FileSignature },
  { id: "reviews", icon: Star },
];

const FAQ_IDS = ["find", "contact", "checked", "booking", "join", "other"];

const FAQ_LINK = "text-gold underline-offset-4 hover:underline";

// The links inside the FAQ answers, by the tag name the answers use.
const FAQ_LINKS = {
  vendors: <Link to="/vendors" className={FAQ_LINK} />,
  explore: <Link to="/explore" className={FAQ_LINK} />,
  signup: <Link to="/signup/vendor" className={FAQ_LINK} />,
  help: <Link to="/help" className={FAQ_LINK} />,
  email: <EmailMenu className={FAQ_LINK} />,
};

const num = (i: number) => String(i + 1).padStart(2, "0");

const EYEBROW = "m-0 text-[11px] font-bold uppercase tracking-[0.22em]";

export default function HowItWorksPage() {
  const { t } = useTranslation("howItWorks");
  const { t: th } = useTranslation("forHosts");
  const hostSteps: Step[] = HOST_STEPS.map(({ id, image }) => ({
    title: t(`hosts.steps.${id}.title`),
    body: t(`hosts.steps.${id}.body`),
    points: t(`hosts.steps.${id}.points`, { returnObjects: true }) as string[],
    image,
  }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      <PhotoHero
        photo={heroPhoto}
        position="object-[50%_30%]"
        eyebrow={t("hero.eyebrow")}
        title={
          <Trans
            t={th}
            i18nKey="hero.title"
            components={{ gold: <span className="font-editorial text-gold" /> }}
          />
        }
        sub={th("hero.sub")}
        primary={{ label: th("hero.primary"), to: "/vendors" }}
        secondary={{ label: t("hero.im_a_vendor"), to: "/for-vendors" }}
      />

      <main id="main-content">
        {/* ═══════ THE STEPS ═══════ */}
        <section id="steps" className="container mx-auto scroll-mt-24 px-5 py-14 md:scroll-mt-28 md:px-8 md:py-20">
          <p className={EYEBROW} style={{ color: GOLD }}>
            {t("hosts.eyebrow")}
          </p>
          <h2 className="m-0 mt-3 text-[30px] leading-tight md:text-[42px]">
            {t("hosts.title")}
          </h2>
          <p className="m-0 mt-3 max-w-2xl text-[15px] leading-relaxed md:text-base" style={{ color: SOFT }}>
            {t("hosts.intro")}
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {hostSteps.slice(0, 3).map((s, i) => (
              <StepCard key={HOST_STEPS[i].id} step={s} index={i} />
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {hostSteps.slice(3).map((s, i) => (
              <StepCard key={HOST_STEPS[i + 3].id} step={s} index={i + 3} />
            ))}
          </div>

          <div className="mt-8">
            <Link
              to="/vendors"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-bold text-ink transition-colors hover:bg-gold-hover"
            >
              {t("hosts.cta")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* ═══════ EVERY EVENT ═══════ */}
        <section className="border-t border-white/15">
          <div className="container mx-auto flex flex-col gap-6 px-5 py-14 md:px-8 md:py-16 lg:flex-row lg:items-center lg:gap-12">
            <p className="m-0 shrink-0 text-[26px] font-bold leading-snug md:text-[30px]">
              {th("event_types.title_line1")} {th("event_types.title_line2")}{" "}
              <span className="text-gold">✦</span>
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {EVENT_TYPES.map((type) => (
                <li
                  key={type}
                  className="inline-flex h-11 items-center rounded-full border border-white/15 bg-white/[0.04] px-4 text-[14px] font-bold"
                >
                  {th(`event_types.items.${type}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ═══════ TOOLS ═══════ */}
        <section className="border-t border-white/15">
          <div className="container mx-auto px-5 py-16 md:px-8 md:py-24">
            <p className="m-0 text-center font-label text-gold">{th("tools.eyebrow")}</p>
            <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[38px]">
              {th("tools.title")}
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
                  <p className="m-0 mt-3 text-[14px] font-bold">{th(`tools.items.${tool.id}.title`)}</p>
                  <p className="m-0 mt-1 text-[13px] leading-relaxed">{th(`tools.items.${tool.id}.body`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ FAQ ═══════ */}
        <section id="faq" className="border-t border-white/15">
          <div className="container mx-auto scroll-mt-24 px-5 py-14 md:scroll-mt-28 md:px-8 md:py-20">
            <p className={EYEBROW} style={{ color: GOLD }}>
              {t("faq.eyebrow")}
            </p>
            <h2 className="m-0 mt-3 text-[30px] leading-tight md:text-[42px]">
              {t("faq.title")}
            </h2>
            <Accordion type="single" collapsible className="mt-8 space-y-3">
              {FAQ_IDS.map((id) => (
                <AccordionItem
                  key={id}
                  value={id}
                  className="rounded-xl border border-white/15 px-5 data-[state=open]:border-white/30"
                >
                  <AccordionTrigger className="py-4 text-left text-[16px] font-bold hover:no-underline [&>svg]:text-gold">
                    {t(`faq.items.${id}.q`)}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-[15px] leading-relaxed" style={{ color: SOFT }}>
                    <Trans t={t} i18nKey={`faq.items.${id}.a`} components={FAQ_LINKS} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <div className="border-t border-white/15">
          <ClosingBand
            title={
              <Trans
                t={th}
                i18nKey="closing.title"
                components={{ gold: <span className="font-editorial text-gold" /> }}
              />
            }
            cta={{ label: th("closing.cta"), to: "/vendors" }}
          />
        </div>
      </main>

      <Footer tone="dark" />
    </div>
  );
}

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-white/15 bg-white/[0.03] p-2">
      {step.image && (
        <div className="overflow-hidden rounded-xl">
          <Picture
            source={step.image}
            alt=""
            sizes="(min-width: 768px) 33vw, 100vw"
            className="aspect-[3/2] w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col px-4 pb-5 pt-5">
        <div className="flex items-center gap-4">
          <span className="text-[34px] font-bold leading-none" style={{ color: GOLD }}>
            {num(index)}
          </span>
          <span className="h-px flex-1 bg-white/15" aria-hidden />
        </div>
        <h3 className="m-0 mt-4 text-[21px] leading-snug">{step.title}</h3>
        <p className="m-0 mt-2 text-[14.5px] leading-relaxed" style={{ color: SOFT }}>
          {step.body}
        </p>
        <ul className="m-0 mt-4 list-none space-y-2 p-0">
          {step.points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14px] leading-snug">
              <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
