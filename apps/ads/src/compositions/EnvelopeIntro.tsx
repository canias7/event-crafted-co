import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadAllura } from "@remotion/google-fonts/Allura";
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: script } = loadAllura("normal", { weights: ["400"], subsets: ["latin"] });
const { fontFamily: serif } = loadCormorant("normal", { weights: ["500", "600"], subsets: ["latin"] });

const LINEN = "#efe7d6"; // matches the photo background
const BURG = "#7a1f2b";
const GOLD = "#9a7b35";
const INK = "#5b4a3a";

const OPEN = staticFile("envelope-open.png");
const CLOSED = staticFile("envelope-closed.png");

// front-pocket polygon (in % of the square frame) — the lower triangle/trapezoid of the
// OPEN envelope. A clipped copy of the same photo is drawn over the card with this shape,
// so the card looks tucked INTO the pocket (seam is invisible: identical photo, same place).
const POCKET = "polygon(16% 66%, 50% 53%, 84% 66%, 84% 90%, 16% 90%)";

export const EnvelopeIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 0-18 hold closed | 18-34 quick dissolve to open | 38-86 card rises | 92-end expand+wash
  const open = interpolate(frame, [22, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // closed holds sharp then drops fast (short overlap → no ghosting), with a tiny settle
  const closedOp = interpolate(frame, [18, 30], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const closedScale = interpolate(frame, [18, 32], [1, 1.02], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const rise = spring({ frame: frame - 40, fps, config: { damping: 20, mass: 1 }, durationInFrames: 48 });
  const cardY = interpolate(rise, [0, 1], [0, -30]);          // % of frame, slides up out of pocket
  const cardOp = interpolate(frame, [40, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const expand = spring({ frame: frame - 92, fps, config: { damping: 24, mass: 1.2 }, durationInFrames: 36 });
  const cardScale = interpolate(rise, [0, 1], [0.96, 1]) * interpolate(expand, [0, 1], [1, 11]);
  const envFade = interpolate(frame, [92, 112], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wash = interpolate(expand, [0.4, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const contentFade = interpolate(expand, [0.15, 0.55], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const full: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };

  return (
    <AbsoluteFill style={{ backgroundColor: LINEN, fontFamily: serif }}>
      <div style={{ position: "absolute", inset: 0, opacity: envFade }}>
        {/* base: open envelope photo (always opaque; revealed as the closed one dissolves) */}
        <Img src={OPEN} style={{ ...full, zIndex: 1 }} />

        {/* the invitation card — rises up out of the pocket */}
        <div
          style={{
            position: "absolute", left: "26%", right: "26%", top: "44%", zIndex: 2,
            background: "linear-gradient(180deg,#fffdf8,#fbf5ea)", border: "1px solid #e3d7bd", borderRadius: 6,
            padding: "3.2% 2.2%", textAlign: "center", boxShadow: "0 22px 44px rgba(60,25,25,0.26)",
            opacity: cardOp, transform: `translateY(${cardY}%) scale(${cardScale})`, transformOrigin: "50% 50%",
          }}
        >
          <div style={{ opacity: contentFade }}>
            <div style={{ fontSize: 18, letterSpacing: "0.36em", color: GOLD }}>YOU&rsquo;RE INVITED</div>
            <div style={{ fontFamily: script, fontSize: 64, color: BURG, lineHeight: 1, margin: "8px 0" }}>You&rsquo;re Invited</div>
            <div style={{ width: 56, height: 1, background: GOLD, margin: "12px auto", opacity: 0.7 }} />
            <div style={{ fontSize: 15, letterSpacing: "0.2em", color: INK }}>TO CELEBRATE WITH US</div>
          </div>
        </div>

        {/* front-pocket overlay: identical open photo clipped to the pocket, masks the card's lower half */}
        <Img src={OPEN} style={{ ...full, zIndex: 3, opacity: open, clipPath: POCKET, WebkitClipPath: POCKET }} />

        {/* closed envelope on top, fades out as it "opens" */}
        <Img src={CLOSED} style={{ ...full, zIndex: 5, opacity: closedOp, transform: `scale(${closedScale})` }} />
      </div>

      {/* ivory wash for a seamless reveal into the real page */}
      <AbsoluteFill style={{ backgroundColor: "#f7f1e6", opacity: wash, pointerEvents: "none", zIndex: 10 }} />
    </AbsoluteFill>
  );
};
