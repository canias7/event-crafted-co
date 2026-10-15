import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Picture, type PictureSource } from "@/components/shared/Picture";

const INK = "#14161a";
const SECONDARY =
  "inline-flex h-11 items-center gap-1.5 text-[15px] font-bold text-[#f4f1ea] transition-colors hover:text-gold";

// Dark photo header for the How it works and For vendors pages, in the
// landing page's style (in the dark theme it fades into the ink page below;
// in the light theme it stays a dark photo band): the overlaid nav, an eyebrow, a headline with one
// gold word (pass it in `title`), a line of copy, a gold button and a
// quiet link. The headline and copy get the same readability halo and
// shadow as the landing hero.
export function PhotoHero({
  photo,
  position = "object-center",
  eyebrow,
  title,
  sub,
  primary,
  secondary,
}: {
  photo: PictureSource;
  /** Which part of the photo stays in frame, e.g. "object-[50%_25%]". */
  position?: string;
  eyebrow: string;
  title: ReactNode;
  sub: string;
  primary: { label: string; to: string };
  secondary: { label: string; to: string };
}) {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: INK }}>
      <div className="absolute inset-0">
        <Picture
          source={photo}
          alt=""
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          className={`h-full w-full object-cover ${position}`}
        />
      </div>
      {/* The scrim keeps the light text readable over the photo. Dark theme:
          it fades into the ink page. Light theme: the band stays dark to its
          edge, so the text never sits on a pale fade. */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,11,14,0.66) 0%, rgba(10,11,14,0.45) 45%, rgba(20,22,26,0.7) 78%, rgba(20,22,26,0.82) 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,11,14,0.66) 0%, rgba(10,11,14,0.45) 45%, rgba(20,22,26,0.7) 78%, rgb(20,22,26) 100%)",
        }}
      />

      <PublicNav tone="overlay" />

      <div className="container relative z-10 mx-auto px-5 pb-16 pt-6 text-center md:px-8 md:pb-24 md:pt-12">
        <p className="m-0 font-label text-gold">{eyebrow}</p>
        <h1
          className="hero-headline m-0 mx-auto mt-4 max-w-3xl text-[#f4f1ea]"
          style={{ fontSize: "clamp(36px, 5.6vw, 64px)", lineHeight: 1.06, letterSpacing: "-1px" }}
        >
          {title}
        </h1>
        <p
          className="hero-intro m-0 mx-auto mt-5 max-w-xl text-[16px] leading-relaxed md:text-lg"
          style={{ color: "rgba(244,241,234,0.85)" }}
        >
          {sub}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link
            to={primary.to}
            className="inline-flex h-[52px] items-center gap-2 rounded-full bg-gold px-7 text-[15px] font-bold text-ink transition-colors hover:bg-gold-hover"
          >
            {primary.label} <ArrowRight className="h-4 w-4" />
          </Link>
          {/* "#steps" jumps down the same page; anything else is a route. */}
          {secondary.to.startsWith("#") ? (
            <a href={secondary.to} className={SECONDARY}>
              {secondary.label} <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <Link to={secondary.to} className={SECONDARY}>
              {secondary.label} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

// Closing band (page colour, follows the theme) with one headline and one gold button, used at the
// end of the How it works and For vendors pages.
export function ClosingBand({
  title,
  sub,
  cta,
}: {
  title: ReactNode;
  sub?: string;
  cta: { label: string; to: string };
}) {
  return (
    <section className="bg-background px-5 py-16 text-center md:px-8 md:py-24">
      <h2 className="m-0 mx-auto max-w-2xl text-[30px] leading-tight text-foreground md:text-[42px]">
        {title}
      </h2>
      {sub && (
        <p className="m-0 mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
          {sub}
        </p>
      )}
      <Link
        to={cta.to}
        className="mt-8 inline-flex h-[52px] items-center gap-2 rounded-full bg-gold px-7 text-[15px] font-bold text-ink transition-colors hover:bg-gold-hover"
      >
        {cta.label} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
