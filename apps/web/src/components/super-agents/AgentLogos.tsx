// Custom logo marks for the three Super Agents.
// Each is a single-color SVG that takes the agent's accent via
// currentColor, so a parent applying `style={{ color: accent }}`
// (or `text-` class) gets the brand tint for free.
//
// Visual cues:
//   - HILUX (Always On / chat)   → pulse rings broadcasting from a center dot
//   - RAPTOR (Wordsmith / copy)  → diagonal nib stroke + drop, like a pen tip
//   - AXION (Visuals / generative) → four-point sparkle / aperture

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function HiluxLogo({ className, ...props }: IconProps) {
  // H-monogram with an "always on" pulse light in the top-right
  // corner. The H reads as the H in HILUX; the glowing dot reads as
  // the agent's live/listening state.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* H — two stacked pillars + a centered crossbar, all rounded */}
      <rect x="4.5" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" />
      <rect x="13.5" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" />
      <rect x="6.4" y="10.7" width="9.2" height="2.6" rx="1.3" fill="currentColor" />
      {/* Pulse light — soft halo + solid core */}
      <circle cx="19.5" cy="4.5" r="3.4" fill="currentColor" opacity="0.22" />
      <circle cx="19.5" cy="4.5" r="1.9" fill="currentColor" />
    </svg>
  );
}

export function RaptorLogo({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M5.5 18.5 L18.5 5.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M10 18.5 L18.5 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="5.5" cy="18.5" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function AxionLogo({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z"
        fill="currentColor"
      />
    </svg>
  );
}
