import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "../components/Background";
import { brand, fonts } from "../theme";

export type PromoProps = {
  kicker: string;
  headline: string;
  subhead: string;
  cta: string;
  domain: string;
};

export const promoDefaultProps: PromoProps = {
  kicker: "EVENTVENDORA",
  headline: "Book the perfect vendor for your event.",
  subhead: "Photographers, caterers, venues & more — all in one place.",
  cta: "Start planning free",
  domain: "eventvendora.com",
};

export const Promo: React.FC<PromoProps> = ({
  kicker,
  headline,
  subhead,
  cta,
  domain,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  // Scale type to the canvas so one composition reads well at any size.
  const scale = width / 1080;

  const enter = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 30 });

  const kickerOp = enter(0);
  const headlineWords = headline.split(" ");
  const subOp = enter(28);
  const subY = interpolate(subOp, [0, 1], [24, 0]);

  const ctaSpring = enter(40);
  const ctaScale = interpolate(ctaSpring, [0, 1], [0.85, 1]);

  const domainOp = enter(52);

  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans }}>
      <Background />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 90 * scale,
          textAlign: "center",
        }}
      >
        {/* Kicker */}
        <div
          style={{
            opacity: kickerOp,
            color: brand.cream,
            letterSpacing: 8 * scale,
            fontSize: 26 * scale,
            fontWeight: 600,
            marginBottom: 40 * scale,
          }}
        >
          {kicker}
        </div>

        {/* Headline — word-by-word spring reveal, brand serif */}
        <h1
          style={{
            fontFamily: fonts.serif,
            color: brand.white,
            fontSize: 92 * scale,
            lineHeight: 1.05,
            fontWeight: 600,
            margin: 0,
            maxWidth: 900 * scale,
          }}
        >
          {headlineWords.map((word, i) => {
            const wp = enter(8 + i * 5);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: wp,
                  transform: `translateY(${interpolate(wp, [0, 1], [30, 0])}px)`,
                  marginRight: 18 * scale,
                }}
              >
                {word}
              </span>
            );
          })}
        </h1>

        {/* Subhead */}
        <p
          style={{
            opacity: subOp,
            transform: `translateY(${subY}px)`,
            color: brand.cream,
            fontSize: 34 * scale,
            lineHeight: 1.4,
            marginTop: 36 * scale,
            maxWidth: 760 * scale,
          }}
        >
          {subhead}
        </p>

        {/* CTA pill */}
        <div
          style={{
            transform: `scale(${ctaScale})`,
            opacity: ctaSpring,
            marginTop: 56 * scale,
            backgroundColor: brand.crimson,
            color: brand.white,
            fontSize: 34 * scale,
            fontWeight: 700,
            padding: `${26 * scale}px ${56 * scale}px`,
            borderRadius: 999,
            boxShadow: `0 ${20 * scale}px ${50 * scale}px rgba(200,64,58,0.4)`,
          }}
        >
          {cta}
        </div>

        {/* Domain */}
        <div
          style={{
            opacity: 0.85 * domainOp,
            color: brand.white,
            fontSize: 28 * scale,
            letterSpacing: 2 * scale,
            marginTop: 44 * scale,
          }}
        >
          {domain}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
