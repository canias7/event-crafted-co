import { cn } from "@/lib/utils";

// The Vendora "V" mark — same path as public/bimi.svg, but inlined
// so we can recolor it via fill/stroke per surface. Black by default;
// callers pass a different color when on a dark background.
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
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d="M 142 132 C 158 124 178 124 196 130 C 206 134 213 142 218 152 L 256 322 L 294 152 C 299 142 306 134 316 130 C 334 124 354 124 370 132 C 372 134 372 138 370 142 L 288 384 C 282 398 270 408 256 408 C 242 408 230 398 224 384 L 142 142 C 140 138 140 134 142 132 Z"
        fill={color}
      />
      <circle
        cx="350"
        cy="158"
        r="14"
        fill="none"
        stroke={color}
        strokeWidth={6}
      />
    </svg>
  );
}

// Full lockup: V mark + "Vendora" italic wordmark + tagline.
// Used in every top-left logo position (public nav, dashboard
// sidebar, landing page header, auth shell). Sizing scales with
// the `size` prop so the same component fits both compact sidebars
// and the wider public surfaces.
export function VendoraLogo({
  size = "md",
  color = "#000",
  showTagline = true,
  className,
}: {
  size?: "sm" | "md" | "lg";
  color?: string;
  showTagline?: boolean;
  className?: string;
}) {
  const dims = {
    sm: { mark: 22, wordmark: "text-[18px]", tagline: "text-[8px] tracking-[0.18em]" },
    md: { mark: 28, wordmark: "text-[22px]", tagline: "text-[9px] tracking-[0.2em]" },
    lg: { mark: 36, wordmark: "text-[28px]", tagline: "text-[10px] tracking-[0.22em]" },
  }[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <VendoraMark size={dims.mark} color={color} />
      <span className="flex flex-col leading-none">
        <span
          className={cn("font-editorial italic", dims.wordmark)}
          style={{ color }}
        >
          Vendora
        </span>
        {showTagline ? (
          <span
            className={cn("uppercase font-medium mt-1", dims.tagline)}
            style={{ color, opacity: 0.85 }}
          >
            Events, simplified
          </span>
        ) : null}
      </span>
    </span>
  );
}
