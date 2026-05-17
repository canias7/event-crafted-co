// Shared visual shell for vendor brand cards — the cream-ocean
// gradient front, the peach back, the flip toggle, the ripple lines,
// the radial sun. Used by:
//   - VendorBrandCard (public listing detail page)
//   - HeaderCard inside VendorMyProfilePage (account profile)
//
// Both surfaces are the vendor's brand identity, so any visual change
// (border color, gradient stops, ripple count, etc.) should happen
// here exactly once and propagate to both pages automatically.

import { useState, type ReactNode } from "react";
import { Info, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  /** Front face content — logo, name, stats, action buttons. */
  children: ReactNode;
  /** The vendor's bio (rendered on the back). Falls back to a
   *  read-only "No bio yet" message if null/empty. */
  bio: string | null;
  /** Used in the back-face eyebrow: "About {businessName}". */
  businessName: string;
}

export function BrandCardShell({ children, bio, businessName }: Props) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="relative" style={{ perspective: 1400 }}>
      {/* Flip toggle — fixed in the top-left corner across both
          faces so the user always has a clear way back. */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show profile front" : "Show bio on back"}
        className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-foreground/80 hover:text-foreground transition-colors"
        style={{
          background: "rgba(255,255,255,0.7)",
          border: "0.5px solid rgba(255,138,76,0.28)",
          backdropFilter: "blur(8px)",
        }}
      >
        {flipped ? (
          <>
            <RotateCcw className="h-3 w-3" />
            Back
          </>
        ) : (
          <>
            <Info className="h-3 w-3" />
            Bio
          </>
        )}
      </button>

      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* FRONT — sets the card's natural height */}
        <div
          className={`${SHELL_OUTER_CLASSES} bg-[linear-gradient(135deg,#ffffff_0%,#f3f4f6_100%)]`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <BrandCanvas />
          <div className="relative">{children}</div>
        </div>

        {/* BACK — bio. Absolutely positioned over the front. */}
        <div
          className={`absolute inset-0 ${SHELL_OUTER_CLASSES} bg-[linear-gradient(135deg,#fff5e8_0%,#f6e3d2_100%)] flex flex-col`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            overflow: "hidden",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(circle at 80% 20%, rgba(255,138,76,0.18), transparent 60%)",
            }}
          />
          <p className="relative font-label text-[10px] uppercase tracking-[0.22em] text-muted-foreground mt-2 pl-14 sm:pl-16">
            About {businessName}
          </p>
          <div className="relative flex-1 mt-3 overflow-y-auto pr-2">
            {bio?.trim() ? (
              <p className="font-editorial italic text-foreground/85 text-[17px] sm:text-[19px] leading-[1.5] whitespace-pre-line">
                {bio}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No bio yet for {businessName}.
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// One source of truth for the warm shell — border, shadow, rounding,
// padding. Both faces share it so any tweak applies symmetrically.
const SHELL_OUTER_CLASSES =
  "relative overflow-hidden rounded-3xl border border-[#e8dfcf] shadow-[0_8px_24px_-12px_rgba(26,20,16,0.18)] px-6 py-7 sm:px-8 sm:py-8";

// Radial sun + four horizontal cream ripple lines used on the front
// face. Decorative; sits behind every other content.
function BrandCanvas() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(255,230,180,0.55), transparent 55%)",
        }}
      />
      {[32, 48, 62, 76].map((top, i) => (
        <div
          key={top}
          className="pointer-events-none absolute inset-x-0"
          aria-hidden
          style={{
            top: `${top}%`,
            height: "1.5px",
            background: `linear-gradient(90deg, rgba(168,137,63,0) 0%, rgba(255,240,200,${0.55 - i * 0.05}) 50%, rgba(168,137,63,0) 100%)`,
          }}
        />
      ))}
    </>
  );
}
