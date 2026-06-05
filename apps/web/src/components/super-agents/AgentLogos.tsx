// Custom logo mark for HILUX — full brand badge with its own
// gradient background (cream tile + orange waveform).

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
