import type { ReactNode } from "react";
import { CalendarCheck, Heart, Search, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Picture } from "@/components/shared/Picture";
import { HomeSectionIntro, HomeSectionShell, type TrackHomeEvent } from "./HomeSectionShell";
import venuesImg from "@/assets/categories/venues.jpg?as=picture";
import cateringImg from "@/assets/categories/catering.jpg?as=picture";
import entertainmentImg from "@/assets/categories/entertainment.jpg?as=picture";
import photographyImg from "@/assets/categories/photography.jpg?as=picture";
import planningImg from "@/assets/categories/planning.jpg?as=picture";
import celebrateImg from "@/assets/hero/nye.jpg?as=picture";

// Homepage test, version C: "Plan. Connect. Celebrate." Three steps, each
// on a photo: a wall of vendors to explore, a coordinator with a quick
// exchange about availability, and the toast at the end.
const PHOTO = "absolute inset-0 h-full w-full object-cover";
const SIZES = "(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 100vw";

function ExploreVisual() {
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
      {[venuesImg, cateringImg, entertainmentImg, photographyImg].map((image, i) => (
        <div key={i} className="relative overflow-hidden">
          <Picture source={image} alt="" sizes="(min-width: 1280px) 10vw, (min-width: 640px) 17vw, 50vw" className={PHOTO} />
        </div>
      ))}
    </div>
  );
}

function ConnectVisual({ question, answer }: { question: string; answer: string }) {
  return (
    <>
      <Picture source={planningImg} alt="" sizes={SIZES} className={`${PHOTO} object-[50%_35%]`} />
      {/* The host's message (outgoing, ink) and the vendor's reply, kept
          above the step's badge, which overlaps the photo's bottom edge. */}
      <div aria-hidden className="absolute inset-x-3 bottom-9 flex flex-col gap-1.5 text-[12px] leading-snug sm:text-[11px] lg:inset-x-4 lg:text-[12.5px]">
        <span className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-white/20 bg-[#14161a] px-3 py-2 text-[#f4f1ea] shadow-soft">
          {question}
        </span>
        <span className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-[#f4f1ea] px-3 py-2 text-[#14161a] shadow-soft">
          {answer}
        </span>
      </div>
    </>
  );
}

const STEPS: { key: "explore" | "connect" | "celebrate"; number: string; icon: LucideIcon }[] = [
  { key: "explore", number: "01", icon: Search },
  { key: "connect", number: "02", icon: CalendarCheck },
  { key: "celebrate", number: "03", icon: Heart },
];

export function HowItWorksSection({ onTrack }: { onTrack: TrackHomeEvent }) {
  const { t } = useTranslation("homeSections");
  const visuals: Record<(typeof STEPS)[number]["key"], ReactNode> = {
    explore: <ExploreVisual />,
    connect: <ConnectVisual question={t("howItWorks.chat.question")} answer={t("howItWorks.chat.answer")} />,
    celebrate: (
      <Picture source={celebrateImg} alt="" sizes={SIZES} className={`${PHOTO} object-[50%_30%]`} />
    ),
  };

  return (
    <HomeSectionShell
      labelledBy="home-how-title"
      intro={
        <HomeSectionIntro
          id="home-how-title"
          eyebrow={t("howItWorks.eyebrow")}
          title={t("howItWorks.title")}
          body={t("howItWorks.body")}
          cta={t("howItWorks.cta")}
          to="/signup"
          onCta={() => onTrack("click", "cta")}
        />
      }
    >
      <ol className="m-0 grid list-none gap-10 p-0 sm:grid-cols-3 sm:gap-5 lg:gap-6">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.key}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/15 min-[360px]:aspect-[16/10] sm:aspect-[4/5]">
                {visuals[step.key]}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(10,11,14,0.55) 0%, rgba(10,11,14,0) 38%, rgba(10,11,14,0) 62%, rgba(10,11,14,0.35) 100%)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute left-4 top-2 font-editorial text-[48px] leading-none text-[#f4f1ea]/35 md:text-[64px]"
                >
                  {step.number}
                </span>
              </div>
              <span className="relative -mt-6 ml-5 flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-[#14161a] text-gold">
                <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="m-0 mt-4 font-label tracking-[0.3em] text-gold">
                {t(`howItWorks.steps.${step.key}.title`)}
              </h3>
              <p className="m-0 mt-2 text-[15px] leading-relaxed text-[#f4f1ea]/80">
                {t(`howItWorks.steps.${step.key}.body`)}
              </p>
            </li>
          );
        })}
      </ol>
    </HomeSectionShell>
  );
}
