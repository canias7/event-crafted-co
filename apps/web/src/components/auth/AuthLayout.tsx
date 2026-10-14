// Layout for every sign-in and sign-up page (owner's call, Oct 2026):
// kept simple on purpose. The site's top menu (PublicNav), the page's
// content in a narrow column on the plain page (no rings, glows or
// photos), a "Why Vendora" panel beside it (below it on phones), and a
// bottom bar with the theme switch and the language switcher, since these
// pages have no footer. Colours follow the site theme (light by default).
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

function Perks() {
  const { t } = useTranslation("auth");
  const items = t("split.perks.items", { returnObjects: true }) as { title: string; body: string }[];
  return (
    <aside className="rounded-2xl border border-border bg-card p-5 md:p-8">
      <p className="font-label text-accent m-0">{t("split.perks.title")}</p>
      <ul className="m-0 mt-5 p-0 list-none flex flex-col gap-5">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-gold" aria-hidden />
            <span>
              <span className="block font-bold text-[15px]">{it.title}</span>
              <span className="mt-1 block text-[14px] leading-relaxed text-muted-foreground">{it.body}</span>
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
      <main className="flex-1 container flex justify-center py-12 md:py-20">
        <div className="w-full max-w-[920px] grid gap-10 lg:grid-cols-[440px_1fr] lg:gap-16 items-start">
          <div>{children}</div>
          <div className="lg:mt-2">
            <Perks />
          </div>
        </div>
      </main>
      <div className="container">
        <div className="flex items-center justify-end gap-4 border-t border-border py-5">
          <ThemeToggle />
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
