// What's new — in-app changelog reached from More → "Upcoming updates".
// Static content maintained alongside releases: SHIPPED gets a new entry
// whenever something vendor-visible lands; COMING is a light teaser list
// (kept vague on purpose — no dates, no promises).

import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Wordmark } from "@/components/Wordmark";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";

const PAGE = C.page;
const CARD = C.card;
const BORDER = C.border;
const INK = C.text;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.textDim;
const GOLD = C.gold;
// Champagne bronze — the landing page's text accent. #c9a86a is
// reserved for fills and glyphs; as words on cream it only reaches
// 2:1, so every gold *label* uses this instead.
const BRONZE = C.accentText;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// Newest first. `month` (YYYY-MM) is display-only, shown as "August 2026"
// in the app's language; title and body live in locales/<lang>/updates.ts
// under shipped.<key>.
export const SHIPPED: { month: string; key: string }[] = [
  { month: "2026-08", key: "verification" },
  { month: "2026-08", key: "crm" },
  { month: "2026-08", key: "scheduling" },
  { month: "2026-08", key: "listingForms" },
  { month: "2026-08", key: "freshLook" },
  { month: "2026-08", key: "listingControl" },
];

// Labels live in locales/<lang>/updates.ts under coming.<key>.
export const COMING: string[] = [
  "androidPopups",
  "standOut",
  "hostApp",
  "websiteDesign",
];

// The More row shows a "New" badge while the latest entry is fresh.
// Bump this date when adding a SHIPPED entry.
export const LATEST_UPDATE_AT = "2026-08-19";

export function hasFreshUpdate(): boolean {
  const ms = Date.now() - new Date(LATEST_UPDATE_AT).getTime();
  return ms < 21 * 24 * 3600_000;
}

export default function UpdatesScreen() {
  const router = useRouter();
  const { t, locale } = useT("updates");
  const monthLabel = (ym: string) =>
    new Date(`${ym}-15T12:00:00`).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark />
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="x" size={17} color={INK} />
          </Pressable>
        </View>
        <Text
          style={{
            marginTop: 16,
            fontFamily: SERIF_BOLD,
            fontSize: 38,
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          {t("title")}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
          {t("subtitle")}
        </Text>

        <View style={{ marginTop: 24, gap: 12 }}>
          {SHIPPED.map((u) => (
            <View
              key={u.key}
              style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 20,
                padding: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: BRONZE,
                  textTransform: "uppercase",
                }}
              >
                {monthLabel(u.month)}
              </Text>
              <Text
                style={{
                  marginTop: 5,
                  fontFamily: SERIF_BOLD,
                  fontSize: 18,
                  color: INK,
                }}
              >
                {t(`shipped.${u.key}.title`)}
              </Text>
              <Text style={{ fontFamily: SERIF, marginTop: 5, fontSize: 14, lineHeight: 20, color: INK_DIM }}>
                {t(`shipped.${u.key}.body`)}
              </Text>
            </View>
          ))}
        </View>

        <Text
          style={{
            marginTop: 32,
            fontFamily: SERIF_BOLD,
            fontSize: 20,
            color: INK,
          }}
        >
          {t("comingTitle")}
        </Text>
        <View
          style={{
            marginTop: 10,
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 6,
          }}
        >
          {COMING.map((c, i) => (
            <View
              key={c}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: BORDER,
              }}
            >
              {/* Plain gold dot rather than a star: this repeats once
                  per change line, and a column of sparkles reads as
                  decoration instead of as a list. */}
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: GOLD,
                  marginLeft: 5,
                }}
              />
              <Text style={{ fontFamily: SERIF, marginLeft: 10, fontSize: 14, color: INK, flexShrink: 1 }}>
                {t(`coming.${c}`)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: SERIF, marginTop: 10, fontSize: 12, color: INK_DIM }}>
          {t("footnote")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
