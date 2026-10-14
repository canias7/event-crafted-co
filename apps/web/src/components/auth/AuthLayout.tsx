// Layout for every sign-in and sign-up page (owner's call, Oct 2026): the
// site's top menu (PublicNav); from 1024px a dimmed venue photo fills the
// left half with the "Why Vendora" points on it, and the page's content
// sits in a narrow column on the right; on phones there's no photo and the
// points follow the content. The photo is the same size and crop on every
// page (window height, pinned while the form scrolls). The photo is the
// owner's candlelit reception picture. The theme switch is in the top menu; a bottom
// bar holds the language switcher, since these pages have no footer. Colours follow the
// site theme (light by default); the photo side looks the same in both.
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import authPhoto from "@/assets/auth/signin-photo.webp";

function Perks({ onPhoto = false }: { onPhoto?: boolean }) {
  const { t } = useTranslation("auth");
  const items = t("split.perks.items", { returnObjects: true }) as { title: string; body: string }[];
  return (
    <aside
      className={
        onPhoto
          ? "max-w-md text-[#f4f1ea]"
          : "rounded-2xl border border-border bg-card p-5 md:p-8"
      }
    >
      <p className={`font-label m-0 ${onPhoto ? "text-gold" : "text-accent"}`}>{t("split.perks.title")}</p>
      <ul className="m-0 mt-5 p-0 list-none flex flex-col gap-5">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-gold" aria-hidden />
            <span>
              <span className="block font-bold text-[15px]">{it.title}</span>
              <span className={`mt-1 block text-[14px] leading-relaxed ${onPhoto ? "text-[#f4f1ea]/85" : "text-muted-foreground"}`}>{it.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

type Side = "signin" | "signup";
type LinkLike = React.ComponentType<{ to: string; className?: string; children: ReactNode }>;

export function AuthLayout({ children }: { side?: Side; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <PublicNav tone="dark" />
      <main className="flex-1 grid lg:grid-cols-2 lg:items-start">
        {/* Photo side (from 1024px): the venue photo, dimmed so the
            points on it read, the same in light and dark. It's always
            the height of the window under the menu and stays put while
            a long form scrolls, so the photo, its crop and the points
            sit in the same place on every sign-in page. */}
        <section className="relative hidden overflow-hidden lg:sticky lg:top-24 lg:block lg:h-[calc(100svh-6rem)]">
          <img
            src={authPhoto}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[22%_50%]"
          />
          <div className="absolute inset-0 bg-[#0a0b0e]/50" />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(10,11,14,0) 40%, rgba(10,11,14,0.65) 100%)" }}
          />
          <div className="relative flex h-full items-end px-12 py-14 xl:px-16">
            <Perks onPhoto />
          </div>
        </section>

        <section className="flex justify-center px-5 py-12 md:px-8 md:py-20">
          <div className="w-full max-w-[440px]">
            {children}
            <div className="mt-12 lg:hidden">
              <Perks />
            </div>
          </div>
        </section>
      </main>
      <div className="container">
        <div className="flex items-center justify-end gap-4 border-t border-border py-5">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}

function Arrow({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Option row used by the sign-in and sign-up choosers. */
export function AuthChoiceCard({
  to,
  title,
  subtitle,
  LinkComponent,
}: {
  to: string;
  title: string;
  subtitle: string;
  LinkComponent: LinkLike;
}) {
  return (
    <LinkComponent
      to={to}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 md:px-6 md:py-5 transition-colors hover:border-foreground/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[17px] leading-tight">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">{subtitle}</span>
      </span>
      <span className="shrink-0 text-accent transition-transform group-hover:translate-x-0.5">
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
  LinkComponent,
}: {
  side: Side;
  hostTo: string;
  vendorTo: string;
  otherTo: string;
  LinkComponent: LinkLike;
}) {
  const { t } = useTranslation("auth");
  const k = (key: string) => t(`split.${side}.${key}`);
  return (
    <div>
      <h1 className="m-0 text-[32px] md:text-[40px] leading-[1.1]" style={{ letterSpacing: "-0.5px" }}>
        {k("heading")}
      </h1>
      <p className="m-0 mt-3 text-[15px] text-muted-foreground">{k("sub")}</p>
      <div className="mt-8 flex flex-col gap-3">
        <AuthChoiceCard to={hostTo} title={k("host_title")} subtitle={k("host_subtitle")} LinkComponent={LinkComponent} />
        <AuthChoiceCard to={vendorTo} title={k("vendor_title")} subtitle={k("vendor_subtitle")} LinkComponent={LinkComponent} />
      </div>
      <p className="m-0 mt-8 text-[14px] text-muted-foreground">
        {k("other_q")}{" "}
        <LinkComponent to={otherTo} className="font-bold text-accent underline-offset-4 hover:underline">
          {k("other_link")}
        </LinkComponent>
      </p>
    </div>
  );
}
