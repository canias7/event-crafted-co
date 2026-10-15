// Welcome / auth-method picker.
//
// Static by design. This screen previously ran a ~15s character-by-character
// intro across three scenes; the per-glyph reveal read as laggy on device no
// matter how it was tuned (fade-and-rise, then typewriter), and it delayed
// the only thing a vendor actually came here to do. The sequence is gone —
// the screen is what it used to spend fifteen seconds arriving at.
//
// Dark, like the website's home page (owner's call, Oct 2026): the site's
// hero photo (the sunset reception) fills the screen, dimmed by the same two
// scrims the web uses — a top-to-bottom shade, darkest at the bottom where
// the cards and buttons sit, and a vignette that darkens the edges. Text is
// cream, accents champagne, and the cards are see-through (white at 6% with a
// white-at-15% hairline), as on the dark public pages.
//
// Layout: logo badge, wordmark and tagline in the upper part of the screen;
// gold divider, three value cards and the auth pills at the bottom. Fits one
// screen; the ScrollView stays as a safety net for very small devices and
// large accessibility text.
//
// Typography: the whole screen is serif. Hierarchy comes from size and
// weight rather than from switching typeface.

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
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { LanguagePicker } from "@/components/LanguagePicker";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

// Dark-page tokens, as on the website's dark public pages.
const INK = "#14161a";
const CREAM = "#f4f1ea";
const CREAM_DIM = "rgba(244,241,234,0.8)";
const GOLD = "#c9a86a";
const HAIRLINE = "rgba(255,255,255,0.15)";
const GLASS = "rgba(255,255,255,0.06)";

// There are no in-app legal screens, so these open the live web pages the
// same documents are published at.
const TERMS_URL = "https://eventvendora.com/terms";
const PRIVACY_URL = "https://eventvendora.com/privacy";

// Card text lives in locales/<lang>/welcome.ts under pillars.<key>.
const PILLARS = [
  { key: "plan", icon: "calendar-check-outline" },
  { key: "pros", icon: "account-group-outline" },
  { key: "create", icon: "star-four-points-outline" },
] as const;

const BADGE = 72;

export default function WelcomeScreen() {
  const router = useRouter();
  const { t, tObject } = useT("welcome");
  const taglineLines = tObject<string[]>("tagline") ?? [];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const available = height - insets.top - insets.bottom;
  // Short phones (iPhone SE and friends) step everything down a size rather
  // than starting to scroll.
  const compact = available < 720;
  const wordmarkSize = Math.min(compact ? 40 : 46, width * (compact ? 0.108 : 0.118));

  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Backdrop: the photo, then the web hero's two scrims. Plain numeric
          sizes only — the styling interop on this screen has mishandled
          derived constraints (left/right: 0, aspectRatio) on device. */}
      <Image
        source={require("../../assets/welcome-hero.jpg")}
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <Svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0a0b0e" stopOpacity={0.62} />
            <Stop offset="0.36" stopColor="#0a0b0e" stopOpacity={0.4} />
            <Stop offset="0.6" stopColor="#0a0b0e" stopOpacity={0.72} />
            <Stop offset="1" stopColor="#100e0a" stopOpacity={0.94} />
          </LinearGradient>
          <RadialGradient id="vignette" cx="50%" cy="40%" rx="75%" ry="60%" fx="50%" fy="40%">
            <Stop offset="0.4" stopColor="#08090c" stopOpacity={0} />
            <Stop offset="1" stopColor="#08090c" stopOpacity={0.6} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#shade)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#vignette)" />
      </Svg>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "space-between",
          paddingTop: insets.top + (compact ? 28 : 56),
          paddingBottom: Math.max(insets.bottom + 8, 16),
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View
            style={{
              alignSelf: "center",
              width: BADGE,
              height: BADGE,
              borderRadius: BADGE / 2,
              backgroundColor: "rgba(20,22,26,0.55)",
              borderWidth: 1,
              borderColor: GOLD,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              source={require("../../assets/v-mark.png")}
              style={{ width: 36, height: 36, tintColor: GOLD, resizeMode: "contain" }}
            />
          </View>

          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              marginTop: 12,
              fontFamily: SERIF,
              fontSize: wordmarkSize,
              lineHeight: wordmarkSize * 1.1,
              color: CREAM,
              textAlign: "center",
              letterSpacing: -0.5,
            }}
          >
            Vendora
          </Text>

          <View style={{ marginTop: 6 }}>
            {taglineLines.map((line) => (
              <Text
                key={line}
                style={{
                  fontFamily: SERIF,
                  fontSize: compact ? 13.5 : 15,
                  lineHeight: compact ? 19 : 21,
                  color: GOLD,
                  textAlign: "center",
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          {/* Divider: gold hairlines meeting a ✦. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: compact ? 11 : 16,
            }}
          >
            <View style={{ width: 54, height: 1, backgroundColor: HAIRLINE }} />
            <MaterialCommunityIcons
              name="star-four-points"
              size={16}
              color={GOLD}
              style={{ marginHorizontal: 12 }}
            />
            <View style={{ width: 54, height: 1, backgroundColor: HAIRLINE }} />
          </View>

          {/* Three value cards. No chevrons: these are informational, and a
              chevron that navigates nowhere is the non-functional UI Apple
              rejects (same reason there's no social-auth row below). */}
          {PILLARS.map((p) => (
            <View
              key={p.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: GLASS,
                borderWidth: 1,
                borderColor: HAIRLINE,
                borderRadius: 20,
                padding: compact ? 9 : 11,
                marginBottom: compact ? 6 : 8,
              }}
            >
              <View
                style={{
                  width: compact ? 36 : 42,
                  height: compact ? 36 : 42,
                  borderRadius: 12,
                  backgroundColor: "rgba(201,168,106,0.14)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialCommunityIcons name={p.icon} size={compact ? 18 : 21} color={GOLD} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 18 }}>{t(`pillars.${p.key}.title`)}</Text>
                <Text
                  style={{
                    fontFamily: SERIF,
                    color: CREAM_DIM,
                    fontSize: compact ? 11.5 : 12.5,
                    lineHeight: compact ? 15 : 17,
                    marginTop: 1,
                  }}
                >
                  {t(`pillars.${p.key}.body`)}
                </Text>
              </View>
            </View>
          ))}

          {/* Plain style objects only — NOT the function form. NativeWind's
              global component interop silently discarded function-form style
              props on device. TouchableOpacity gives the press feedback. */}
          <TouchableOpacity
            onPress={() => router.push("/(auth)/signup")}
            accessibilityRole="button"
            activeOpacity={0.85}
            style={{
              marginTop: compact ? 12 : 16,
              height: compact ? 44 : 52,
              borderRadius: 999,
              backgroundColor: GOLD,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 16 }}>{t("signUp")}</Text>
          </TouchableOpacity>

          {/* Secondary on dark: see-through with the white hairline. */}
          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            accessibilityRole="button"
            activeOpacity={0.7}
            style={{
              marginTop: compact ? 8 : 10,
              height: compact ? 44 : 52,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.3)",
              backgroundColor: "rgba(255,255,255,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 16 }}>{t("signIn")}</Text>
          </TouchableOpacity>

          {/* Language: English / Español / Русский, centred under the pills. */}
          <View style={{ alignItems: "center", marginTop: compact ? 10 : 14 }}>
            <LanguagePicker tone="dark" />
          </View>

          {/* No social-auth row: Google / Apple / Facebook sign-in isn't
              implemented anywhere in this project, and buttons that do
              nothing are worse than none (Apple also rejects them). */}

          <Text
            style={{
              fontFamily: SERIF,
              color: CREAM_DIM,
              fontSize: compact ? 10.5 : 11.5,
              lineHeight: compact ? 14 : 16,
              textAlign: "center",
              marginTop: compact ? 9 : 12,
            }}
          >
            {t("legal.before")}
            <Text
              style={{ fontFamily: SERIF_BOLD, color: GOLD }}
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              {t("legal.terms")}
            </Text>
            {t("legal.between")}
            <Text
              style={{ fontFamily: SERIF_BOLD, color: GOLD }}
              onPress={() => void Linking.openURL(PRIVACY_URL)}
            >
              {t("legal.privacy")}
            </Text>
            {t("legal.after")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
