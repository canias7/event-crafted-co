// What's new — in-app changelog reached from More → "Upcoming updates".
// Static content maintained alongside releases: SHIPPED gets a new entry
// whenever something vendor-visible lands; COMING is a light teaser list
// (kept vague on purpose — no dates, no promises).

import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Wordmark } from "@/components/Wordmark";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const BORDER = "#e6e1d5";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const GOLD = "#c9a86a";
// Champagne bronze — the landing page's text accent. #c9a86a is
// reserved for fills and glyphs; as words on cream it only reaches
// 2:1, so every gold *label* uses this instead.
const BRONZE = "#8a6f3e";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// Newest first. `date` is display-only.
export const SHIPPED: { date: string; title: string; body: string }[] = [
  {
    date: "August 2026",
    title: "Get verified — for real this time",
    body: "Pro and Premium vendors can now apply for the verified badge from More → Verification: confirm your identity, add your business info and documents, and our team reviews within 1–3 business days. Approved vendors get the badge on their public profile — plus an Insured marker when a certificate is on file.",
  },
  {
    date: "August 2026",
    title: "Vendora CRM — your client book",
    body: "Pro and Premium vendors get a Clients section under More: every host who's inquired, their events, private notes, and follow-up reminders that ping your phone.",
  },
  {
    date: "August 2026",
    title: "Smart Scheduling & Automations",
    body: "Set your working hours and appointment types in minutes. Pro unlocks the scheduling controls — hours, buffers, minimum notice, daily limits, and up to 5 appointment types. Premium adds the automations: instant inquiry replies, confirmations, reminders, follow-ups, review requests, and Fill Your Calendar alerts — promos only go out with your approval.",
  },
  {
    date: "August 2026",
    title: "A listing form made for your category",
    body: "Venues, catering, entertainment, media, design, beauty, rentals, experiences, corporate services — every category now gets its own tailored Create Listing flow, with custom fields you can add yourself.",
  },
  {
    date: "August 2026",
    title: "A fresh Vendora look",
    body: "Inbox, Gallery, Profile, Calendar, and More all moved to the warm cream design — serif titles, gold accents, and matching dialogs everywhere.",
  },
  {
    date: "August 2026",
    title: "Better control over your listings",
    body: "Delete a listing from anywhere (even while it's under review), save drafts, and get notified by email — and push — when a decision is made.",
  },
];

export const COMING: string[] = [
  "Pop-up notifications on Android",
  "More ways to stand out in search",
  "Host app launch",
  "Design updates on the website",
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
            fontFamily: SERIF_BOLD,
            fontSize: 38,
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          What&rsquo;s new
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13.5, lineHeight: 19, color: INK_DIM }}>
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
                  fontFamily: SERIF_BOLD,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: BRONZE,
                  textTransform: "uppercase",
                }}
              >
                {u.date}
              </Text>
              <Text
                style={{
                  marginTop: 5,
                  fontFamily: SERIF_BOLD,
                  fontSize: 18,
                  color: INK,
                }}
              >
                {u.title}
              </Text>
              <Text style={{ fontFamily: SERIF, marginTop: 5, fontSize: 14, lineHeight: 20, color: INK_DIM }}>
                {u.body}
              </Text>
            </View>
          ))}
        </View>

        <Text
          style={{
            marginTop: 28,
            fontFamily: SERIF_BOLD,
            fontSize: 22,
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
              <Text style={{ fontFamily: SERIF, marginLeft: 10, fontSize: 14.5, color: INK }}>{c}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: SERIF, marginTop: 10, fontSize: 12, color: INK_DIM }}>
          Timelines shift — we ship when it&rsquo;s right.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
