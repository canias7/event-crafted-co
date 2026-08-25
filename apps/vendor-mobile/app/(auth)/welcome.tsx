// Welcome / auth-method picker.
//
// Static by design. This screen previously ran a ~15s character-by-character
// intro across three scenes; the per-glyph reveal read as laggy on device no
// matter how it was tuned (fade-and-rise, then typewriter), and it delayed
// the only thing a vendor actually came here to do. The sequence is gone —
// the screen is what it used to spend fifteen seconds arriving at.
//
// Light theme. This screen used to be near-black (#0d0f13) with a dark hero
// whose baked gradient dissolved into the page colour. The whole auth flow now
// matches the cream design system the rest of the app uses, so the hero is a
// bright, warm photo in a rounded band with a hard bottom edge — no baked
// fade to line up with, and no seam to get wrong.
//
// Layout: hero band, logo badge straddling its lower edge, wordmark, tagline,
// gold divider, three value cards, and the auth pills.
//
// Fits one screen, no scrolling. Everything below the hero is fixed
// height by design, so the hero absorbs whatever is left over — on a
// tall phone it gets its natural aspect, on a short one it shrinks
// rather than pushing the buttons off the bottom. The ScrollView stays
// as a safety net for very small devices and large accessibility text.
//
// Typography: the whole screen is serif. Hierarchy comes from size and
// weight rather than from switching typeface, so the brand voice carries
// all the way down the page instead of stopping at the tagline. Only
// works because this is a marketing page with very little text — the
// signed-in app stays sans, where serif at 13-14pt would cost legibility.

import {
  Image,
  Linking,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// Cream design-system tokens — same values as the signed-in app.
const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const BORDER = "#e6e1d5";
const GOLD = "#c9a86a";
const BRONZE = "#8a6f3e";

const TAGLINE_LINES = ["for those who plan,", "and those who shine."];

// There are no in-app legal screens, so these open the live web pages the
// same documents are published at.
const TERMS_URL = "https://eventvendora.com/terms";
const PRIVACY_URL = "https://eventvendora.com/privacy";

const PILLARS = [
  {
    icon: "calendar-check-outline",
    title: "Plan with ease",
    body: "Organize every detail beautifully.",
  },
  {
    icon: "account-group-outline",
    title: "Find trusted pros",
    body: "Connect with verified vendors you can trust.",
  },
  {
    icon: "star-four-points-outline",
    title: "Create unforgettable",
    body: "Bring your vision to life seamlessly.",
  },
] as const;

const BADGE = 72;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Height of everything under the hero, measured from the rendered
  // screen. The hero takes the remainder so the page never scrolls.
  const available = height - insets.top - insets.bottom;
  // Short phones (iPhone SE and friends) cannot fit the roomy layout no
  // matter how small the hero gets, so everything below it steps down a
  // size rather than the page starting to scroll.
  const compact = available < 720;
  // Measured from the rendered screen, not estimated.
  const BELOW_HERO = compact ? 560 : 566;
  // Natural aspect (asset is 1800x1057) is the ceiling — never upscale
  // or stretch it; 132 is the floor before the band stops reading as a
  // photo.
  const heroHeight = Math.max(
    compact ? 104 : 132,
    Math.min(Math.round(width * (1057 / 1800)), available - BELOW_HERO),
  );
  // One Text (not per-character any more), so RN can shrink it itself —
  // adjustsFontSizeToFit handles narrow screens.
  const wordmarkSize = Math.min(compact ? 40 : 46, width * (compact ? 0.108 : 0.118));

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom + 8, 16),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero band. Explicit numeric width AND height — nothing else. This
            style has failed on device in fancier forms: with left+right:0 the
            width constraint was dropped and the image laid out at its
            intrinsic size, and aspectRatio fared no better. The styling
            interop on this screen demonstrably mishandles derived
            constraints, so the image box stays plain numbers. */}
        <View
          style={{
            width: width,
            height: heroHeight,
            borderBottomLeftRadius: 34,
            borderBottomRightRadius: 34,
            overflow: "hidden",
            backgroundColor: SURFACE,
          }}
        >
          <Image
            source={require("../../assets/welcome-hero-light.jpg")}
            style={{ width: width, height: heroHeight }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>

        <View style={{ paddingHorizontal: 26 }}>
          {/* Logo badge straddling the hero's lower edge. */}
          <View
            style={{
              alignSelf: "center",
              marginTop: -(BADGE / 2),
              width: BADGE,
              height: BADGE,
              borderRadius: BADGE / 2,
              backgroundColor: CARD,
              borderWidth: 1.5,
              borderColor: GOLD,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              source={require("../../assets/v-mark.png")}
              style={{
                width: 36,
                height: 36,
                tintColor: GOLD,
                resizeMode: "contain",
              }}
            />
          </View>

          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              marginTop: 10,
              fontFamily: SERIF,
              fontSize: wordmarkSize,
              lineHeight: wordmarkSize * 1.1,
              color: INK,
              textAlign: "center",
              letterSpacing: -0.5,
            }}
          >
            Vendora
          </Text>

          <View style={{ marginTop: 6 }}>
            {TAGLINE_LINES.map((line) => (
              <Text
                key={line}
                style={{
                  fontFamily: SERIF,
                  fontSize: compact ? 13.5 : 15,
                  lineHeight: compact ? 19 : 21,
                  color: BRONZE,
                  textAlign: "center",
                }}
              >
                {line}
              </Text>
            ))}
          </View>

          {/* Divider — the same gold ✦ every other auth screen uses. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: compact ? 9 : 13,
              marginBottom: compact ? 11 : 15,
            }}
          >
            <View style={{ width: 54, height: 1, backgroundColor: BORDER }} />
            <MaterialCommunityIcons
              name="star-four-points"
              size={16}
              color={GOLD}
              style={{ marginHorizontal: 12 }}
            />
            <View style={{ width: 54, height: 1, backgroundColor: BORDER }} />
          </View>

          {/* Three value cards. No chevrons: these are informational, and a
              chevron that navigates nowhere is the non-functional UI Apple
              rejects (same reason there's no social-auth row below). */}
          {PILLARS.map((p) => (
            <View
              key={p.title}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 16,
                padding: compact ? 9 : 11,
                marginBottom: compact ? 6 : 8,
              }}
            >
              <View
                style={{
                  width: compact ? 36 : 42,
                  height: compact ? 36 : 42,
                  borderRadius: compact ? 11 : 13,
                  backgroundColor: SURFACE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialCommunityIcons name={p.icon} size={compact ? 18 : 21} color={BRONZE} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    color: INK,
                    fontSize: 18,
                  }}
                >
                  {p.title}
                </Text>
                <Text
                  style={{
                    fontFamily: SERIF,
                    color: INK_DIM,
                    fontSize: compact ? 11.5 : 12.5,
                    lineHeight: compact ? 15 : 17,
                    marginTop: 1,
                  }}
                >
                  {p.body}
                </Text>
              </View>
            </View>
          ))}

          {/* Plain style objects only — NOT the function form. NativeWind's
              global component interop silently discarded function-form style
              props on device: the pills rendered as bare unstyled text while
              every statically-styled sibling was fine. TouchableOpacity gives
              the press feedback the function form existed for. */}
          <TouchableOpacity
            onPress={() => router.push("/(auth)/signup")}
            accessibilityRole="button"
            activeOpacity={0.85}
            style={{
              marginTop: compact ? 12 : 16,
              height: compact ? 46 : 52,
              borderRadius: 999,
              backgroundColor: INK,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 16}}>
              Sign up
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            accessibilityRole="button"
            activeOpacity={0.7}
            style={{
              marginTop: compact ? 8 : 10,
              height: compact ? 46 : 52,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: INK,
              backgroundColor: CARD,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 16}}>
              Sign in
            </Text>
          </TouchableOpacity>

          {/* No social-auth row: Google / Apple / Facebook sign-in isn't
              implemented anywhere in this project (mobile or web), and
              rendering buttons that do nothing is worse than omitting them —
              Apple also rejects non-functional UI. Adding it is real work:
              OAuth clients per provider, redirect handling, and Apple requires
              Sign in with Apple once any other third-party option is
              offered. */}

          <Text
            style={{
              fontFamily: SERIF,
              color: INK_DIM,
              fontSize: compact ? 10.5 : 11.5,
              lineHeight: compact ? 14 : 16,
              textAlign: "center",
              marginTop: compact ? 9 : 12,
            }}
          >
            By continuing, you agree to our{" "}
            <Text
              style={{ fontFamily: SERIF_BOLD, color: BRONZE}}
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={{ fontFamily: SERIF_BOLD, color: BRONZE}}
              onPress={() => void Linking.openURL(PRIVACY_URL)}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
