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
// botanical divider, three value cards, and the auth pills.

import {
  Image,
  Linking,
  Platform,
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

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

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

const BADGE = 86;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Hero height from the asset's own 1800:1057 aspect so it's never
  // stretched. Shipped at 1800px wide, so no phone upscales it.
  const heroHeight = Math.round(width * (1057 / 1800));
  // One Text (not per-character any more), so RN can shrink it itself —
  // adjustsFontSizeToFit handles narrow screens.
  const wordmarkSize = Math.min(60, width * 0.148);

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom + 20, 32),
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
                width: 42,
                height: 42,
                tintColor: GOLD,
                resizeMode: "contain",
              }}
            />
          </View>

          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              marginTop: 14,
              fontFamily: SERIF,
              fontSize: wordmarkSize,
              lineHeight: wordmarkSize * 1.12,
              color: INK,
              textAlign: "center",
              letterSpacing: -0.5,
            }}
          >
            Vendora
          </Text>

          <View style={{ marginTop: 8 }}>
            {TAGLINE_LINES.map((line) => (
              <Text
                key={line}
                style={{
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontSize: 19,
                  lineHeight: 27,
                  color: BRONZE,
                  textAlign: "center",
                }}
              >
                {line}
              </Text>
            ))}
          </View>

          {/* Botanical divider — separates the brand from the features. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 20,
              marginBottom: 22,
            }}
          >
            <View style={{ width: 62, height: 1, backgroundColor: BORDER }} />
            <MaterialCommunityIcons
              name="leaf"
              size={17}
              color={GOLD}
              style={{ marginHorizontal: 12 }}
            />
            <View style={{ width: 62, height: 1, backgroundColor: BORDER }} />
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
                borderRadius: 18,
                padding: 14,
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 15,
                  backgroundColor: SURFACE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialCommunityIcons name={p.icon} size={24} color={BRONZE} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text
                  style={{
                    color: INK,
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  {p.title}
                </Text>
                <Text
                  style={{
                    color: INK_DIM,
                    fontSize: 13.5,
                    lineHeight: 19,
                    marginTop: 2,
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
              marginTop: 22,
              height: 56,
              borderRadius: 999,
              backgroundColor: GOLD,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: INK, fontSize: 17, fontWeight: "700" }}>
              Sign up
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            accessibilityRole="button"
            activeOpacity={0.7}
            style={{
              marginTop: 12,
              height: 56,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: GOLD,
              backgroundColor: CARD,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: INK, fontSize: 17, fontWeight: "700" }}>
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
              color: INK_DIM,
              fontSize: 12,
              lineHeight: 18,
              textAlign: "center",
              marginTop: 20,
            }}
          >
            By continuing, you agree to our{" "}
            <Text
              style={{ color: BRONZE, fontWeight: "600" }}
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={{ color: BRONZE, fontWeight: "600" }}
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
