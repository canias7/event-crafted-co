// Studio — content & tools hub for the vendor.
//
// Three tiles for now: AI Superagents (featured w/ peach gradient
// background), Vendora Pay (coming soon, dimmed), Gallery.

import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from "react-native-svg";

const WEB = "https://eventvendora.com";

export default function StudioScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-32 pt-6">
        <Text className="text-4xl font-bold text-foreground">Studio</Text>
        <Text className="mt-2 mb-7 text-base text-muted-foreground">
          Content tools for your listing
        </Text>

        <View className="gap-4">
          {/* AI Superagents — featured tile with peach gradient */}
          <FeaturedTile
            title="AI Superagents"
            subtitle="Smart agents that reply, qualify, and follow up for you"
            onPress={() => Linking.openURL(`${WEB}/vendor/ai-agent`)}
          />

          {/* Vendora Pay — coming soon, non-tappable */}
          <ComingSoonTile
            title="Vendora Pay"
            subtitle="Take deposits + final payments through Vendora"
          />

          {/* Gallery — plain tile, opens native listing builder */}
          <PlainTile
            title="Gallery"
            subtitle="Upload portfolio images, drag to reorder"
            onPress={() => router.push("/(vendor)/listing" as never)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeaturedTile({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  // 100% width minus the screen padding (px-5 = 20pt each side).
  // Tile is fixed-height with internal padding so SVG gradient can
  // fill behind plain text content.
  const HEIGHT = 130;
  return (
    <Pressable
      onPress={onPress}
      className="overflow-hidden rounded-2xl active:opacity-80"
      style={{ height: HEIGHT }}
    >
      <Svg
        width="100%"
        height={HEIGHT}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Defs>
          <SvgLinearGradient id="aiBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fcd9b0" stopOpacity="1" />
            <Stop offset="0.6" stopColor="#fbe6c8" stopOpacity="1" />
            <Stop offset="1" stopColor="#f8efe1" stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={HEIGHT} fill="url(#aiBg)" />
      </Svg>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingVertical: 18,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 14 }}>
          <Text
            className="text-2xl font-bold text-foreground"
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            className="mt-1.5 text-[15px] leading-5 text-foreground/70"
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>
        <Feather name="chevron-right" size={22} color="#1a1a1a" />
      </View>
    </Pressable>
  );
}

function ComingSoonTile({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View className="rounded-2xl border border-border bg-background/60 px-5 py-5 opacity-60">
      <View className="flex-row items-center gap-2.5">
        <Text className="text-2xl font-bold text-foreground">{title}</Text>
        <View className="rounded-full bg-muted px-2.5 py-1">
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Coming soon
          </Text>
        </View>
      </View>
      <Text className="mt-1.5 text-[15px] leading-5 text-muted-foreground">
        {subtitle}
      </Text>
    </View>
  );
}

function PlainTile({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-border bg-background px-5 py-5 active:opacity-70"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-2xl font-bold text-foreground">{title}</Text>
          <Text className="mt-1.5 text-[15px] leading-5 text-muted-foreground">
            {subtitle}
          </Text>
        </View>
        <Feather name="chevron-right" size={22} color="#1a1a1a" />
      </View>
    </Pressable>
  );
}
