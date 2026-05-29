import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadAllura } from "@remotion/google-fonts/Allura";
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: script } = loadAllura("normal", { weights: ["400"], subsets: ["latin"] });
const { fontFamily: serif } = loadCormorant("normal", { weights: ["500", "600"], subsets: ["latin"] });

const IVORY = "#f7f1e6";
const BURG = "#7a1f2b";
const GOLD = "#caa75a";
const INK = "#5b4a3a";

const W = 460;
const H = 312;

// burgundy paper gradients (kept consistent across every part = looks like one object)
const bodyGrad = "linear-gradient(150deg, #8a2533 0%, #75202c 48%, #631a25 100%)";
const flapGrad = "linear-gradient(180deg, #8d2734 0%, #7a212d 70%, #6c1c27 100%)";
const bottomGrad = "linear-gradient(0deg, #6d1d28 0%, #7a212d 100%)";

export const EnvelopeIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // hold: 0-12 | flap opens: 12-48 | letter rises: 36-76 | expand+wash: 80-end
  const flapOpen = spring({ frame: frame - 12, fps, config: { damping: 16, mass: 0.9 }, durationInFrames: 38 });
  const flapRot = interpolate(flapOpen, [0, 1], [0, -168]);
  const flapShade = interpolate(flapOpen, [0, 0.5, 1], [1, 0.78, 0.9]); // brightness dip mid-rotation

  const rise = spring({ frame: frame - 36, fps, config: { damping: 19, mass: 1 }, durationInFrames: 42 });
  const letterY = interpolate(rise, [0, 1], [30, -206]);
  const letterOp = interpolate(frame, [36, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const cardZ = interpolate(rise, [0, 0.25, 1], [0, 90, 90], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const expand = spring({ frame: frame - 80, fps, config: { damping: 23, mass: 1.15 }, durationInFrames: 34 });
  const letterScale = interpolate(rise, [0, 1], [0.94, 1]) * interpolate(expand, [0, 1], [1, 9]);
  const envFade = interpolate(frame, [80, 100], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wash = interpolate(expand, [0.4, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const contentFade = interpolate(expand, [0.15, 0.55], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lift = interpolate(flapOpen, [0, 1], [0, -6]);

  const part: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: W, height: H };

  return (
    <AbsoluteFill style={{ backgroundColor: IVORY, alignItems: "center", justifyContent: "center", fontFamily: serif }}>
      <div style={{ position: "relative", width: W, height: H, transform: `translateY(${lift}px)`, transformStyle: "preserve-3d", opacity: envFade, perspective: 1800, filter: "drop-shadow(0 30px 46px rgba(70,25,28,0.30))" }}>
        {/* back wall (interior, shows when flap lifts) */}
        <div style={{ ...part, borderRadius: 12, background: "linear-gradient(160deg,#5e1922,#4d141c)", transform: "translateZ(-2px)" }} />

        {/* letter — hidden behind flaps, rises out */}
        <div
          style={{
            position: "absolute", left: "11%", right: "11%", top: "20%", zIndex: 2,
            background: "linear-gradient(180deg,#fffdf8,#fbf5ea)", border: "1px solid #e8dcc2", borderRadius: 7,
            padding: "20px 14px", textAlign: "center", boxShadow: "0 20px 40px rgba(60,25,25,0.28)",
            opacity: letterOp, transform: `translateY(${letterY}px) translateZ(${cardZ}px) scale(${letterScale})`, transformOrigin: "50% 50%",
          }}
        >
          <div style={{ opacity: contentFade }}>
            <div style={{ fontSize: 12, letterSpacing: "0.36em", color: GOLD }}>YOU&rsquo;RE INVITED</div>
            <div style={{ fontFamily: script, fontSize: 44, color: BURG, lineHeight: 1, margin: "6px 0" }}>You&rsquo;re Invited</div>
            <div style={{ width: 40, height: 1, background: GOLD, margin: "8px auto", opacity: 0.7 }} />
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: INK }}>TO CELEBRATE WITH US</div>
          </div>
        </div>

        {/* bottom front flap (static) */}
        <div style={{ ...part, background: bottomGrad, clipPath: "polygon(0% 100%, 100% 100%, 50% 34%)", transform: "translateZ(1px)" }} />
        {/* side seams for depth */}
        <div style={{ ...part, background: "linear-gradient(135deg,rgba(255,255,255,0.05),transparent 40%)", clipPath: "polygon(0% 0%, 50% 50%, 0% 100%)", transform: "translateZ(1.1px)" }} />
        <div style={{ ...part, background: "linear-gradient(225deg,rgba(0,0,0,0.10),transparent 40%)", clipPath: "polygon(100% 0%, 50% 50%, 100% 100%)", transform: "translateZ(1.1px)" }} />

        {/* TOP flap — hinged at the top edge, rotates open */}
        <div style={{ ...part, transformStyle: "preserve-3d", transformOrigin: "50% 0%", transform: `translateZ(3px) rotateX(${flapRot}deg)`, filter: `brightness(${flapShade})` }}>
          <div style={{ ...part, background: flapGrad, clipPath: "polygon(0% 0%, 100% 0%, 50% 64%)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.06)" }} />
          {/* crease shadow along the hinge */}
          <div style={{ ...part, background: "linear-gradient(180deg,rgba(0,0,0,0.18),transparent 12%)", clipPath: "polygon(0% 0%, 100% 0%, 50% 64%)" }} />
          {/* wax seal at the flap point */}
          <div style={{ position: "absolute", left: "50%", top: "55%", transform: "translate(-50%,-50%)", width: 62, height: 62, borderRadius: "50%", background: "radial-gradient(circle at 36% 30%, #a83a47, #7d2330 55%, #5c1822 100%)", boxShadow: "0 4px 10px rgba(0,0,0,0.35), inset 0 -3px 6px rgba(0,0,0,0.3), inset 0 3px 5px rgba(255,255,255,0.15)" }}>
            <div style={{ position: "absolute", inset: 9, borderRadius: "50%", border: "1px solid rgba(255,225,180,0.25)" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: script, fontSize: 26, color: "rgba(238,205,150,0.85)" }}>&amp;</div>
          </div>
        </div>
      </div>

      {/* ivory wash for a seamless reveal into the real page */}
      <AbsoluteFill style={{ backgroundColor: IVORY, opacity: wash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
