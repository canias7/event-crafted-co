// Split layout for every sign-in and sign-up page (owner's call, Oct 2026),
// in the home page's format: the same top menu (PublicNav), and on the
// left the home page's venue video (its first frame for reduced motion /
// Data Saver) under the same scrims with a short welcome; on the right the
// plain ink panel with the turning rings (AuthBackdrop) and the page's own
// content. On phones the video becomes a short banner above the content.
import { ReactNode, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";
import heroVideo from "@/assets/hero-video/hero-day.mp4";
import heroPoster from "@/assets/hero-video/hero-day-poster.webp";

function videoWanted(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !connection?.saveData;
}

export function AuthSplitLayout({
  side,
  children,
}: {
  /** Which welcome the photo side shows. */
  side: "signin" | "signup";
  children: ReactNode;
}) {
  const { t } = useTranslation("auth");
  const [playVideo] = useState(videoWanted);

  return (
    <div className="min-h-screen flex flex-col text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PublicNav tone="dark" />

      <div className="flex-1 grid lg:grid-cols-2">
        {/* Photo side */}
        <section className="relative overflow-hidden min-h-[240px] lg:min-h-0 border-b border-white/15 lg:border-b-0 lg:border-r">
          {playVideo ? (
            <video
              className="absolute inset-0 h-full w-full object-cover scale-[1.04]"
              src={heroVideo}
              poster={heroPoster}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden
            />
          ) : (
            <img src={heroPoster} alt="" className="absolute inset-0 h-full w-full object-cover scale-[1.04]" />
          )}
          {/* Same scrims as the home hero: readable text, darker edges. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,11,14,0.55) 0%, rgba(10,11,14,0.3) 40%, rgba(10,11,14,0.55) 75%, rgba(10,11,14,0.85) 100%)",
            }}
          />
          {/* Extra shade on the text side so the small gold line reads. */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(90deg, rgba(10,11,14,0.55) 0%, rgba(10,11,14,0.15) 70%, rgba(10,11,14,0) 100%)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 90% 60% at 50% 42%, rgba(0,0,0,0) 40%, rgba(8,9,12,0.45) 100%)",
            }}
          />
          <div className="relative z-10 h-full flex flex-col justify-end lg:justify-center px-5 py-8 md:px-8 lg:px-14 xl:px-20">
            <p className="font-label text-gold m-0 mb-3 lg:mb-4 max-w-xs leading-relaxed">
              {t(`split.${side}.eyebrow`)}
            </p>
            <h1 className="m-0 text-[38px] leading-[1.05] lg:text-[64px] xl:text-[72px]" style={{ letterSpacing: "-1px" }}>
              <Trans t={t} i18nKey={`split.${side}.title`} components={{ gold: <span className="text-gold" /> }} />
            </h1>
            <p className="m-0 mt-3 lg:mt-5 max-w-md text-[15px] lg:text-[17px] leading-relaxed text-[#f4f1ea]/85">
              {t(`split.${side}.body`)}
            </p>
          </div>
        </section>

        {/* Content side */}
        <section className="relative overflow-hidden">
          <AuthBackdrop />
          <div className="relative z-[2] h-full flex flex-col justify-center px-5 py-10 md:px-8 lg:px-12 xl:px-16">
            <div className="w-full max-w-[560px] mx-auto">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Option card used by the sign-in and sign-up choosers. */
export function AuthChoiceCard({
  to,
  icon,
  title,
  subtitle,
  LinkComponent,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  LinkComponent: React.ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  return (
    <LinkComponent
      to={to}
      className="group flex items-center gap-4 md:gap-5 rounded-2xl border border-white/15 bg-white/[0.03] p-4 md:p-6 transition-colors hover:border-white/40"
    >
      <span className="flex h-12 w-12 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-full border border-gold/50 text-gold">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-editorial text-[19px] md:text-[22px] leading-tight">{title}</span>
        <span className="mt-1 block text-[13px] md:text-sm leading-relaxed text-[#f4f1ea]/80">{subtitle}</span>
      </span>
      <span className="flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-full border border-gold/60 text-gold transition-transform group-hover:translate-x-0.5">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </LinkComponent>
  );
}

/** The right-hand panel of /login and /signup: pick Host or Vendor. */
export function AuthRoleChooser({
  side,
  hostTo,
  vendorTo,
  otherTo,
  hostIcon,
  vendorIcon,
  LinkComponent,
}: {
  side: "signin" | "signup";
  hostTo: string;
  vendorTo: string;
  otherTo: string;
  hostIcon: ReactNode;
  vendorIcon: ReactNode;
  LinkComponent: React.ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  const { t } = useTranslation("auth");
  const k = (key: string) => t(`split.${side}.${key}`);
  return (
    <div>
      <p className="font-label text-gold m-0 mb-3">{k("label")}</p>
      <h2 className="m-0 text-[32px] md:text-[44px] leading-[1.1]" style={{ letterSpacing: "-0.8px" }}>
        {k("heading")}
      </h2>
      <p className="m-0 mt-3 text-[15px] md:text-base text-[#f4f1ea]/80">{k("sub")}</p>
      <div className="mt-8 flex flex-col gap-3">
        <AuthChoiceCard to={hostTo} icon={hostIcon} title={k("host_title")} subtitle={k("host_subtitle")} LinkComponent={LinkComponent} />
        <AuthChoiceCard to={vendorTo} icon={vendorIcon} title={k("vendor_title")} subtitle={k("vendor_subtitle")} LinkComponent={LinkComponent} />
      </div>
      <div className="mt-8 flex items-center gap-4 text-[13px] text-[#f4f1ea]/80">
        <span className="h-px flex-1 bg-white/15" />
        <span>{k("other_q")}</span>
        <span className="h-px flex-1 bg-white/15" />
      </div>
      <div className="mt-4 text-center">
        <LinkComponent to={otherTo} className="inline-flex items-center gap-2 font-bold text-gold underline-offset-4 hover:underline">
          {k("other_link")}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </LinkComponent>
      </div>
    </div>
  );
}
