// Layout for every sign-in and sign-up page (owner's call, Oct 2026):
// kept simple on purpose. The site's top menu (PublicNav), then one
// narrow centred column on the plain ink page: no photos, rings, glows
// or framed cards around the content.
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";

type Side = "signin" | "signup";
type LinkLike = React.ComponentType<{ to: string; className?: string; children: ReactNode }>;

export function AuthSplitLayout({ children }: { side?: Side; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PublicNav tone="dark" />
      <main className="flex-1 container flex justify-center py-12 md:py-20">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
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
      className="group flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.03] px-5 py-4 md:px-6 md:py-5 transition-colors hover:border-white/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[17px] leading-tight">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-[#f4f1ea]/80">{subtitle}</span>
      </span>
      <span className="shrink-0 text-gold transition-transform group-hover:translate-x-0.5">
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
      <p className="m-0 mt-3 text-[15px] text-[#f4f1ea]/80">{k("sub")}</p>
      <div className="mt-8 flex flex-col gap-3">
        <AuthChoiceCard to={hostTo} title={k("host_title")} subtitle={k("host_subtitle")} LinkComponent={LinkComponent} />
        <AuthChoiceCard to={vendorTo} title={k("vendor_title")} subtitle={k("vendor_subtitle")} LinkComponent={LinkComponent} />
      </div>
      <p className="m-0 mt-8 text-[14px] text-[#f4f1ea]/80">
        {k("other_q")}{" "}
        <LinkComponent to={otherTo} className="font-bold text-gold underline-offset-4 hover:underline">
          {k("other_link")}
        </LinkComponent>
      </p>
    </div>
  );
}
