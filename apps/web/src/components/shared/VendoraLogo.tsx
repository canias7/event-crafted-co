import { cn } from "@/lib/utils";

// The Vendora "V" mark — stylized V with a teardrop/leaf curl on
// the top of the left arm. Approximates the brand mark from the
// reference image. Inlined SVG so callers can recolor via the
// `color` prop (defaults to currentColor so it inherits from
// parent text color when not overridden).
//
// Geometry: three filled subpaths that visually merge into one V:
//   1. Teardrop at top-left (the ornamental curl)
//   2. Left arm — descending thick stroke from teardrop to bottom point
//   3. Right arm — ascending thick stroke from bottom point to top-right
export function VendoraMark({
  size = 28,
  color = "currentColor",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 120"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* Teardrop curl on top of left arm */}
      <path
        d="M 24 6 C 12 8, 6 22, 14 32 C 20 40, 30 40, 34 32 C 38 24, 36 14, 30 8 C 28 7, 26 6, 24 6 Z"
        fill={color}
      />
      {/* Left arm — descends from teardrop to bottom point */}
      <path d="M 20 32 L 48 108 L 54 108 L 28 32 Z" fill={color} />
      {/* Right arm — rises from bottom point to top-right */}
      <path d="M 48 108 L 54 108 L 86 8 L 72 8 Z" fill={color} />
    </svg>
  );
}

// The Vendora wordmark — the brand name set in the editorial serif.
// Used in every top-left logo position (public nav, dashboard
// sidebar, landing page header, auth shell).
export function VendoraLogo({
  size = "md",
  color = "#000",
  className,
}: {
  size?: "sm" | "md" | "lg";
  color?: string;
  className?: string;
}) {
  const wordmark = {
    sm: "text-[18px]",
    md: "text-[22px]",
    lg: "text-[28px]",
  }[size];

  return (
    <span
      className={cn("font-editorial italic", wordmark, className)}
      style={{ color }}
    >
      Vendora
    </span>
  );
}
