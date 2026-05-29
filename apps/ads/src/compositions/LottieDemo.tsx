import React, { useEffect, useState } from "react";
import { Lottie, LottieAnimationData } from "@remotion/lottie";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
import { Background } from "../components/Background";
import { brand, fonts } from "../theme";

/**
 * Shows how to drop a Lottie animation into a video ad.
 *
 * Replace public/animation.json with any file from https://lottiefiles.com
 * (download as "Lottie JSON") and it will play here, composited over the
 * branded background.
 */
export const LottieDemo: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading Lottie animation"));
  const [data, setData] = useState<LottieAnimationData | null>(null);

  useEffect(() => {
    fetch(staticFile("animation.json"))
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [handle]);

  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans }}>
      <Background />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        {data ? <Lottie animationData={data} style={{ width: 520, height: 520 }} loop /> : null}
        <div
          style={{
            fontFamily: fonts.serif,
            color: brand.white,
            fontSize: 64,
            fontWeight: 600,
            marginTop: 20,
            textAlign: "center",
          }}
        >
          Made with Eventvendora
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
