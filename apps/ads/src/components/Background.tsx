import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { brand } from "../theme";

/**
 * Navy backdrop with a slow drifting radial highlight and a few softly
 * floating circles. Purely decorative, loops gently over the whole ad.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  // Drift the highlight in a slow circle.
  const t = (frame / durationInFrames) * Math.PI * 2;
  const hx = 50 + Math.cos(t) * 18;
  const hy = 38 + Math.sin(t) * 14;

  return (
    <AbsoluteFill style={{ backgroundColor: brand.navy, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 60% at ${hx}% ${hy}%, rgba(255,255,255,0.14), rgba(27,54,84,0) 70%)`,
        }}
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const seed = i * 1.7 + 0.5;
        const size = 120 + ((i * 90) % 260);
        const driftY = Math.sin(frame / (40 + i * 12) + seed) * 30;
        const driftX = Math.cos(frame / (55 + i * 9) + seed) * 24;
        const baseX = ((i * 37) % 100) / 100;
        const baseY = ((i * 61) % 100) / 100;
        const opacity = interpolate(i % 2, [0, 1], [0.05, 0.09]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: baseX * width + driftX,
              top: baseY * height + driftY,
              width: size,
              height: size,
              borderRadius: "50%",
              background: i % 2 === 0 ? brand.crimson : brand.white,
              opacity,
              filter: "blur(2px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
