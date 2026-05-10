// Studio — content & tools hub for the vendor.
//
// On web, /vendor/studio is the AI image editor. The "Studio" tab on
// mobile is wider: a hub that surfaces every content surface a vendor
// might want to manage on the go (packages, gallery, FAQs, policies,
// AI agent). The core listing fields (photos, category, bio, price)
// open the native listing builder. Heavier editors that don't yet
// have a native flow open the matching web page in a system browser.

import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const WEB = "https://eventvendora.com";

interface Tool {
  title: string;
  subtitle: string;
  // Either a native route (router.push) or an external URL (Linking).
  route?: string;
  url?: string;
}

const TOOLS: Tool[] = [
  {
    title: "Photo gallery",
    subtitle: "Upload portfolio images, drag to reorder",
    route: "/(vendor)/listing",
  },
  {
    title: "Packages",
    subtitle: "Pricing tiers and what's included",
    url: `${WEB}/vendor/listing#packages`,
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
  const router = useRouter();
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
              onPress={() => {
                if (t.route) router.push(t.route as never);
                else if (t.url) Linking.openURL(t.url);
              }}
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
          Photo gallery edits live in the app. Packages, FAQs, policies,
          and AI agent open in your browser for now.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
