// What's new — in-app changelog reached from More → "Upcoming updates".
// Static content maintained alongside releases: SHIPPED gets a new entry
// whenever something vendor-visible lands; COMING is a light teaser list
// (kept vague on purpose — no dates, no promises).

import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Wordmark } from "@/components/Wordmark";
import { COMING, SHIPPED } from "@vendora/core";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const BORDER = "#e6e1d5";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const GOLD = "#c9a86a";
// Bronze — the gold that stays legible as text or a meaningful icon
// on a cream surface (4.51:1, vs champagne's 2.15:1). Ornamental
// gold stays GOLD. See packages/core/src/tokens.js.
const GOLD_INK = "#8a6f3e";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Content lives in @vendora/core so the app and the website can never
// show a different release history. Re-exported here because more.tsx
// imports hasFreshUpdate from this screen.
export { COMING, LATEST_UPDATE_AT, SHIPPED, hasFreshUpdate } from "@vendora/core";

export default function UpdatesScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 130 }}
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
            marginTop: 14,
            fontFamily: SERIF,
            fontSize: 38,
            fontWeight: "700",
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          What&rsquo;s new
        </Text>
        <Text style={{ marginTop: 4, fontSize: 14.5, color: INK_DIM }}>
          The latest improvements to Vendora for Vendors.
        </Text>

        <View style={{ marginTop: 22, gap: 12 }}>
          {SHIPPED.map((u) => (
            <View
              key={u.title}
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
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1,
                  color: GOLD_INK,
                  textTransform: "uppercase",
                }}
              >
                {u.date}
              </Text>
              <Text
                style={{
                  marginTop: 5,
                  fontFamily: SERIF,
                  fontSize: 18,
                  fontWeight: "700",
                  color: INK,
                }}
              >
                {u.title}
              </Text>
              <Text style={{ marginTop: 5, fontSize: 14, lineHeight: 20, color: INK_DIM }}>
                {u.body}
              </Text>
            </View>
          ))}
        </View>

        <Text
          style={{
            marginTop: 28,
            fontFamily: SERIF,
            fontSize: 22,
            fontWeight: "700",
            color: INK,
          }}
        >
          Coming next
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
              <MaterialCommunityIcons name="star-four-points-outline" size={16} color={GOLD} />
              <Text style={{ marginLeft: 10, fontSize: 14.5, color: INK }}>{c}</Text>
            </View>
          ))}
        </View>
        <Text style={{ marginTop: 10, fontSize: 12, color: INK_DIM }}>
          Timelines shift — we ship when it&rsquo;s right.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
