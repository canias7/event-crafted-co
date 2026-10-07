// How it works — a step-by-step walk through Vendora for hosts and for
// vendors. Dark page (ink, cream text, champagne gold) per the owner's
// mockup. Every step describes something the product does today.

import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import heroPhoto from "@/assets/photos/11.webp?as=picture";
import inspirationPhoto from "@/assets/photos/25.webp?as=picture";
import meetPhoto from "@/assets/photos/07.webp?as=picture";
import conversationPhoto from "@/assets/photos/13.webp?as=picture";
import vendorsPhoto from "@/assets/photos/14.webp?as=picture";
import closingPhoto from "@/assets/photos/10.webp?as=picture";

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
// hosts.steps.<id> and vendors.steps.<id>; these lists keep the order
// and the photos.
const HOST_STEPS: { id: string; image?: PictureSource }[] = [
  { id: "inspiration", image: inspirationPhoto },
  { id: "meet", image: meetPhoto },
  { id: "conversation", image: conversationPhoto },
  { id: "plan" },
  { id: "book" },
];

const VENDOR_STEPS = ["profile", "showcase", "approved", "inquiries", "paid", "grow"];

const FAQ_IDS = ["find", "contact", "checked", "booking", "join", "other"];

const FAQ_LINK = "text-gold underline-offset-4 hover:underline";

// The links inside the FAQ answers, by the tag name the answers use.
const FAQ_LINKS = {
  vendors: <Link to="/vendors" className={FAQ_LINK} />,
  explore: <Link to="/explore" className={FAQ_LINK} />,
  signup: <Link to="/signup/vendor" className={FAQ_LINK} />,
  help: <Link to="/help" className={FAQ_LINK} />,
  email: <a href="mailto:hello@eventvendora.com" className={FAQ_LINK} />,
};

const num = (i: number) => String(i + 1).padStart(2, "0");

export default function HowItWorksPage() {
  const { t } = useTranslation("howItWorks");
  const hostSteps: Step[] = HOST_STEPS.map(({ id, image }) => ({
    title: t(`hosts.steps.${id}.title`),
    body: t(`hosts.steps.${id}.body`),
    points: t(`hosts.steps.${id}.points`, { returnObjects: true }) as string[],
    image,
  }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      <PublicNav tone="dark" />

      <main id="main-content">
        {/* ═══════ HERO ═══════ */}
        <section className="container mx-auto grid items-center gap-10 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
              {t("hero.eyebrow")}
            </p>
            <h1
              className="m-0 mt-4"
              style={{ fontSize: "clamp(36px, 4.4vw, 54px)", lineHeight: 1.08, letterSpacing: "-1px" }}
            >
              <Trans
                t={t}
                i18nKey="hero.title"
                components={{ gold: <span style={{ color: GOLD }} />, br: <br /> }}
              />
            </h1>
            <p className="m-0 mt-5 max-w-md text-[16px] leading-relaxed md:text-lg" style={{ color: SOFT }}>
              {t("hero.intro")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/vendors"
                className="inline-flex h-[52px] items-center gap-2 rounded-full bg-gold px-7 text-[15px] font-bold text-foreground transition-colors hover:bg-gold-hover"
              >
                {t("hero.explore_vendors")} <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#for-vendors"
                className="inline-flex items-center gap-1.5 text-[15px] font-bold transition-colors hover:text-gold"
                style={{ color: GOLD }}
              >
                {t("hero.im_a_vendor")} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/15">
            <Picture
              source={heroPhoto}
              alt={t("hero.image_alt")}
              sizes="(min-width: 1024px) 55vw, 100vw"
              loading="eager"
              fetchPriority="high"
              className="aspect-[16/10] h-full w-full object-cover"
            />
          </div>
        </section>

        {/* Jump links */}
        <div className="container mx-auto px-5 md:px-8">
          <div className="flex flex-wrap gap-2 border-t border-white/15 pt-8">
            <a
              href="#for-hosts"
              className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-[14px] font-bold transition-colors hover:border-white/40"
            >
              {t("jump.planning")}
            </a>
            <a
              href="#for-vendors"
              className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-[14px] font-bold transition-colors hover:border-white/40"
            >
              {t("jump.vendor")}
            </a>
            <a
              href="#faq"
              className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-[14px] font-bold transition-colors hover:border-white/40"
            >
              {t("jump.questions")}
            </a>
          </div>
        </div>

        {/* ═══════ FOR HOSTS ═══════ */}
        <section id="for-hosts" className="container mx-auto scroll-mt-24 px-5 py-14 md:scroll-mt-28 md:px-8 md:py-20">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
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
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
            >
              {t("hosts.cta")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* ═══════ FOR VENDORS ═══════ */}
        <section id="for-vendors" className="scroll-mt-20 border-y border-white/15 md:scroll-mt-24">
          <div className="container mx-auto grid gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-2 lg:gap-14">
            <div className="overflow-hidden rounded-3xl border border-white/15 lg:sticky lg:top-32 lg:self-start">
              <Picture
                source={vendorsPhoto}
                alt={t("vendors.image_alt")}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="aspect-[4/3] h-full w-full object-cover lg:aspect-[4/5]"
              />
            </div>
            <div>
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
                {t("vendors.eyebrow")}
              </p>
              <h2 className="m-0 mt-3 text-[30px] leading-tight md:text-[42px]">
                {t("vendors.title")}
              </h2>
              <p className="m-0 mt-3 max-w-xl text-[15px] leading-relaxed md:text-base" style={{ color: SOFT }}>
                {t("vendors.intro")}
              </p>
              <ol className="m-0 mt-8 list-none space-y-6 p-0">
                {VENDOR_STEPS.map((id, i) => (
                  <li key={id} className="flex gap-4">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[15px] font-bold"
                      style={{ borderColor: GOLD, color: GOLD }}
                    >
                      {num(i)}
                    </span>
                    <div className="pt-1.5">
                      <h3 className="m-0 text-[18px] leading-snug">{t(`vendors.steps.${id}.title`)}</h3>
                      <p className="m-0 mt-1 text-[14.5px] leading-relaxed" style={{ color: SOFT }}>
                        {t(`vendors.steps.${id}.body`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link
                to="/signup/vendor"
                className="mt-9 inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
              >
                {t("vendors.cta")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════ FAQ ═══════ */}
        <section id="faq" className="container mx-auto scroll-mt-24 px-5 py-14 md:scroll-mt-28 md:px-8 md:py-20">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
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
        </section>

        {/* ═══════ CLOSING CTA ═══════ */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <Picture source={closingPhoto} alt="" sizes="100vw" className="h-full w-full object-cover" />
          </div>
          <div className="absolute inset-0" style={{ background: "rgba(10,11,14,0.62)" }} />
          <div className="relative container mx-auto px-5 py-20 text-center md:px-8 md:py-28">
            <h2 className="hero-headline m-0 mx-auto max-w-2xl text-[32px] leading-tight md:text-[48px]">
              <Trans t={t} i18nKey="closing.title" components={{ gold: <span style={{ color: GOLD }} /> }} />
            </h2>
            <Link
              to="/vendors"
              className="mt-8 inline-flex h-[52px] items-center gap-2 rounded-full bg-gold px-7 text-[15px] font-bold text-foreground transition-colors hover:bg-gold-hover"
            >
              {t("closing.cta")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
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
