import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarCheck, CheckCheck, Heart, Paperclip, Search, Send, Smile, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Picture } from "@/components/shared/Picture";
import { intlLocale } from "@/lib/intlLocale";
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

// Who sends each line of the Connect chat, seen from the host's side as in
// the real inbox: the host's own messages on the right, the vendor's on the
// left.
const CHAT: { key: string; from: "host" | "vendor" }[] = [
  { key: "question", from: "host" },
  { key: "answer", from: "vendor" },
  { key: "details", from: "host" },
  { key: "quote", from: "vendor" },
  { key: "thanks", from: "host" },
];

// Same bubbles as the inquiry thread (HostInquiryDetailPage): the host's
// in cream with a hairline and a squared bottom-right corner, the vendor's
// on the muted surface with a squared bottom-left corner.
const HOST_BUBBLE = "self-end rounded-2xl rounded-br-sm border border-border bg-card";
const VENDOR_BUBBLE = "rounded-2xl rounded-bl-sm border border-transparent bg-muted";
const POP = "animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out";
const TYPE_MS = 38;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function VendorAvatar({ initial, size }: { initial: string; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-foreground bg-foreground/[0.08] ${
        size === "md" ? "h-8 w-8 text-[12px]" : "h-5 w-5 text-[9px]"
      }`}
    >
      {initial}
    </span>
  );
}

// A miniature of Vendora's inbox that plays a host–vendor conversation: the
// thread header, the host's messages typed into the message bar and sent,
// the vendor's replies after the "typing" dots, and "Read" at the end. It
// holds, clears and starts over; it runs only while on screen, and shows the
// finished thread, still, to visitors who turn motion off.
function ConnectVisual({
  lines,
  vendorName,
  subtitle,
  placeholder,
  readLabel,
}: {
  lines: string[];
  vendorName: string;
  subtitle: string;
  placeholder: string;
  readLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [still] = useState(prefersReducedMotion);
  const [onScreen, setOnScreen] = useState(false);
  // Messages sent so far; the next one is CHAT[sent].
  const [sent, setSent] = useState(still ? lines.length : 1);
  // How much of the next host message is in the message bar.
  const [typed, setTyped] = useState(0);
  const [vendorTyping, setVendorTyping] = useState(false);
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
    const next = CHAT[sent];
    let timer: number;
    if (clearing) {
      timer = window.setTimeout(() => {
        setSent(0);
        setTyped(0);
        setClearing(false);
      }, 450);
    } else if (!next) {
      timer = window.setTimeout(() => setClearing(true), 4500);
    } else if (next.from === "host") {
      const text = lines[sent];
      timer =
        typed < text.length
          ? window.setTimeout(() => setTyped((n) => n + 1), typed === 0 ? 700 : TYPE_MS)
          : window.setTimeout(() => {
              setSent((n) => n + 1);
              setTyped(0);
            }, 350);
    } else if (!vendorTyping) {
      timer = window.setTimeout(() => setVendorTyping(true), 600);
    } else {
      timer = window.setTimeout(() => {
        setVendorTyping(false);
        setSent((n) => n + 1);
      }, 1400);
    }
    return () => window.clearTimeout(timer);
  }, [still, onScreen, sent, typed, vendorTyping, clearing, lines]);

  const next = CHAT[sent];
  const draft = next?.from === "host" ? lines[sent].slice(0, typed) : "";
  const initial = vendorName.charAt(0).toUpperCase();
  const done = sent >= lines.length;

  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0 bg-card"
      />
      {/* The inbox fills the whole card, light as in the portals. Its header
          leaves room at the top for the step number; the message bar sits
          clear of the step's badge, which overlaps the card's bottom edge. */}
      <div
        ref={box}
        aria-hidden
        className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background text-foreground"
      >
        <div
          className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 pb-2.5 pt-14 md:pt-[4.75rem]"
        >
          <span className="relative shrink-0">
            <VendorAvatar initial={initial} size="md" />
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[12px] font-bold">{vendorName}</span>
            <span className="block truncate text-[10px]">{subtitle}</span>
          </span>
        </div>

        <div
          className={`flex min-h-0 flex-1 flex-col justify-end gap-1 overflow-hidden px-3 py-2 text-[11.5px] leading-snug transition-opacity duration-300 ${
            clearing ? "opacity-0" : "opacity-100"
          }`}
          style={{ maskImage: "linear-gradient(to bottom, transparent 0, #000 20px)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 20px)" }}
        >
          {CHAT.slice(0, sent).map((line, i) => {
            const tail = CHAT[i + 1]?.from !== line.from;
            return line.from === "host" ? (
              <span key={line.key} className={`max-w-[85%] px-3 py-1.5 ${HOST_BUBBLE} ${still ? "" : POP}`}>
                {lines[i]}
              </span>
            ) : (
              <span key={line.key} className={`flex items-end gap-1.5 ${still ? "" : POP}`}>
                {tail ? <VendorAvatar initial={initial} size="sm" /> : <span className="w-5 shrink-0" />}
                <span className={`max-w-[85%] px-3 py-1.5 ${VENDOR_BUBBLE}`}>{lines[i]}</span>
              </span>
            );
          })}
          {vendorTyping ? (
            <span className={`flex shrink-0 items-end gap-1.5 ${POP}`}>
              <span className="w-5 shrink-0" />
              <span className={`inline-flex items-end gap-1 px-3 py-2 ${VENDOR_BUBBLE}`}>
                {[0, 0.2, 0.4].map((delay) => (
                  <span
                    key={delay}
                    className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/40"
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </span>
            </span>
          ) : null}
          {done ? (
            <span className={`flex shrink-0 items-center justify-end gap-1 pr-1 text-[10px] ${still ? "" : POP}`}>
              <CheckCheck className="h-3 w-3" />
              {readLabel}
            </span>
          ) : null}
        </div>

        {/* The message bar: the host's next message is typed here, then sent. */}
        <div className="flex shrink-0 items-center gap-1 px-3 pb-8">
          <span className="flex min-w-0 flex-1 items-center gap-1 rounded-3xl border border-border bg-background py-1 pl-2 pr-1 shadow-soft">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-foreground/50" />
            <Smile className="h-3.5 w-3.5 shrink-0 text-foreground/50" />
            <span className={`min-w-0 flex-1 truncate px-1 text-[11px] ${draft ? "text-foreground" : "text-placeholder"}`}>
              {draft || placeholder}
            </span>
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                draft ? "bg-foreground text-background" : "bg-muted text-foreground/50"
              }`}
            >
              <Send className="h-3 w-3" />
            </span>
          </span>
        </div>
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
    connect: (
      <ConnectVisual
        lines={CHAT.map((line) => t(`howItWorks.chat.${line.key}`))}
        vendorName={t("howItWorks.chat.vendorName")}
        subtitle={t("howItWorks.chat.subtitle")}
        placeholder={t("howItWorks.chat.placeholder", { name: t("howItWorks.chat.vendorName") })}
        readLabel={t("howItWorks.chat.read", {
          time: new Date(2026, 5, 14, 19, 5).toLocaleTimeString(intlLocale(), { hour: "numeric", minute: "2-digit" }),
        })}
      />
    ),
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
              <div
                className={`relative aspect-[4/3] overflow-hidden rounded-2xl border border-border sm:aspect-[4/5] ${
                  // The inbox needs the height; the photo cards go wider on phones.
                  step.key === "connect" ? "" : "min-[360px]:aspect-[16/10]"
                }`}
              >
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
                  className={`absolute left-4 top-2 z-20 font-editorial text-[48px] leading-none md:text-[64px] ${
                    // Champagne, still see-through (owner's pick): with a soft
                    // shadow over the photos so it reads on busy pictures, and
                    // as bronze on the light inbox.
                    step.key === "connect" ? "text-accent/50" : "text-gold/80"
                  }`}
                  style={step.key === "connect" ? undefined : { textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}
                >
                  {step.number}
                </span>
              </div>
              <span className="relative z-20 -mt-6 ml-5 flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-background text-accent">
                <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="m-0 mt-4 font-label tracking-[0.3em] text-accent">
                {t(`howItWorks.steps.${step.key}.title`)}
              </h3>
              <p className="m-0 mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {t(`howItWorks.steps.${step.key}.body`)}
              </p>
            </li>
          );
        })}
      </ol>
    </HomeSectionShell>
  );
}
