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
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="5.4"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.55"
      />
      <circle
        cx="12"
        cy="12"
        r="8.8"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.25"
      />
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
