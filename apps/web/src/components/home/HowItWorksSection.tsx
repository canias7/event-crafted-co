import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarCheck, Heart, Search, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Picture } from "@/components/shared/Picture";
import { HomeSectionIntro, HomeSectionShell } from "./HomeSectionShell";
import floralsImg from "@/assets/photos/29.webp?as=picture";
import foodImg from "@/assets/photos/18.webp?as=picture";
import beautyImg from "@/assets/photos/21.webp?as=picture";
import decorImg from "@/assets/photos/57.webp?as=picture";
import celebrateImg from "@/assets/photos/35.webp?as=picture";

// The homepage section under the hero: "Plan. Connect. Celebrate." Three steps: a
// wall of vendor photos to explore, a host and a vendor chatting, and the
// toast at the end.
const PHOTO = "absolute inset-0 h-full w-full object-cover";
const SIZES = "(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 100vw";

function ExploreVisual() {
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
      {[floralsImg, foodImg, beautyImg, decorImg].map((image, i) => (
        <div key={i} className="relative overflow-hidden">
          <Picture source={image} alt="" sizes="(min-width: 1280px) 10vw, (min-width: 640px) 17vw, 50vw" className={PHOTO} />
        </div>
      ))}
    </div>
  );
}

// Who sends each line of the Connect chat: the host's messages are outgoing
// (ink, right), the vendor's replies incoming (cream, left).
const CHAT: { key: string; from: "host" | "vendor" }[] = [
  { key: "question", from: "host" },
  { key: "answer", from: "vendor" },
  { key: "details", from: "host" },
  { key: "quote", from: "vendor" },
  { key: "thanks", from: "host" },
];

const BUBBLE = "max-w-[85%] rounded-2xl px-3 py-2 shadow-soft";
const HOST_BUBBLE = `${BUBBLE} self-end rounded-br-md border border-white/20 bg-[#14161a] text-[#f4f1ea]`;
const VENDOR_BUBBLE = `${BUBBLE} self-start rounded-bl-md bg-[#f4f1ea] text-[#14161a]`;
const POP = "animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The chat plays itself: "typing" dots, then the next message pops in, until
// the thread is done; it holds, clears and starts over. It only runs while
// it's on screen, and shows the whole thread, still, to visitors who turn
// motion off.
function ConnectVisual({ lines }: { lines: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [still] = useState(prefersReducedMotion);
  const [onScreen, setOnScreen] = useState(false);
  const [shown, setShown] = useState(still ? lines.length : 1);
  const [typing, setTyping] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (still || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [still]);

  useEffect(() => {
    if (still || !onScreen) return;
    let timer: number;
    if (clearing) {
      timer = window.setTimeout(() => {
        setShown(0);
        setClearing(false);
      }, 450);
    } else if (typing) {
      timer = window.setTimeout(() => {
        setTyping(false);
        setShown((n) => n + 1);
      }, 1100);
    } else if (shown < lines.length) {
      timer = window.setTimeout(() => setTyping(true), shown === 0 ? 500 : 900);
    } else {
      timer = window.setTimeout(() => setClearing(true), 4500);
    }
    return () => window.clearTimeout(timer);
  }, [still, onScreen, shown, typing, clearing, lines.length]);

  const next = CHAT[shown];
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0 bg-white/[0.03]"
        style={{ backgroundImage: "radial-gradient(120% 90% at 85% 100%, rgba(201,168,106,0.16), transparent 65%)" }}
      />
      {/* Bottom-anchored, so each new message pushes the older ones up and
          out under the step number; kept above the step's badge, which
          overlaps the card's bottom edge. */}
      <div
        ref={box}
        aria-hidden
        className={`absolute inset-x-3 bottom-9 top-12 flex flex-col justify-end gap-1.5 overflow-hidden text-[12px] leading-snug transition-opacity duration-300 sm:top-14 sm:text-[11px] lg:inset-x-4 lg:text-[12.5px] md:top-[4.5rem] ${clearing ? "opacity-0" : "opacity-100"}`}
        style={{ maskImage: "linear-gradient(to bottom, transparent 0, #000 44px)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 44px)" }}
      >
        {CHAT.slice(0, shown).map((line, i) => (
          <span key={line.key} className={`${line.from === "host" ? HOST_BUBBLE : VENDOR_BUBBLE} ${still ? "" : POP}`}>
            {lines[i]}
          </span>
        ))}
        {typing && next && (
          <span className={`${next.from === "host" ? HOST_BUBBLE : VENDOR_BUBBLE} ${POP} flex h-8 shrink-0 items-center gap-1`}>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className={`h-1.5 w-1.5 animate-bounce rounded-full ${next.from === "host" ? "bg-[#f4f1ea]/70" : "bg-[#14161a]/50"}`}
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        )}
      </div>
    </>
  );
}

const STEPS: { key: "explore" | "connect" | "celebrate"; number: string; icon: LucideIcon }[] = [
  { key: "explore", number: "01", icon: Search },
  { key: "connect", number: "02", icon: CalendarCheck },
  { key: "celebrate", number: "03", icon: Heart },
];

export function HowItWorksSection() {
  const { t } = useTranslation("homeSections");
  const visuals: Record<(typeof STEPS)[number]["key"], ReactNode> = {
    explore: <ExploreVisual />,
    connect: <ConnectVisual lines={CHAT.map((line) => t(`howItWorks.chat.${line.key}`))} />,
    celebrate: (
      <Picture source={celebrateImg} alt="" sizes={SIZES} className={`${PHOTO} object-[55%_35%]`} />
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
