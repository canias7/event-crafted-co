import React from "react";
import { Composition } from "remotion";
import { Promo, promoDefaultProps } from "./compositions/Promo";
import { LottieDemo } from "./compositions/LottieDemo";

const FPS = 30;
const DURATION = 5 * FPS; // 5 seconds

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1:1 — Instagram / Facebook feed */}
      <Composition
        id="SquarePromo"
        component={Promo}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={promoDefaultProps}
      />

      {/* 9:16 — Stories / Reels / TikTok */}
      <Composition
        id="StoryPromo"
        component={Promo}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={promoDefaultProps}
      />

      {/* Lottie example over branded background */}
      <Composition
        id="LottieDemo"
        component={LottieDemo}
        durationInFrames={3 * FPS}
        fps={FPS}
        width={1080}
        height={1080}
      />
    </>
  );
};
