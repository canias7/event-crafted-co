// Animated brand intro + auth-method picker. Mirrors the web design at
// /tmp-design/vendora.html: a cream stage with character-by-character
// fade/translate reveals across two scenes, finishing on the Vendora
// wordmark. After the animation settles, four auth buttons fade in
// over the bottom edge.
//
// Tap anywhere during the intro to skip straight to the final state.

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const CREAM = "#fdfbf7";
const CREAM_DEEP = "#f7f3ec";
const INK = "#1a1410";
const INK_DIM = "rgba(26,20,16,0.6)";
const INK_BORDER = "rgba(26,20,16,0.18)";

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Per-character timing (ms). Mirrors the HTML constants.
const OPENER_PER_CHAR = 55;
const PHRASE_PER_CHAR = 42;
const WORDMARK_PER_CHAR = 110;
const TAGLINE_PER_CHAR = 42;

// Pause durations between sequence steps.
const OPENER_PRE_DELAY = 400;
const OPENER_HOLD = 1700;
const PHRASE_HOLD_BETWEEN = 450;
const STACK_HOLD_AFTER = 1400;
const STACK_FADE = 800;
const WORDMARK_PRE_DELAY = 200;
const WORDMARK_HOLD = 700;
const TAGLINE_HOLD = 1200;

const OPENER_TEXT = "The night is fine when the people align.";
// 30..36 = "people" — rendered bold instead of italic on that range.
const OPENER_BOLD_RANGE: [number, number] = [30, 36];

const PHRASES = [
  "A florist with taste.",
  "A photographer to chase.",
  "A night without waste.",
];

const TAGLINE = "for those who plan, and those who craft.";

interface AnimatedCharProps {
  char: string;
  delay: number;
  italic?: boolean;
  bold?: boolean;
  fontSize: number;
  color?: string;
  letterSpacing?: number;
  immediate?: boolean;
}

function AnimatedChar({
  char,
  delay,
  italic,
  bold,
  fontSize,
  color = INK,
  letterSpacing = 0,
  immediate,
}: AnimatedCharProps) {
  const opacity = useRef(new Animated.Value(immediate ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(immediate ? 0 : 14)).current;

  useEffect(() => {
    if (immediate) return;
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 600,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, [delay, immediate, opacity, translateY]);

  return (
    <Animated.Text
      style={{
        fontFamily: SERIF,
        fontSize,
        fontStyle: italic ? "italic" : "normal",
        fontWeight: bold ? "700" : "500",
        color,
        letterSpacing,
        opacity,
        transform: [{ translateY }],
        lineHeight: fontSize * 1.05,
      }}
    >
      {char === " " ? " " : char}
    </Animated.Text>
  );
}

interface AnimatedLineProps {
  text: string;
  startDelay: number;
  perChar: number;
  italic?: boolean;
  bold?: boolean;
  boldRange?: [number, number];
  fontSize: number;
  color?: string;
  letterSpacing?: number;
  fadeOut?: boolean;
  // When true, the entire line is shown immediately (replay short-circuit).
  immediate?: boolean;
}

// Renders text char-by-char with a flex-row layout. Words don't break
// across lines — each space-delimited word is a row of chars wrapped
// inside its own row container, and the parent flex-wraps between
// words. Spaces appear as their own animated chars at word boundaries.
function AnimatedLine({
  text,
  startDelay,
  perChar,
  italic,
  bold,
  boldRange,
  fontSize,
  color,
  letterSpacing,
  fadeOut,
  immediate,
}: AnimatedLineProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (fadeOut) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: STACK_FADE,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();
    }
  }, [fadeOut, fadeAnim]);

  // Walk chars; group into words by space boundaries.
  const words: { chars: { ch: string; idx: number }[] }[] = [];
  let current: { ch: string; idx: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") {
      if (current.length) words.push({ chars: current });
      current = [];
      words.push({ chars: [{ ch: " ", idx: i }] });
    } else {
      current.push({ ch, idx: i });
    }
  }
  if (current.length) words.push({ chars: current });

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {words.map((word, wIdx) => (
        <View key={wIdx} style={{ flexDirection: "row" }}>
          {word.chars.map(({ ch, idx }) => {
            const isBold =
              bold ||
              (boldRange ? idx >= boldRange[0] && idx < boldRange[1] : false);
            return (
              <AnimatedChar
                key={idx}
                char={ch}
                delay={startDelay + idx * perChar}
                italic={italic && !isBold}
                bold={isBold}
                fontSize={fontSize}
                color={color}
                letterSpacing={letterSpacing}
                immediate={immediate}
              />
            );
          })}
        </View>
      ))}
    </Animated.View>
  );
}

type Scene = "opener" | "phrases" | "wordmark" | "done";

interface AuthButtonProps {
  variant: "solid-light" | "solid-dark" | "outline";
  onPress: () => void;
  label: string;
  icon?: React.ReactNode;
  last?: boolean;
}

// Centered icon+label pill. Uses an inner row so the layout is
// deterministic — Pressable's alignItems was acting up across iOS
// versions, leaving labels left-aligned.
function AuthButton({ variant, onPress, label, icon, last }: AuthButtonProps) {
  const isLight = variant === "solid-light";
  const isOutline = variant === "outline";
  const bg = isLight
    ? "#ffffff"
    : isOutline
      ? "transparent"
      : "#262626";
  const fg = isLight ? "#000000" : "#ffffff";
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: bg,
            borderRadius: 22,
            marginBottom: last ? 0 : 8,
            opacity: pressed ? 0.7 : 1,
            borderWidth: isOutline ? 1 : 0,
            borderColor: "rgba(255,255,255,0.22)",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 16,
              gap: 10,
            }}
          >
            {icon ?? null}
            <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>
              {label}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [scene, setScene] = useState<Scene>("opener");
  const [phrasesShown, setPhrasesShown] = useState(0);
  const [stackFading, setStackFading] = useState(false);
  const [skipped, setSkipped] = useState(false);
  // Auth sheet stays docked + visible the whole time so the screen
  // reads as one screen with rotating upper copy, not three.
  const buttonsOpacity = useRef(new Animated.Value(1)).current;

  // Master timeline. Cancels itself if the user taps to skip.
  useEffect(() => {
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      timeouts.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };

    const openerDuration =
      OPENER_PRE_DELAY + OPENER_TEXT.length * OPENER_PER_CHAR + OPENER_HOLD;

    after(openerDuration, () => {
      setScene("phrases");
      // Stagger the three phrases.
      let cum = 0;
      PHRASES.forEach((p, i) => {
        const len = p.length * PHRASE_PER_CHAR;
        after(cum, () => setPhrasesShown(i + 1));
        cum += len + PHRASE_HOLD_BETWEEN;
      });
      after(cum + STACK_HOLD_AFTER, () => setStackFading(true));
      after(cum + STACK_HOLD_AFTER + STACK_FADE, () => {
        setScene("wordmark");
      });
      const wordmarkOnsetMs =
        cum + STACK_HOLD_AFTER + STACK_FADE + WORDMARK_PRE_DELAY;
      const wordmarkDoneMs =
        wordmarkOnsetMs + 7 * WORDMARK_PER_CHAR + WORDMARK_HOLD;
      const taglineDoneMs =
        wordmarkDoneMs + TAGLINE.length * TAGLINE_PER_CHAR + TAGLINE_HOLD;
      after(taglineDoneMs, () => {
        setScene("done");
      });
    });

    return () => {
      cancelled = true;
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, []);

  function skip() {
    if (scene === "done" || skipped) return;
    setSkipped(true);
    setScene("done");
    setStackFading(true);
    Animated.timing(buttonsOpacity, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Upper text area — non-interactive on purpose. */}
        <View
          pointerEvents="none"
          style={{
            flex: 1,
            paddingHorizontal: 32,
            paddingTop: "18%",
            alignItems: "center",
          }}
        >
          {scene === "opener" ? (
            <View style={{ maxWidth: 360, alignItems: "center" }}>
              <AnimatedLine
                text={OPENER_TEXT}
                startDelay={OPENER_PRE_DELAY}
                perChar={OPENER_PER_CHAR}
                italic
                boldRange={OPENER_BOLD_RANGE}
                fontSize={30}
              />
            </View>
          ) : null}

          {scene === "phrases" ? (
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                alignItems: "center",
                gap: 14,
              }}
            >
              {PHRASES.slice(0, phrasesShown).map((phrase, i) => (
                <AnimatedLine
                  key={`${i}-${phrase}`}
                  text={phrase}
                  startDelay={0}
                  perChar={PHRASE_PER_CHAR}
                  italic
                  fontSize={26}
                  fadeOut={stackFading}
                />
              ))}
            </View>
          ) : null}

          {scene === "wordmark" || scene === "done" ? (
            <View style={{ alignItems: "center" }}>
              {/* Wordmark — "Vendor" upright + italic "a" */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "baseline",
                }}
              >
                <AnimatedLine
                  text="Vendor"
                  startDelay={WORDMARK_PRE_DELAY}
                  perChar={WORDMARK_PER_CHAR}
                  bold
                  fontSize={86}
                  letterSpacing={-3.5}
                  immediate={skipped}
                />
                <AnimatedChar
                  char="a"
                  delay={WORDMARK_PRE_DELAY + 6 * WORDMARK_PER_CHAR}
                  italic
                  bold
                  fontSize={86}
                  letterSpacing={-3.5}
                  immediate={skipped}
                />
              </View>
              <View style={{ marginTop: 20 }}>
                <AnimatedLine
                  text={TAGLINE}
                  startDelay={
                    skipped
                      ? 0
                      : WORDMARK_PRE_DELAY +
                        7 * WORDMARK_PER_CHAR +
                        WORDMARK_HOLD
                  }
                  perChar={TAGLINE_PER_CHAR}
                  italic
                  fontSize={16}
                  color={INK_DIM}
                  immediate={skipped}
                />
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      {/* Floating auth pills — anchored absolutely so the SafeAreaView
          above can't squeeze them out. zIndex 40 mirrors the design. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 22,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom + 56, 64),
          alignItems: "center",
          zIndex: 40,
        }}
      >
        <Pressable
          onPress={() => router.push("/(auth)/signup")}
          style={{
            width: "88%",
            maxWidth: 320,
            height: 54,
            borderRadius: 999,
            backgroundColor: INK,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: INK,
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              color: CREAM,
              fontSize: 17,
              fontWeight: "600",
              fontFamily: SERIF,
            }}
          >
            Sign up
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/(auth)/login")}
          style={{
            width: "88%",
            maxWidth: 320,
            height: 54,
            borderRadius: 999,
            backgroundColor: CREAM_DEEP,
            borderWidth: 1,
            borderColor: INK_BORDER,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: INK,
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 3,
          }}
        >
          <Text
            style={{
              color: INK,
              fontSize: 17,
              fontWeight: "600",
              fontFamily: SERIF,
            }}
          >
            Sign in
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

