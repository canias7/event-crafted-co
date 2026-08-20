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

// The horizontal lockup from the brand sheet: gold V · hairline
// divider · lowercase serif "vendora" (+ optional gold small-caps
// tagline). Used in every top-left logo position (public nav,
// dashboard sidebar, landing header, auth shell).
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
  const dims = {
    sm: { mark: 20, name: "text-[19px]", tag: "text-[7px]", gap: "gap-1.5" },
    md: { mark: 26, name: "text-[24px]", tag: "text-[8.5px]", gap: "gap-2" },
    lg: { mark: 36, name: "text-[32px]", tag: "text-[11px]", gap: "gap-2.5" },
  }[size];

  const name =
    color === "currentColor" || !color ? undefined : color;

  return (
    <span className={cn("inline-flex items-center", dims.gap, className)}>
      <VendoraMark size={dims.mark} variant="gold" />
      <span
        aria-hidden
        className="self-stretch w-px my-0.5"
        style={{ backgroundColor: "rgba(201,168,106,0.55)" }}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn("font-editorial not-italic lowercase", dims.name)}
          style={{ color: name, letterSpacing: "0.01em", lineHeight: 1 }}
        >
          vendora
        </span>
        {withTagline ? (
          <span
            className={cn("font-label mt-1", dims.tag)}
            style={{ color: "#c9a86a", letterSpacing: "0.32em" }}
          >
            Events, simplified
          </span>
        ) : null}
      </span>
    </span>
  );
}
