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
import { SafeAreaView } from "react-native-safe-area-context";

const CREAM = "#faf5ec";
const CREAM_DEEP = "#f5efe5";
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

export default function WelcomeScreen() {
  const router = useRouter();
  const [scene, setScene] = useState<Scene>("opener");
  const [phrasesShown, setPhrasesShown] = useState(0);
  const [stackFading, setStackFading] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

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
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    });

    return () => {
      cancelled = true;
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [buttonsOpacity]);

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

  function comingSoon(provider: string) {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const _ = provider;
    /* eslint-enable @typescript-eslint/no-unused-vars */
  }

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* Tap-to-skip overlay; only active during the intro. */}
      {scene !== "done" ? (
        <Pressable
          onPress={skip}
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
        />
      ) : null}

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View
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

      {/* Auth-method sheet docked to the bottom. A black rounded panel
          containing four buttons — same shape as the ChatGPT-style
          entry the user sent as the reference. */}
      <Animated.View
        pointerEvents={scene === "done" ? "auto" : "none"}
        style={{
          opacity: buttonsOpacity,
          paddingHorizontal: 12,
          paddingBottom: 16,
        }}
      >
        <View
          style={{
            backgroundColor: "#000",
            borderRadius: 28,
            padding: 10,
          }}
        >
          <Pressable
            onPress={() => comingSoon("Apple")}
            style={({ pressed }) => ({
              backgroundColor: "#ffffff",
              paddingVertical: 16,
              borderRadius: 22,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
              marginBottom: 8,
            })}
          >
            <Text
              style={{
                color: "#000000",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
               Continue with Apple
            </Text>
          </Pressable>
          <Pressable
            onPress={() => comingSoon("Google")}
            style={({ pressed }) => ({
              backgroundColor: "#262626",
              paddingVertical: 16,
              borderRadius: 22,
              alignItems: "center",
              opacity: pressed ? 0.75 : 1,
              marginBottom: 8,
            })}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Continue with Google
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(auth)/signup")}
            style={({ pressed }) => ({
              backgroundColor: "#262626",
              paddingVertical: 16,
              borderRadius: 22,
              alignItems: "center",
              opacity: pressed ? 0.75 : 1,
              marginBottom: 8,
            })}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Sign up
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => ({
              paddingVertical: 16,
              borderRadius: 22,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.2)",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Log in
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
