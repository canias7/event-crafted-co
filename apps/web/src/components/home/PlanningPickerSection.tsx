import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Baby,
  Briefcase,
  Cake,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Gem,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import { useCategoryNames } from "@/lib/categoryNames";
import { HomeSectionIntro, HomeSectionShell, type TrackHomeEvent } from "./HomeSectionShell";
import weddingImg from "@/assets/photos/33.webp?as=picture";
import birthdayImg from "@/assets/photos/37.webp?as=picture";
import corporateImg from "@/assets/photos/49.webp?as=picture";
import privateImg from "@/assets/photos/42.webp?as=picture";
import babyShowerImg from "@/assets/photos/43.webp?as=picture";
import otherImg from "@/assets/photos/48.webp?as=picture";

// Homepage test, version B: "What are you planning?". Picking an event
// type shows its photo, a line about it and the vendor categories it
// usually needs (sub-category names as stored, shown translated); each
// opens the vendors page filtered to it.
type EventKey = "wedding" | "birthday" | "corporate" | "private" | "babyShower" | "other";

const EVENT_TYPES: {
  key: EventKey;
  icon: LucideIcon;
  image: PictureSource;
  position?: string;
  subs: string[];
}[] = [
  {
    key: "wedding",
    icon: Gem,
    image: weddingImg,
    subs: ["Event Venues", "Photography", "Florists", "Catering", "DJs", "Beauty"],
  },
  {
    key: "birthday",
    icon: Cake,
    image: birthdayImg,
    subs: ["Event Venues", "Desserts & Cakes", "DJs", "Photo Booths", "Catering", "Decor Rentals"],
  },
  {
    key: "corporate",
    icon: Briefcase,
    image: corporateImg,
    subs: [
      "Corporate / Conference Spaces",
      "Catering",
      "Lighting & AV Equipment",
      "Staffing",
      "Photography",
      "Speakers / Hosts",
    ],
  },
  {
    key: "private",
    icon: Wine,
    image: privateImg,
    subs: ["Private Dining Spaces", "Catering", "Bartending / Mobile Bars", "Live Music", "Florists", "Photography"],
  },
  {
    key: "babyShower",
    icon: Baby,
    image: babyShowerImg,
    position: "object-[50%_25%]",
    subs: ["Desserts & Cakes", "Decor Rentals", "Florists", "Event Venues", "Catering", "Photography"],
  },
  {
    key: "other",
    icon: Ellipsis,
    image: otherImg,
    subs: ["Private Dining Spaces", "Catering", "Bartending / Mobile Bars", "Live Music", "Decor Rentals", "Tastings"],
  },
];

const vendorsLink = (subs: string[]) => `/vendors?category=${encodeURIComponent(subs.join(","))}`;

export function PlanningPickerSection({ onTrack }: { onTrack: TrackHomeEvent }) {
  const { t } = useTranslation("homeSections");
  const categoryNames = useCategoryNames();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const type = EVENT_TYPES[active];
  const copy = (field: string) => t(`planning.types.${type.key}.${field}`);

  function choose(index: number, focus = false) {
    const next = (index + EVENT_TYPES.length) % EVENT_TYPES.length;
    setActive(next);
    onTrack("select", EVENT_TYPES[next].key);
    if (focus) tabs.current[next]?.focus();
  }

  // Tabs pattern: arrows move between event types, Home/End jump.
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: EVENT_TYPES.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    choose(moves[e.key], true);
  }

  return (
    <HomeSectionShell
      labelledBy="home-planning-title"
      intro={
        <HomeSectionIntro
          id="home-planning-title"
          eyebrow={t("planning.eyebrow")}
          title={t("planning.title")}
          body={t("planning.body")}
          cta={t("planning.cta")}
          to="/signup/host"
          onCta={() => onTrack("click", "cta")}
        />
      }
    >
      <div
        role="tablist"
        aria-label={t("planning.tablist")}
        className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 scroll-px-5 scrollbar-hide md:-mx-8 md:px-8 md:scroll-px-8 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {EVENT_TYPES.map((item, index) => {
          const selected = index === active;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              ref={(el) => {
                tabs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`home-plan-tab-${item.key}`}
              aria-selected={selected}
              aria-controls="home-plan-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(index)}
              onKeyDown={onTabKey}
              className={`flex min-w-[104px] shrink-0 snap-start flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center text-[13px] xl:px-2 font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold lg:min-w-0 ${
                selected
                  ? "border-gold bg-gold/10 text-[#f4f1ea]"
                  : "border-white/10 text-[#f4f1ea]/80 hover:border-white/30 hover:text-[#f4f1ea]"
              }`}
            >
              <Icon aria-hidden className="h-6 w-6 text-gold" strokeWidth={1.5} />
              <span className="whitespace-nowrap leading-tight xl:whitespace-normal">{t(`planning.types.${item.key}.tab`)}</span>
            </button>
          );
        })}
      </div>

      {/* The chosen event type. Phones: photo, then the words under it.
          From 640px the words sit on the photo's darkened left side. */}
      <div
        role="tabpanel"
        id="home-plan-panel"
        aria-labelledby={`home-plan-tab-${type.key}`}
        className="relative mt-4 overflow-hidden rounded-3xl border border-white/15 bg-white/[0.03]"
      >
        <div className="relative aspect-[4/3] sm:absolute sm:inset-0 sm:aspect-auto">
          <Picture
            key={type.key}
            source={type.image}
            alt=""
            sizes="(min-width: 1280px) 62vw, 100vw"
            className={`absolute inset-0 h-full w-full object-cover animate-in fade-in-0 duration-500 ${type.position ?? "object-center"}`}
          />
          <span
            aria-hidden
            className="absolute inset-0 hidden sm:block"
            style={{
              background:
                "linear-gradient(90deg, rgba(10,11,14,0.94) 0%, rgba(10,11,14,0.78) 36%, rgba(10,11,14,0.12) 70%, rgba(10,11,14,0) 100%)",
            }}
          />
        </div>

        <div className="relative flex flex-col p-6 sm:min-h-[460px] sm:max-w-[62%] sm:justify-center sm:p-10">
          <p className="m-0 font-label tracking-[0.3em] text-gold">{copy("eyebrow")}</p>
          <h3 className="m-0 mt-3 text-[26px] leading-tight sm:text-[32px]">{copy("headline")}</h3>
          <p className="m-0 mt-3 max-w-sm text-[15px] leading-relaxed text-[#f4f1ea]/85">{copy("body")}</p>
          <ul aria-label={t("planning.vendorsFor")} className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0">
            {type.subs.map((sub) => (
              <li key={sub}>
                <Link
                  to={vendorsLink([sub])}
                  onClick={() => onTrack("click", `category:${sub}`)}
                  className="inline-flex h-8 items-center rounded-full border border-white/25 bg-[#14161a]/70 px-3 text-[12.5px] font-bold text-[#f4f1ea] transition-colors hover:border-gold hover:text-gold"
                >
                  {categoryNames.sub(sub)}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to={vendorsLink(type.subs)}
            onClick={() => onTrack("click", `explore:${type.key}`)}
            className="mt-6 inline-flex w-fit items-center gap-1.5 text-[15px] font-bold text-gold underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            {copy("explore")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>

        <div className="absolute right-4 top-4 flex gap-2 sm:bottom-6 sm:right-6 sm:top-auto">
          <button
            type="button"
            onClick={() => choose(active - 1)}
            aria-label={t("planning.previous")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-[#14161a]/80 text-[#f4f1ea] transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => choose(active + 1)}
            aria-label={t("planning.next")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-[#14161a]/80 text-[#f4f1ea] transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>
    </HomeSectionShell>
  );
}
