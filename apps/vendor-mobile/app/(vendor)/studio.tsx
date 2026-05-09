// Studio — content & tools hub for the vendor.
//
// On web, /vendor/studio is the AI image editor. The "Studio" tab on
// mobile is wider: a hub that surfaces every content surface a vendor
// might want to manage on the go (packages, gallery, FAQs, policies,
// AI agent). Each row is a tappable card; for now the editing flows
// open the matching web page in a system browser, since the heaviest
// editors (image upload, AI agent prompts, policy editor) are easier
// on a real keyboard. Mobile-native managers can replace these
// shortcuts iteratively.

import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const WEB = "https://eventvendora.com";

interface Tool {
  title: string;
  subtitle: string;
  url: string;
}

const TOOLS: Tool[] = [
  {
    title: "Packages",
    subtitle: "Pricing tiers and what's included",
    url: `${WEB}/vendor/listing#packages`,
  },
  {
    title: "Photo gallery",
    subtitle: "Upload portfolio images, drag to reorder",
    url: `${WEB}/vendor/listing#gallery`,
  },
  {
    title: "FAQs",
    subtitle: "Common questions hosts ask",
    url: `${WEB}/vendor/listing#faqs`,
  },
  {
    title: "Policies",
    subtitle: "Cancellation, deposits, payment terms",
    url: `${WEB}/vendor/listing#policies`,
  },
  {
    title: "AI agent",
    subtitle: "Auto-reply prompts and tone",
    url: `${WEB}/vendor/ai-agent`,
  },
  {
    title: "Image editor",
    subtitle: "AI background swap, retouch, brand presets",
    url: `${WEB}/vendor/studio`,
  },
];

export default function StudioScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pb-32 pt-4">
        <Text className="mb-1 text-2xl font-semibold text-foreground">
          Studio
        </Text>
        <Text className="mb-6 text-sm text-muted-foreground">
          Content tools for your listing
        </Text>

        <View className="gap-3">
          {TOOLS.map((t) => (
            <Pressable
              key={t.title}
              onPress={() => Linking.openURL(t.url)}
              className="rounded-xl border border-border bg-background px-4 py-4 active:opacity-70"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-medium text-foreground">
                    {t.title}
                  </Text>
                  <Text className="mt-0.5 text-sm text-muted-foreground">
                    {t.subtitle}
                  </Text>
                </View>
                <Text className="text-muted-foreground">›</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Text className="mt-6 text-center text-xs text-muted-foreground">
          Tap any tool to open the full editor in your browser. Native
          editing comes in a future update.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
