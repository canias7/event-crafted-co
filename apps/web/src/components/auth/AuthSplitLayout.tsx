// Layout for every sign-in and sign-up page. PREVIEW: three looks the
// owner is choosing between, picked with ?look=a|b|c (default a). Once
// one is chosen the other two and the switch go.
//
//  a  "Invitation": one framed card on the ink page; a photo panel with
//     the welcome on the left, the page's content on the right.
//  b  "Menu card": no photo; centred type, a gold ornament and the
//     choices as numbered rows between hairlines.
//  c  "Photo wall": content on the left; on the right two columns of
//     the owner's photos drifting slowly upward.
//
// All three keep the site's language: plain ink page, turning rings
// (AuthBackdrop), Baskerville, champagne accents, flat hairline cards.
import { ReactNode, createContext, useContext } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import photoTable from "@/assets/photos/04.webp?as=picture";
import photoPavilion from "@/assets/photos/54.webp?as=picture";
import photoGarden from "@/assets/photos/11.webp?as=picture";
import photoDesk from "@/assets/photos/22.webp?as=picture";
import photoDesserts from "@/assets/photos/17.webp?as=picture";
import photoBirthday from "@/assets/photos/26.webp?as=picture";

export type AuthLook = "a" | "b" | "c";
const LookContext = createContext<AuthLook>("a");

function readLook(): AuthLook {
  if (typeof window === "undefined") return "a";
  const v = new URLSearchParams(window.location.search).get("look");
  return v === "b" || v === "c" ? v : "a";
}

type Side = "signin" | "signup";

function Welcome({ side, size = "lg" }: { side: Side; size?: "lg" | "md" }) {
  const { t } = useTranslation("auth");
  return (
    <>
      <p className="font-label text-gold m-0 mb-3">{t(`split.${side}.eyebrow`)}</p>
      <h1
        className={`m-0 leading-[1.05] ${size === "lg" ? "text-[36px] md:text-[52px]" : "text-[30px] md:text-[40px]"}`}
        style={{ letterSpacing: "-0.8px" }}
      >
        <Trans t={t} i18nKey={`split.${side}.title`} components={{ gold: <span className="text-gold" /> }} />
      </h1>
      <p className="m-0 mt-3 max-w-md text-[15px] leading-relaxed text-[#f4f1ea]/85">{t(`split.${side}.body`)}</p>
    </>
  );
}

/** Thin gold rule with a small diamond in the middle. */
function Ornament() {
  return (
    <div className="flex items-center justify-center gap-3 text-gold" aria-hidden>
      <span className="h-px w-12 bg-gold/60" />
      <span className="h-1.5 w-1.5 rotate-45 bg-gold" />
      <span className="h-px w-12 bg-gold/60" />
    </div>
  );
}

const WALL_LEFT = [photoPavilion, photoTable, photoDesserts];
const WALL_RIGHT = [photoGarden, photoDesk, photoBirthday];

function PhotoColumn({ photos, reverse }: { photos: PictureSource[]; reverse?: boolean }) {
  // Two copies stacked so the upward drift loops without a seam.
  const all = [...photos, ...photos];
  return (
    <div className="relative h-full overflow-hidden">
      <div className={`flex flex-col gap-4 auth-wall-drift ${reverse ? "auth-wall-drift-slow" : ""}`}>
        {all.map((src, i) => (
          <Picture key={i} source={src} alt="" sizes="25vw" className="block w-full aspect-[4/5] object-cover rounded-2xl border border-white/15" />
        ))}
      </div>
    </div>
  );
}

export function AuthSplitLayout({ side, children }: { side: Side; children: ReactNode }) {
  const look = readLook();
  return (
    <LookContext.Provider value={look}>
      <div className="min-h-screen flex flex-col text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
        <PublicNav tone="dark" />
        <div className="relative flex-1 overflow-hidden">
          <AuthBackdrop />

          {look === "a" && (
            <div className="relative z-[2] container py-8 md:py-14 flex justify-center">
              <div className="w-full max-w-[1080px] grid lg:grid-cols-[1fr_1.1fr] rounded-3xl border border-white/15 bg-[#14161a] overflow-hidden">
                <div className="relative min-h-[260px] lg:min-h-[620px] p-3 md:p-4">
                  <div className="relative h-full min-h-[236px] overflow-hidden rounded-2xl">
                    <Picture source={photoTable} alt="" sizes="(min-width: 1024px) 40vw, 100vw" loading="eager" className="absolute inset-0 h-full w-full object-cover" />
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(180deg, rgba(10,11,14,0.1) 30%, rgba(10,11,14,0.85) 100%)" }}
                    />
                    {/* Inset gold frame, like a printed invitation */}
                    <div className="absolute inset-3 rounded-xl border border-gold/50 pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 p-7 md:p-10">
                      <Welcome side={side} size="md" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center px-5 py-8 md:px-12 md:py-12">{children}</div>
              </div>
            </div>
          )}

          {look === "b" && (
            <div className="relative z-[2] container py-12 md:py-20 flex justify-center">
              <div className="w-full max-w-[600px]">{children}</div>
            </div>
          )}

          {look === "c" && (
            <div className="relative z-[2] container grid lg:grid-cols-[1fr_1fr] gap-10 xl:gap-20 lg:h-[calc(100vh-97px)] lg:min-h-[680px] lg:grid-rows-[100%]">
              <div className="flex flex-col justify-center py-10 lg:py-12">
                <div className="lg:hidden mb-8 grid grid-cols-3 gap-2">
                  {[photoPavilion, photoTable, photoGarden].map((src, i) => (
                    <Picture key={i} source={src} alt="" sizes="33vw" className="block w-full aspect-[4/5] object-cover rounded-xl border border-white/15" />
                  ))}
                </div>
                <div className="w-full max-w-[520px]">{children}</div>
              </div>
              <div className="hidden lg:grid grid-cols-2 gap-4 h-full min-h-0 overflow-hidden auth-wall-fade">
                <PhotoColumn photos={WALL_LEFT} />
                <div className="pt-24 h-full min-h-0">
                  <PhotoColumn photos={WALL_RIGHT} reverse />
                </div>
              </div>
            </div>
          )}
        </div>
        <style>{`
          @keyframes authWallDrift { from { transform: translateY(0); } to { transform: translateY(calc(-50% - 8px)); } }
          .auth-wall-drift { animation: authWallDrift 60s linear infinite; }
          .auth-wall-drift-slow { animation-duration: 80s; }
          .auth-wall-fade { -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%); mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%); }
          @media (prefers-reduced-motion: reduce) { .auth-wall-drift { animation: none; } }
        `}</style>
      </div>
    </LookContext.Provider>
  );
}

/** Which preview look the current page uses. */
export function useAuthLook(): AuthLook {
  return useContext(LookContext);
}

type LinkLike = React.ComponentType<{ to: string; className?: string; children: ReactNode }>;

function Arrow({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Option card used by the sign-in and sign-up choosers (looks a and c). */
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
  LinkComponent: LinkLike;
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
        <Arrow />
      </span>
    </LinkComponent>
  );
}

/** The content of /login and /signup: pick Host or Vendor. */
export function AuthRoleChooser({
  side,
  hostTo,
  vendorTo,
  otherTo,
  hostIcon,
  vendorIcon,
  LinkComponent,
}: {
  side: Side;
  hostTo: string;
  vendorTo: string;
  otherTo: string;
  hostIcon: ReactNode;
  vendorIcon: ReactNode;
  LinkComponent: LinkLike;
}) {
  const { t } = useTranslation("auth");
  const look = useAuthLook();
  const k = (key: string) => t(`split.${side}.${key}`);

  const other = (
    <div className="mt-8 text-center text-[14px] text-[#f4f1ea]/80">
      {k("other_q")}{" "}
      <LinkComponent to={otherTo} className="inline-flex items-center gap-1.5 font-bold text-gold underline-offset-4 hover:underline">
        {k("other_link")}
        <Arrow />
      </LinkComponent>
    </div>
  );

  if (look === "b") {
    const rows = [
      { to: hostTo, title: k("host_title"), subtitle: k("host_subtitle") },
      { to: vendorTo, title: k("vendor_title"), subtitle: k("vendor_subtitle") },
    ];
    return (
      <div className="text-center">
        <Ornament />
        <p className="font-label text-gold m-0 mt-6 mb-4">{t(`split.${side}.eyebrow`)}</p>
        <h1 className="m-0 text-[40px] md:text-[64px] leading-[1.02]" style={{ letterSpacing: "-1px" }}>
          <Trans t={t} i18nKey={`split.${side}.title`} components={{ gold: <span className="text-gold" /> }} />
        </h1>
        <p className="m-0 mx-auto mt-4 max-w-md text-[15px] md:text-base leading-relaxed text-[#f4f1ea]/85">{k("sub")}</p>
        <div className="mt-10 border-t border-white/15 text-left">
          {rows.map((r, i) => (
            <LinkComponent
              key={r.to}
              to={r.to}
              className="group flex items-center gap-5 md:gap-8 border-b border-white/15 py-6 md:py-7 px-1 transition-colors"
            >
              <span className="font-editorial text-gold text-[22px] md:text-[28px] w-8 md:w-10 shrink-0">0{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-editorial text-[22px] md:text-[28px] leading-tight group-hover:text-gold transition-colors">{r.title}</span>
                <span className="mt-1 block text-[13px] md:text-sm text-[#f4f1ea]/80">{r.subtitle}</span>
              </span>
              <span className="shrink-0 text-gold transition-transform group-hover:translate-x-1">
                <Arrow className="h-5 w-5" />
              </span>
            </LinkComponent>
          ))}
        </div>
        {other}
      </div>
    );
  }

  return (
    <div>
      {look === "c" ? (
        <Welcome side={side} />
      ) : (
        <>
          <p className="font-label text-gold m-0 mb-3">{k("label")}</p>
          <h2 className="m-0 text-[30px] md:text-[38px] leading-[1.1]" style={{ letterSpacing: "-0.8px" }}>
            {k("heading")}
          </h2>
          <p className="m-0 mt-3 text-[15px] text-[#f4f1ea]/80">{k("sub")}</p>
        </>
      )}
      <div className="mt-8 flex flex-col gap-3">
        <AuthChoiceCard to={hostTo} icon={hostIcon} title={k("host_title")} subtitle={k("host_subtitle")} LinkComponent={LinkComponent} />
        <AuthChoiceCard to={vendorTo} icon={vendorIcon} title={k("vendor_title")} subtitle={k("vendor_subtitle")} LinkComponent={LinkComponent} />
      </div>
      {other}
    </div>
  );
}
