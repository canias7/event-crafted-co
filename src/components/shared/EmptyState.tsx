import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Button } from "@/components/ui/button";

// Reusable empty-state surface for "fresh user / no data yet" pages.
// Pattern: subtle iconography, one-line headline, supportive paragraph,
// 1-2 primary actions. Avoids the bleak "Loading…" → "no items" hop
// that makes a fresh dashboard feel abandoned.

interface CTA {
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: "primary" | "outline";
}

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryCta?: CTA;
  secondaryCta?: CTA;
  /** Optional extra content below CTAs (e.g. tip card, video link). */
  children?: ReactNode;
  /** Extra container classes — default tightens for cards. */
  className?: string;
  /** When true, renders a tighter compact variant for in-card use. */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryCta,
  secondaryCta,
  children,
  className = "",
  compact = false,
}: Props) {
  const padding = compact ? "py-8 px-4" : "py-16 px-6";
  return (
    <div
      className={`text-center max-w-md mx-auto ${padding} ${className}`}
      role="status"
    >
      <div
        className={`mx-auto rounded-full bg-secondary/60 flex items-center justify-center mb-4 ${
          compact ? "w-10 h-10" : "w-14 h-14"
        }`}
      >
        <Icon
          className={`text-muted-foreground ${
            compact ? "w-4 h-4" : "w-5 h-5"
          }`}
        />
      </div>
      <h2
        className={`font-display leading-tight mb-2 ${
          compact ? "text-base" : "text-xl"
        }`}
      >
        {title}
      </h2>
      <p
        className={`text-muted-foreground leading-relaxed mb-${
          primaryCta || secondaryCta ? "6" : "0"
        } ${compact ? "text-xs" : "text-sm"}`}
      >
        {description}
      </p>
      {(primaryCta || secondaryCta) && (
        <div className="flex items-center gap-2 justify-center flex-wrap">
          {primaryCta && <CTAButton cta={primaryCta} variant="primary" />}
          {secondaryCta && <CTAButton cta={secondaryCta} variant="outline" />}
        </div>
      )}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

function CTAButton({
  cta,
  variant,
}: {
  cta: CTA;
  variant: "primary" | "outline";
}) {
  const className =
    variant === "primary"
      ? "rounded-full bg-foreground text-background hover:bg-foreground/90"
      : "rounded-full";

  if (cta.to) {
    return (
      <Link to={cta.to}>
        <Button variant={variant === "outline" ? "outline" : undefined} className={className}>
          {cta.label}
        </Button>
      </Link>
    );
  }
  return (
    <Button
      type="button"
      variant={variant === "outline" ? "outline" : undefined}
      className={className}
      onClick={cta.onClick}
    >
      {cta.label}
    </Button>
  );
}
