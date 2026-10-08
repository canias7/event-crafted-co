import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// The frame of the section right under the homepage hero: ink page, the
// intro on the left and the visual on the right from 1280px; stacked below
// that, where the visual gets the full width.
export function HomeSectionShell({
  labelledBy,
  intro,
  children,
}: {
  labelledBy: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="border-t border-white/10 py-16 text-[#f4f1ea] md:py-24"
    >
      <div className="container mx-auto grid items-center gap-10 px-5 md:px-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.15fr)] xl:gap-14">
        {intro}
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

// The intro column: gold eyebrow, title, a short gold rule, one line of
// copy and the call to action.
export function HomeSectionIntro({
  id,
  eyebrow,
  title,
  body,
  cta,
  to,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  to: string;
}) {
  return (
    <div className="max-w-md">
      <p className="m-0 font-label tracking-[0.3em] text-gold">{eyebrow}</p>
      {/* A "\n" in the title marks where its line breaks. */}
      <h2 id={id} className="m-0 mt-4 whitespace-pre-line text-[34px] leading-[1.1] sm:text-[40px] lg:text-[46px]">
        {title}
      </h2>
      <span aria-hidden className="mt-6 block h-px w-12 bg-gold/60" />
      <p className="m-0 mt-6 text-[16px] leading-relaxed text-[#f4f1ea]/80">{body}</p>
      <Button asChild size="lg" className="mt-8">
        <Link to={to}>
          {cta}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
