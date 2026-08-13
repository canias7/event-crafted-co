// Brand intro + auth-method picker.
//
// Full-bleed event photography, blurred and dimmed into an atmospheric
// backdrop, with the copy typed on character by character across two scenes
// before landing on the Vendora wordmark, tagline, and value lines. The auth
// pills stay docked at the bottom throughout.
//
// Tap anywhere during the intro to skip straight to the final state.

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// INK is still the text colour on the light "Sign up" pill; the rest of the
// old cream-surface palette went away when this screen moved onto photography.
const INK = "#14161a";

// The welcome screen sits on full-bleed event photography behind a dark
// scrim, so every glyph on it is light. Kept as named tokens rather than
// inline literals so the whole surface stays consistent.
const ON_PHOTO = "#ffffff";
const ON_PHOTO_DIM = "rgba(255,255,255,0.78)";
// Must match the colour the hero asset's baked gradient resolves to at its
// lower edge (rgba(15,17,20,1)) exactly — a near-miss shows up as a visible
// seam where the photo band meets the page.
const PHOTO_BASE = "#0f1114";

// Why the app exists, in the three beats a vendor cares about. Sits between
// the tagline and the auth buttons — previously that band was empty, so the
// first screen never said what Vendora does.
const VALUE_LINES = [
  "Get discovered by event hosts",
  "Manage every booking in one place",
  "Get paid securely",
];

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Per-character timing (ms).
//
// These were ported straight from the HTML prototype and totalled roughly
// 15 seconds before the auth buttons were the only thing left moving —
// long enough that the sequence read as sluggish, and long enough that the
// value lines (which follow the tagline) were effectively never seen. Roughly
// halved: the per-character cadence is quicker and, more importantly, the
// dead holds between steps are much shorter. The letter-level motion itself
// is unchanged — that's tuned in AnimatedChar.
const OPENER_PER_CHAR = 32;
const PHRASE_PER_CHAR = 26;
const WORDMARK_PER_CHAR = 80;
const TAGLINE_PER_CHAR = 26;

// Pause durations between sequence steps.
const OPENER_PRE_DELAY = 300;
const OPENER_HOLD = 700;
const PHRASE_HOLD_BETWEEN = 250;
const STACK_HOLD_AFTER = 500;
const STACK_FADE = 500;
const WORDMARK_PRE_DELAY = 150;
const WORDMARK_HOLD = 400;
const TAGLINE_HOLD = 500;

const OPENER_TEXT = "The night is fine when the people align.";
// 30..36 = "people" — rendered bold instead of italic on that range.
const OPENER_BOLD_RANGE: [number, number] = [30, 36];

const PHRASES = [
  "A florist with taste.",
  "A photographer to chase.",
  "A night without waste.",
];

const TAGLINE = "for those who plan, and those who craft.";

// Shrinks its content to fit the screen when it would otherwise overflow.
//
// The wordmark and intro lines render one <Text> per character so each can
// animate independently, which means React Native can't shrink or re-flow
// them the way it would a single Text — an over-wide line just runs off the
// edge. A first attempt sized the wordmark from an estimated glyph-width
// ratio and still clipped, because the Android serif fallback is wider than
// the estimate. Measuring the laid-out row is exact, so this replaces the
// guess entirely.
//
// Scale is applied as a transform, which doesn't feed back into layout, and
// latches once so measurement can't oscillate.
function FitRow({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  const availableRef = useRef(0);
  const settledRef = useRef(false);

  return (
    <View
      style={{ width: "100%", alignItems: "center" }}
      onLayout={(e) => {
        availableRef.current = e.nativeEvent.layout.width;
      }}
    >
      <View
        onLayout={(e) => {
          const contentWidth = e.nativeEvent.layout.width;
          const available = availableRef.current;
          if (settledRef.current || !available || contentWidth <= 0) return;
          if (contentWidth > available) {
            settledRef.current = true;
            setScale(available / contentWidth);
          }
        }}
        style={{ transform: [{ scale }] }}
      >
        {children}
      </View>
    </View>
  );
}

// The three value beats, revealed together after the intro settles.
function ValueLines({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    // Native-scheduled delay, same reasoning as AnimatedChar: a JS timer here
    // would fire late while the intro is still mounting glyphs.
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        delay,
        duration: 620,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        delay,
        duration: 780,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View
      style={{
        marginTop: 28,
        gap: 10,
        opacity,
        transform: [{ translateY }],
      }}
    >
      {VALUE_LINES.map((line) => (
        <View
          key={line}
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: ON_PHOTO,
              opacity: 0.85,
            }}
          />
          <Text
            style={{
              color: ON_PHOTO_DIM,
              fontSize: 14.5,
              letterSpacing: 0.1,
            }}
          >
            {line}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
}

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
  color = ON_PHOTO,
  letterSpacing = 0,
  immediate,
}: AnimatedCharProps) {
  // Typewriter reveal: each glyph simply appears when its turn comes.
  //
  // This replaces a fade-and-rise per character, which kept reading as the
  // letters "lagging" rather than settling. The cause was structural, not a
  // tuning problem: with an ~880ms travel against an ~80ms stagger, a dozen
  // glyphs were in flight at once, each at a different vertical offset, so
  // the line never looked like a line until the whole thing finished. A hard
  // cut has no in-between state that can look wrong — and it's what typing
  // actually looks like.
  //
  // 60ms is quick enough to read as instant without a harsh pop. Still driven
  // by Animated's own delay, so the cadence stays exact under JS-thread load.
  const opacity = useRef(new Animated.Value(immediate ? 1 : 0)).current;

  useEffect(() => {
    if (immediate) return;
    const anim = Animated.timing(opacity, {
      toValue: 1,
      delay,
      duration: 60,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    anim.start();
    return () => anim.stop();
  }, [delay, immediate, opacity]);

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
  /** Keep on one line. Pair with FitRow so it scales down instead of
   *  overflowing — otherwise a long line wraps and, because each glyph is its
   *  own Text, the break can land inside a word ("an / d those wh"). */
  nowrap?: boolean;
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
  nowrap,
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
        flexWrap: nowrap ? "nowrap" : "wrap",
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
  const { width: screenWidth } = useWindowDimensions();
  // Wordmark size. 0.21 of the viewport measured out to almost exactly the
  // full screen width on device — technically un-clipped, but touching both
  // edges with no breathing room, and it made FitRow fire on every launch
  // (render big, then visibly snap smaller, which read as broken). 0.175
  // lands the lockup at roughly 85% width, so it has margins and FitRow
  // stays a silent backstop instead of part of the normal path.
  const wordmarkSize = Math.min(78, screenWidth * 0.175);
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
    <View style={{ flex: 1, backgroundColor: PHOTO_BASE }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Photography as a top band, not full-bleed.
          Every hero in the asset library is 1920x1080 — landscape, so filling
          a ~9:20 screen only reveals about a quarter of the source width and
          magnifies it. Rather than fight that with a band (which read as the
          photo covering half the page), the asset is exported blurred and
          heavily dimmed: at that point it's atmosphere rather than a photo
          you study, the upscaling doesn't show, and text is legible anywhere
          on it. */}
      <Image
        source={require("../../assets/welcome-hero.jpg")}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      {/* No scrim view here on purpose: the darkening ramp is baked into the
          asset itself. Stacking translucent Views to fake a gradient left
          visible horizontal seams on device, and expo-linear-gradient is a
          native module that would cost a rebuild plus an App Store review. */}

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Upper text area — non-interactive on purpose. */}
        <View
          pointerEvents="none"
          style={{
            flex: 1,
            paddingHorizontal: 32,
            alignItems: "center",
            // Centred on the full-bleed background, biased up by the height of
            // the auth pills so the block sits optically centred rather than
            // crowding them.
            justifyContent: "center",
            paddingBottom: 140,
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
              <FitRow>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "baseline",
                    paddingHorizontal: 16,
                  }}
                >
                  <AnimatedLine
                    text="Vendor"
                    startDelay={WORDMARK_PRE_DELAY}
                    perChar={WORDMARK_PER_CHAR}
                    bold
                    fontSize={wordmarkSize}
                    letterSpacing={-3.5}
                    immediate={skipped}
                  />
                  <AnimatedChar
                    char="a"
                    delay={WORDMARK_PRE_DELAY + 6 * WORDMARK_PER_CHAR}
                    italic
                    bold
                    fontSize={wordmarkSize}
                    letterSpacing={-3.5}
                    immediate={skipped}
                  />
                </View>
              </FitRow>
              {/* nowrap + FitRow keeps the tagline on one line. Left to wrap
                  it broke inside a word ("...plan, an / d those wh"), because
                  each glyph is its own Text and the row wraps between them. */}
              <View style={{ marginTop: 20 }}>
                <FitRow>
                <AnimatedLine
                  text={TAGLINE}
                  nowrap
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
                  color={ON_PHOTO_DIM}
                  immediate={skipped}
                />
                </FitRow>
              </View>

              {/* Value lines follow the tagline directly.
                  They were previously gated on scene === "done", which only
                  arrives after the full ~14s intro plus a hold — so in
                  practice nobody ever saw them. Timing off the tagline
                  instead means they land as part of the sequence and are on
                  screen well before the timeline finishes. */}
              <ValueLines
                delay={
                  skipped
                    ? 0
                    : WORDMARK_PRE_DELAY +
                      7 * WORDMARK_PER_CHAR +
                      WORDMARK_HOLD +
                      TAGLINE.length * TAGLINE_PER_CHAR +
                      250
                }
              />
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
        {/* Primary inverts on photo: solid white reads as the brightest
            thing on a dark scrim, so it stays the obvious first action. */}
        <Pressable
          onPress={() => router.push("/(auth)/signup")}
          style={{
            width: "88%",
            maxWidth: 320,
            height: 54,
            borderRadius: 999,
            backgroundColor: ON_PHOTO,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000000",
            shadowOpacity: 0.3,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
            marginBottom: 10,
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
            Sign up
          </Text>
        </Pressable>

        {/* Secondary is a translucent glass pill — the photo shows through,
            which keeps the hierarchy clear without a second solid slab. */}
        <Pressable
          onPress={() => router.push("/(auth)/login")}
          style={{
            width: "88%",
            maxWidth: 320,
            height: 54,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.14)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: ON_PHOTO,
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

