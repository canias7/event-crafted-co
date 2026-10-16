// The decoration under an invitation's title (owner's call, Oct 2026).
// Drawn in the invitation's accent colour (currentColor), so it follows
// whatever colours the host picks.

import type { OrnamentKey } from "@/lib/inviteDesign";

export function InviteOrnament({ kind, className = "" }: { kind: OrnamentKey; className?: string }) {
  if (kind === "none") return null;
  const common = { "aria-hidden": true, className: `mx-auto block ${className}`, fill: "none", stroke: "currentColor" } as const;
  switch (kind) {
    case "floral":
      return (
        <svg viewBox="0 0 160 28" width="160" height="28" {...common} strokeWidth="1.2" strokeLinecap="round">
          <path d="M8 14h46M106 14h46" opacity="0.7" />
          <path d="M80 6c-4 4-4 12 0 16 4-4 4-12 0-16Z" fill="currentColor" stroke="none" />
          <path d="M80 14c-6-6-15-6-19-2 5 4 13 6 19 2ZM80 14c6-6 15-6 19-2-5 4-13 6-19 2Z" fill="currentColor" stroke="none" opacity="0.75" />
          <path d="M54 14c3-3 6-3 8 0M98 14c2-3 5-3 8 0" />
          <circle cx="62" cy="9" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="98" cy="9" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "hearts":
      return (
        <svg viewBox="0 0 160 24" width="160" height="24" {...common} strokeWidth="1.2">
          <path d="M10 12h48M102 12h48" opacity="0.7" />
          <path d="M80 20s-9-5.5-9-11a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 5.5-9 11-9 11Z" fill="currentColor" stroke="none" />
          <path d="M66 13s-4-2.5-4-5a2 2 0 0 1 4-.5 2 2 0 0 1 4 .5c0 2.5-4 5-4 5ZM94 13s-4-2.5-4-5a2 2 0 0 1 4-.5 2 2 0 0 1 4 .5c0 2.5-4 5-4 5Z" fill="currentColor" stroke="none" opacity="0.6" />
        </svg>
      );
    case "stars":
      return (
        <svg viewBox="0 0 160 24" width="160" height="24" {...common} strokeWidth="1.2">
          <path d="M10 12h50M100 12h50" opacity="0.7" />
          <path d="M80 2l2.6 7.2L90 12l-7.4 2.8L80 22l-2.6-7.2L70 12l7.4-2.8Z" fill="currentColor" stroke="none" />
          <path d="M66 8l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1ZM94 8l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1Z" fill="currentColor" stroke="none" opacity="0.65" />
        </svg>
      );
    case "confetti":
      return (
        <svg viewBox="0 0 160 28" width="160" height="28" {...common} stroke="none" fill="currentColor">
          <circle cx="20" cy="10" r="2.2" opacity="0.6" />
          <rect x="36" y="16" width="6" height="2.6" rx="1.3" transform="rotate(-30 39 17)" />
          <circle cx="56" cy="8" r="1.6" />
          <rect x="68" y="18" width="7" height="2.6" rx="1.3" transform="rotate(25 71 19)" opacity="0.7" />
          <circle cx="80" cy="11" r="3" />
          <rect x="88" y="5" width="6" height="2.6" rx="1.3" transform="rotate(-20 91 6)" opacity="0.7" />
          <circle cx="104" cy="19" r="1.8" />
          <rect x="116" y="9" width="7" height="2.6" rx="1.3" transform="rotate(35 119 10)" />
          <circle cx="140" cy="16" r="2.2" opacity="0.6" />
        </svg>
      );
    case "deco":
      return (
        <svg viewBox="0 0 160 28" width="160" height="28" {...common} strokeWidth="1.2">
          <path d="M6 14h52M102 14h52" />
          <path d="M6 18h44M110 18h44" opacity="0.5" />
          <path d="M80 4 92 14 80 24 68 14Z" />
          <path d="M80 9 86 14 80 19 74 14Z" fill="currentColor" stroke="none" />
          <path d="M58 14l6-5M58 14l6 5M102 14l-6-5M102 14l-6 5" />
        </svg>
      );
    default:
      // diamond: two hairlines and a small diamond (the original look)
      return (
        <svg viewBox="0 0 120 12" width="120" height="12" {...common} strokeWidth="1">
          <path d="M8 6h44M68 6h44" opacity="0.7" />
          <path d="M60 2.5 63.5 6 60 9.5 56.5 6Z" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
