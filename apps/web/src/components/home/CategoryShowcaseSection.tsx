import { Link } from "react-router-dom";
import { Camera, Flower2, Landmark, Music, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import { BROWSE_CATEGORIES } from "@/data/browseCategories";
import { HomeSectionIntro, HomeSectionShell, type TrackHomeEvent } from "./HomeSectionShell";
import venuesImg from "@/assets/photos/54.webp?as=picture";
import foodImg from "@/assets/photos/01.webp?as=picture";
import entertainmentImg from "@/assets/photos/31.webp?as=picture";
import decorImg from "@/assets/photos/04.webp?as=picture";
import mediaImg from "@/assets/photos/08.webp?as=picture";

// Homepage test, version A: the main vendor categories as tall photo
// tiles, each opening the vendors page filtered to it.
const TILES: {
  key: "venues" | "food" | "entertainment" | "decor" | "media";
  /** The vendors page's browse category it opens. */
  browse: string;
  image: PictureSource;
  icon: LucideIcon;
  /** Keeps the subject in frame in the tall crop. */
  position: string;
}[] = [
  { key: "venues", browse: "Venues", image: venuesImg, icon: Landmark, position: "object-[50%_50%]" },
  { key: "food", browse: "Catering", image: foodImg, icon: UtensilsCrossed, position: "object-[40%_50%]" },
  { key: "entertainment", browse: "Entertainment", image: entertainmentImg, icon: Music, position: "object-[35%_50%]" },
  { key: "decor", browse: "Decor & florals", image: decorImg, icon: Flower2, position: "object-[60%_50%]" },
  { key: "media", browse: "Photography", image: mediaImg, icon: Camera, position: "object-[50%_50%]" },
];

function vendorsLink(browse: string): string {
  const subs = BROWSE_CATEGORIES.find((c) => c.label === browse)?.subs ?? [];
  return subs.length ? `/vendors?category=${encodeURIComponent(subs.join(","))}` : "/vendors";
}

export function CategoryShowcaseSection({ onTrack }: { onTrack: TrackHomeEvent }) {
  const { t } = useTranslation("homeSections");
  return (
    <HomeSectionShell
      labelledBy="home-showcase-title"
      intro={
        <HomeSectionIntro
          id="home-showcase-title"
          eyebrow={t("showcase.eyebrow")}
          title={t("showcase.title")}
          body={t("showcase.body")}
          cta={t("showcase.cta")}
          to="/vendors"
          onCta={() => onTrack("click", "cta")}
        />
      }
    >
      {/* A swipeable row on phones and tablets, five across from 1024px. */}
      <ul className="-mx-5 m-0 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 scroll-px-5 scrollbar-hide md:-mx-8 md:px-8 md:scroll-px-8 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <li key={tile.key} className="w-[58vw] max-w-[240px] shrink-0 snap-start sm:w-[36vw] lg:w-auto lg:max-w-none">
              <Link
                to={vendorsLink(tile.browse)}
                onClick={() => onTrack("click", `tile:${tile.key}`)}
                className="group relative block aspect-[5/8] overflow-hidden rounded-2xl border border-white/15 outline-none transition-colors hover:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#14161a] lg:aspect-[9/16]"
              >
                <Picture
                  source={tile.image}
                  alt=""
                  sizes="(min-width: 1280px) 12vw, (min-width: 1024px) 19vw, (min-width: 640px) 36vw, 58vw"
                  className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] ${tile.position}`}
                />
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(10,11,14,0.05) 30%, rgba(10,11,14,0.55) 62%, rgba(10,11,14,0.92) 100%)",
                  }}
                />
                <span className="absolute inset-x-3 bottom-5 flex flex-col items-center text-center">
                  <Icon aria-hidden className="h-6 w-6 text-gold" strokeWidth={1.5} />
                  {/* Title and line are two lines tall either way, so the
                      icons line up across tiles. */}
                  <span className="mt-3 flex min-h-[2.6em] items-center font-label leading-tight text-[#f4f1ea]">
                    {t(`showcase.tiles.${tile.key}.title`)}
                  </span>
                  <span className="mt-1.5 min-h-[2.75em] text-[13px] leading-snug text-[#f4f1ea]/80">
                    {t(`showcase.tiles.${tile.key}.body`)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </HomeSectionShell>
  );
}
