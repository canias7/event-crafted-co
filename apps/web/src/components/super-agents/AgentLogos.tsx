// Custom logo marks for the AI agents + the Vendora MCP connector.
//
// HILUX: full brand badge with its own gradient background
// (cream tile + orange waveform).
// Axion: lavender tile + a purple photo-frame mark (sun +
// mountain). Reads as "image / visuals".
// VendoraMcp: black tile with a stylized V monogram + a
// soft halo. Reads as "your account piped into your MCP client".

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

export function AxionLogo({ className, ...props }: IconProps) {
  // Full brand badge: soft lavender tile + a purple photo-frame
  // mark (sun + mountain peaks). Reads as "image / visuals",
  // distinct from HILUX's warm waveform.
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
          <stop offset="0" stopColor="#faf1ff" />
          <stop offset="1" stopColor="#efdcff" />
        </linearGradient>
        <linearGradient id={fgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c46bff" />
          <stop offset="1" stopColor="#9326d9" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="28" fill={`url(#${bgId})`} />
      {/* photo frame */}
      <rect
        x="33"
        y="37"
        width="54"
        height="46"
        rx="11"
        fill="none"
        stroke={`url(#${fgId})`}
        strokeWidth="6"
      />
      {/* sun */}
      <circle cx="49" cy="52" r="6.5" fill={`url(#${fgId})`} />
      {/* mountain peaks */}
      <path d="M38 79 L54 60 L63 69 L73 56 L82 71 L82 79 Z" fill={`url(#${fgId})`} />
    </svg>
  );
}

export function VendoraMcpLogo({ className, ...props }: IconProps) {
  // Dark tile + cream V monogram with a soft halo ring evoking
  // the Claude brand colour. Distinct from HILUX's warm waveform
  // so the picker reads two clearly different surfaces.
  const reactId = useId();
  const bgId = `vfc-bg-${reactId}`;
  const haloId = `vfc-halo-${reactId}`;
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
          <stop offset="0" stopColor="#16110a" />
          <stop offset="1" stopColor="#0a0805" />
        </linearGradient>
        <radialGradient id={haloId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb98a" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#ffb98a" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffb98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="28" fill={`url(#${bgId})`} />
      <circle cx="60" cy="60" r="40" fill={`url(#${haloId})`} />
      {/* V monogram */}
      <path
        d="M36 36 L60 88 L84 36"
        fill="none"
        stroke="#f5e6d3"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Small Claude-orange dot tucked into the V's corner — read as
          the "connection" indicator */}
      <circle cx="60" cy="88" r="4" fill="#cc785c" />
    </svg>
  );
}
