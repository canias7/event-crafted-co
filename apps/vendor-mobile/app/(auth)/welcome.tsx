// Welcome / auth-method picker.
//
// Static by design. This screen previously ran a ~15s character-by-character
// intro across three scenes; the per-glyph reveal read as laggy on device no
// matter how it was tuned (fade-and-rise, then typewriter), and it delayed
// the only thing a vendor actually came here to do. The sequence is gone —
// the screen is what it used to spend fifteen seconds arriving at.
//
// Layout: crisp event photography across the top, dissolving into the page
// colour, then wordmark, tagline, three value pillars, and the auth pills.

import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Page colour. Must match the colour the hero asset's baked gradient resolves
// to at its lower edge (rgba(13,15,19,1)) exactly — a near-miss shows up as a
// visible seam where the photo dissolves.
const PAGE = "#0d0f13";
const INK_ON_GOLD = "#14161a";
const WHITE = "#ffffff";
const MUTED = "rgba(255,255,255,0.72)";
const GOLD = "#d9bd82";
const HAIRLINE = "rgba(255,255,255,0.14)";

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

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Photo height from the asset's own 900x860 aspect, so it's never stretched.
  const photoHeight = width * (860 / 900);
  // The wordmark is one Text (not per-character any more), so RN can shrink it
  // itself — adjustsFontSizeToFit handles narrow screens without the measure-
  // and-scale dance the animated version needed.
  const wordmarkSize = Math.min(64, width * 0.155);

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <Image
        source={require("../../assets/welcome-hero.jpg")}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: photoHeight,
        }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />

      {/* Scrollable so the content can't be clipped on short screens — the
          pillars plus two pills plus legal text is a tall stack. */}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-end",
          paddingTop: photoHeight * 0.62,
          paddingBottom: Math.max(insets.bottom + 20, 32),
          paddingHorizontal: 26,
        }}
        showsVerticalScrollIndicator={false}
      >
        <MaterialCommunityIcons
          name="star-four-points"
          size={26}
          color={WHITE}
          style={{ alignSelf: "center", marginBottom: 6 }}
        />

        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            fontFamily: SERIF,
            fontSize: wordmarkSize,
            lineHeight: wordmarkSize * 1.12,
            color: WHITE,
            textAlign: "center",
            letterSpacing: -0.5,
          }}
        >
          Vendora
        </Text>

        <View style={{ marginTop: 10 }}>
          {TAGLINE_LINES.map((line) => (
            <Text
              key={line}
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 19,
                lineHeight: 27,
                color: GOLD,
                textAlign: "center",
              }}
            >
              {line}
            </Text>
          ))}
        </View>

        {/* Three value pillars, split by hairlines. */}
        <View style={{ flexDirection: "row", marginTop: 30 }}>
          {PILLARS.map((p, i) => (
            <View
              key={p.title}
              style={{
                flex: 1,
                alignItems: "center",
                paddingHorizontal: 8,
                borderLeftWidth: i === 0 ? 0 : 1,
                borderLeftColor: HAIRLINE,
              }}
            >
              <MaterialCommunityIcons name={p.icon} size={26} color={GOLD} />
              <Text
                style={{
                  color: GOLD,
                  fontSize: 13,
                  fontWeight: "600",
                  textAlign: "center",
                  marginTop: 10,
                }}
              >
                {p.title}
              </Text>
              <Text
                style={{
                  color: MUTED,
                  fontSize: 12,
                  lineHeight: 17,
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                {p.body}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => router.push("/(auth)/signup")}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 34,
            height: 56,
            borderRadius: 999,
            backgroundColor: GOLD,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: INK_ON_GOLD, fontSize: 17, fontWeight: "600" }}>
            Sign up
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/(auth)/login")}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 12,
            height: 56,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.35)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: WHITE, fontSize: 17, fontWeight: "600" }}>
            Sign in
          </Text>
        </Pressable>

        {/* No social-auth row: Google / Apple / Facebook sign-in isn't
            implemented anywhere in this project (mobile or web), and rendering
            buttons that do nothing is worse than omitting them — Apple also
            rejects non-functional UI. Adding it is real work: OAuth clients per
            provider, redirect handling, and Apple requires Sign in with Apple
            once any other third-party option is offered. */}

        <Text
          style={{
            color: MUTED,
            fontSize: 12,
            lineHeight: 18,
            textAlign: "center",
            marginTop: 22,
          }}
        >
          By continuing, you agree to our{" "}
          <Text
            style={{ color: GOLD }}
            onPress={() => void Linking.openURL(TERMS_URL)}
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={{ color: GOLD }}
            onPress={() => void Linking.openURL(PRIVACY_URL)}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
  );
}
