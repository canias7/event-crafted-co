// Custom logo marks for the three Super Agents.
// HILUX is a full badge with its own gradient background; RAPTOR
// and AXION are single-color glyphs that take the agent's accent
// via currentColor.

import { useId, type SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function HiluxLogo({ className, ...props }: IconProps) {
  // Full brand badge: cream → peach background tile + an orange
  // waveform peak/valley line with two anchor dots. Reads as
  // "voice / always-on chat" instead of a generic icon.
  // useId keeps the gradient IDs unique when the logo renders
  // multiple times on the same page (picker + header).
  const reactId = useId();
  const bgId = `hilux-bg-${reactId}`;
  const fgId = `hilux-fg-${reactId}`;
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#fff0d6" />
        </linearGradient>
        <linearGradient id={fgId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#ff6a00" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="28" fill={`url(#${bgId})`} />
      <path
        d="M22 60 L40 60 L48 38 L60 86 L72 50 L80 60 L98 60"
        fill="none"
        stroke={`url(#${fgId})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="98" cy="60" r="4.5" fill="#ff6a00" />
      <circle cx="22" cy="60" r="4.5" fill="#ffb02e" />
    </svg>
  );
}

export function RaptorLogo({ className, ...props }: IconProps) {
  // Full brand badge: dark warm-bronze tile with a faint hexagonal
  // perimeter and a gold sentinel figure (circle head + arm) at the
  // center. Reads as "wordsmith / sentinel of the listing copy"
  // distinct from HILUX's chat waveform.
  const reactId = useId();
  const bgId = `raptor-bg-${reactId}`;
  const fgId = `raptor-fg-${reactId}`;
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1606" />
          <stop offset="1" stopColor="#0c0a04" />
        </linearGradient>
        <linearGradient id={fgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd24a" />
          <stop offset="1" stopColor="#ff8a2e" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="28" fill={`url(#${bgId})`} />
      <polygon
        points="60,28 88,44 88,76 60,92 32,76 32,44"
        fill="none"
        stroke={`url(#${fgId})`}
        strokeWidth="3.5"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <circle
        cx="60"
        cy="54"
        r="12"
        fill="none"
        stroke={`url(#${fgId})`}
        strokeWidth="5"
      />
      <path
        d="M60 64 L60 82 M60 76 L70 76"
        stroke={`url(#${fgId})`}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AxionLogo({ className, ...props }: IconProps) {
  // Full brand badge: deep forest-green tile with a green-to-teal
  // gear motif (eight spokes orbiting a ringed core) and a white
  // pinpoint center. Reads as "vision / generative engine" distinct
  // from HILUX's waveform and RAPTOR's sentinel.
  const reactId = useId();
  const bgId = `axion-bg-${reactId}`;
  const fgId = `axion-fg-${reactId}`;
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10211a" />
          <stop offset="1" stopColor="#0a110e" />
        </linearGradient>
        <linearGradient id={fgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9dff5e" />
          <stop offset="1" stopColor="#2ee0c0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="28" fill={`url(#${bgId})`} />
      <g fill={`url(#${fgId})`}>
        <rect x="55" y="26" width="10" height="14" rx="3" />
        <rect x="55" y="80" width="10" height="14" rx="3" />
        <rect x="26" y="55" width="14" height="10" rx="3" />
        <rect x="80" y="55" width="14" height="10" rx="3" />
        <rect x="36" y="36" width="11" height="11" rx="3" transform="rotate(45 41 41)" />
        <rect x="73" y="73" width="11" height="11" rx="3" transform="rotate(45 78 78)" />
        <rect x="73" y="36" width="11" height="11" rx="3" transform="rotate(45 78 41)" />
        <rect x="36" y="73" width="11" height="11" rx="3" transform="rotate(45 41 78)" />
      </g>
      <circle cx="60" cy="60" r="18" fill="none" stroke={`url(#${fgId})`} strokeWidth="5" />
      <circle cx="60" cy="60" r="6" fill="#ffffff" />
    </svg>
  );
}
