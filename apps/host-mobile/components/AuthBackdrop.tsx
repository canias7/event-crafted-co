// Backdrop for the sign-in, sign-up and password screens, matching the
// website's sign-in pages (owner's call, Oct 2026): the plain ink page
// (no ombre, owner's call) with several thin rings turning at different
// speeds and directions (two carry a small gold dot so the motion
// reads), all behind the content.
// Same drawing as apps/web/src/components/auth/AuthBackdrop.tsx.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, useWindowDimensions, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const RINGS = [
  { size: 260, opacity: 0.32, dashed: false, seconds: 50, reverse: false, dot: true },
  { size: 400, opacity: 0.24, dashed: true, seconds: 80, reverse: true, dot: false },
  { size: 560, opacity: 0.18, dashed: false, seconds: 110, reverse: false, dot: true },
  { size: 740, opacity: 0.12, dashed: true, seconds: 150, reverse: true, dot: false },
  { size: 940, opacity: 0.08, dashed: false, seconds: 200, reverse: false, dot: false },
];

function Ring({ ring, cx, cy, still }: { ring: (typeof RINGS)[number]; cx: number; cy: number; still: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: ring.seconds * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, ring.seconds, still]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ring.reverse ? ["360deg", "0deg"] : ["0deg", "360deg"],
  });
  const s = ring.size;
  const r = s / 2 - 4;
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: cx - s / 2,
        top: cy - s / 2,
        width: s,
        height: s,
        transform: [{ rotate }],
      }}
    >
      <Svg width={s} height={s}>
        <Circle
          cx={s / 2}
          cy={s / 2}
          r={r}
          stroke="#c9a86a"
          strokeOpacity={ring.opacity}
          strokeWidth={1}
          strokeDasharray={ring.dashed ? "4 6" : undefined}
          fill="none"
        />
        {ring.dot && (
          <Circle cx={s / 2} cy={4} r={3} fill="#c9a86a" fillOpacity={Math.min(1, ring.opacity * 4)} />
        )}
      </Svg>
    </Animated.View>
  );
}

export function AuthBackdrop() {
  const { width, height } = useWindowDimensions();
  const still = useStill();
  const cx = width / 2;
  const cy = height * 0.42;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, height }}>
      {RINGS.map((ring, i) => (
        <Ring key={i} ring={ring} cx={cx} cy={cy} still={still} />
      ))}
    </View>
  );
}

// Respect "Reduce motion": the rings stay put.
function useStill(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setStill(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setStill);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return still;
}

