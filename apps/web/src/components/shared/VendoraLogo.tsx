import { cn } from "@/lib/utils";
// The REAL brand mark — the gold calligraphic V from the brand sheet
// (thin flick top-left, broad sweep to a sharp point, thin upstroke
// curling into a teardrop loop). Extracted from the official asset;
// three color variants so it sits on any surface.
import vGold from "@/assets/brand/v-gold.png";
import vInk from "@/assets/brand/v-ink.png";
import vCream from "@/assets/brand/v-cream.png";

type MarkVariant = "gold" | "ink" | "cream";

const MARK_SRC: Record<MarkVariant, string> = {
  gold: vGold,
  ink: vInk,
  cream: vCream,
};

// The V mark alone. Per the brand sheet it is gold by default; ink and
// cream variants exist for surfaces where gold doesn't read.
export function VendoraMark({
  size = 28,
  variant = "gold",
  color,
  className,
}: {
  size?: number;
  /** Preferred: pick the brand variant directly. */
  variant?: MarkVariant;
  /** Legacy prop — dark hexes map to ink, light hexes to cream. */
  color?: string;
  className?: string;
}) {
  let v = variant;
  if (color && color !== "currentColor") {
    const c = color.toLowerCase();
    if (c === "#fff" || c === "#ffffff" || c.startsWith("#f")) v = "cream";
    else if (c === "#c9a86a") v = "gold";
    else v = "ink";
  }
  return (
    <img
      src={MARK_SRC[v]}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

// Name colours that mean the logo sits on a dark surface.
const ON_DARK_NAME_COLORS = new Set(["#f4f1ea", "#fff", "#ffffff", "white"]);

// The horizontal lockup from the brand sheet: gold V · hairline
// divider · lowercase serif "vendora" (+ optional gold small-caps
// tagline). Every top-left logo shows the full lockup, tagline included,
// at size md (the public header, the sign-in pages); the portal sidebar
// uses sm to fit. It never wraps or shrinks, so it looks the same on
// every page.
export function VendoraLogo({
  size = "md",
  color = "#14161a",
  withTagline = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  /** Color of the "vendora" name — ink on light surfaces, cream on dark. */
  color?: string;
  withTagline?: boolean;
  className?: string;
}) {
  // Tagline sizes in px, half the name; set inline because .font-label
  // carries its own size and is emitted after Tailwind's text-[…] classes.
  const dims = {
    sm: { mark: 20, name: "text-[19px]", tag: 9.5, gap: "gap-1.5" },
    md: { mark: 26, name: "text-[24px]", tag: 12, gap: "gap-2" },
    lg: { mark: 36, name: "text-[32px]", tag: 16, gap: "gap-2.5" },
  }[size];

  const name =
    color === "currentColor" || !color ? undefined : color;
  // Gold text is champagne on dark surfaces and bronze on light ones.
  const onDark = ON_DARK_NAME_COLORS.has((color ?? "").toLowerCase());

  return (
    <span className={cn("inline-flex shrink-0 items-center", dims.gap, className)}>
      <VendoraMark size={dims.mark} variant="gold" />
      <span
        aria-hidden
        className="self-stretch w-px my-0.5"
        style={{ backgroundColor: "rgba(201,168,106,0.55)" }}
      />
      <span className="flex flex-col leading-none">
        <span
          // Italic regular, exactly as the wordmark has always rendered. Plain
          // utilities only: the custom font-editorial class would win over them.
          className={cn("font-serif italic font-normal lowercase", dims.name)}
          style={{ color: name, letterSpacing: "0.01em", lineHeight: 1 }}
        >
          vendora
        </span>
        {withTagline ? (
          <span
            className="font-label mt-1 whitespace-nowrap"
            style={{
              color: onDark ? "#c9a86a" : "#8a6f3e",
              fontSize: dims.tag,
              letterSpacing: "0.32em",
            }}
          >
            Events, simplified
          </span>
        ) : null}
      </span>
    </span>
  );
}
