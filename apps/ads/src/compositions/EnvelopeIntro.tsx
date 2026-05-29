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

const IVORY = "#f7f1e6";
const BURG = "#7a1f2b";
const GOLD = "#caa75a";
const INK = "#5b4a3a";

const W = 460;
const H = 312;

const PAPER = staticFile("paper-burgundy.png"); // real gpt-image-2 burgundy paper texture

// translucent shading overlays laid OVER the photo texture to fake the folds/light
const bodyShade = "linear-gradient(160deg, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.58) 100%)";
const flapShadeG = "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.05) 62%, rgba(0,0,0,0.22) 100%)";
const bottomShade = "linear-gradient(0deg, rgba(0,0,0,0.24) 0%, rgba(255,255,255,0.04) 100%)";

const TEX = { backgroundSize: "cover, 240px 240px", backgroundRepeat: "no-repeat, repeat" } as const;

export const EnvelopeIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const flapOpen = spring({ frame: frame - 12, fps, config: { damping: 16, mass: 0.9 }, durationInFrames: 38 });
  const flapRot = interpolate(flapOpen, [0, 1], [0, -168]);
  const flapShade = interpolate(flapOpen, [0, 0.5, 1], [1, 0.8, 0.92]);

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
        {/* back wall / interior (photo texture, darkened) */}
        <div style={{ ...part, ...TEX, borderRadius: 12, backgroundImage: `${bodyShade}, url(${PAPER})`, transform: "translateZ(-2px)" }} />

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

        {/* bottom front flap (photo texture) */}
        <div style={{ ...part, ...TEX, backgroundImage: `${bottomShade}, url(${PAPER})`, clipPath: "polygon(0% 100%, 100% 100%, 50% 34%)", transform: "translateZ(1px)" }} />
        {/* side seams for depth */}
        <div style={{ ...part, background: "linear-gradient(135deg,rgba(255,255,255,0.06),transparent 40%)", clipPath: "polygon(0% 0%, 50% 50%, 0% 100%)", transform: "translateZ(1.1px)" }} />
        <div style={{ ...part, background: "linear-gradient(225deg,rgba(0,0,0,0.12),transparent 40%)", clipPath: "polygon(100% 0%, 50% 50%, 100% 100%)", transform: "translateZ(1.1px)" }} />

        {/* TOP flap — hinged at the top edge, rotates open */}
        <div style={{ ...part, transformStyle: "preserve-3d", transformOrigin: "50% 0%", transform: `translateZ(3px) rotateX(${flapRot}deg)`, filter: `brightness(${flapShade})` }}>
          <div style={{ ...part, ...TEX, backgroundImage: `${flapShadeG}, url(${PAPER})`, clipPath: "polygon(0% 0%, 100% 0%, 50% 64%)" }} />
          {/* crease shadow along the hinge */}
          <div style={{ ...part, background: "linear-gradient(180deg,rgba(0,0,0,0.20),transparent 12%)", clipPath: "polygon(0% 0%, 100% 0%, 50% 64%)" }} />
          {/* photoreal wax seal at the flap point */}
          <Img src={staticFile("wax-seal.png")} style={{ position: "absolute", left: "50%", top: "56%", width: 112, height: 112, transform: "translate(-50%,-50%)", filter: "drop-shadow(0 3px 6px rgba(40,10,12,0.4))" }} />
        </div>
      </div>

      {/* ivory wash for a seamless reveal into the real page */}
      <AbsoluteFill style={{ backgroundColor: IVORY, opacity: wash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
