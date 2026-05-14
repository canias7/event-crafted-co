// Studio — content & tools hub for the vendor.
//
// Trimmed v2: just three items for now — AI Superagents, Vendora Pay
// (coming soon, non-tappable), and Gallery. We'll expand back to the
// fuller tools list once the core surfaces are wired natively.

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
  // When true the tile renders as a non-tappable "Coming soon" card.
  comingSoon?: boolean;
}

const TOOLS: Tool[] = [
  {
    title: "AI Superagents",
    subtitle: "Smart agents that reply, qualify, and follow up for you",
    url: `${WEB}/vendor/ai-agent`,
  },
  {
    title: "Vendora Pay",
    subtitle: "Take deposits + final payments through Vendora",
    comingSoon: true,
  },
  {
    title: "Gallery",
    subtitle: "Upload portfolio images, drag to reorder",
    route: "/(vendor)/listing",
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
              disabled={t.comingSoon}
              onPress={() => {
                if (t.comingSoon) return;
                if (t.route) router.push(t.route as never);
                else if (t.url) Linking.openURL(t.url);
              }}
              className={
                t.comingSoon
                  ? "rounded-xl border border-border bg-background px-4 py-4 opacity-60"
                  : "rounded-xl border border-border bg-background px-4 py-4 active:opacity-70"
              }
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-medium text-foreground">
                      {t.title}
                    </Text>
                    {t.comingSoon ? (
                      <View className="rounded-full bg-muted px-2 py-0.5">
                        <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Coming soon
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-0.5 text-sm text-muted-foreground">
                    {t.subtitle}
                  </Text>
                </View>
                {t.comingSoon ? null : (
                  <Text className="text-muted-foreground">›</Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
