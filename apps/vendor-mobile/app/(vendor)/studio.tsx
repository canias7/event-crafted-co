// Studio — content & tools hub for the vendor.
//
// Three tiles for now: AI Superagents (featured w/ peach gradient
// background), Vendora Pay (coming soon, dimmed), Gallery.

import { Dimensions, Linking, Pressable, ScrollView, Text, View } from "react-native";
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
  // Compute exact pixel width: screen width minus screen padding
  // (px-5 = 20pt each side). react-native-svg needs concrete pixel
  // dimensions — "100%" silently fails to render on iOS.
  const WIDTH = Dimensions.get("window").width - 40;
  const HEIGHT = 82;
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: WIDTH,
        height: HEIGHT,
        borderRadius: 20,
        overflow: "hidden",
        // Solid peach base color in case the svg gradient fails to
        // render — at least the tile still looks featured.
        backgroundColor: "#fbc88a",
      }}
    >
      <Svg
        width={WIDTH}
        height={HEIGHT}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Defs>
          <SvgLinearGradient id="aiBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fbc88a" stopOpacity="1" />
            <Stop offset="0.5" stopColor="#fcd9a3" stopOpacity="1" />
            <Stop offset="1" stopColor="#fce6c4" stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="url(#aiBg)" />
      </Svg>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text
            style={{ fontSize: 18, fontWeight: "700", color: "#1a1a1a" }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 13,
              lineHeight: 17,
              color: "rgba(26,26,26,0.7)",
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color="#1a1a1a" />
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
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.08)",
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: 0.55,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#1a1a1a" }}>
          {title}
        </Text>
        <View
          style={{
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.08)",
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontWeight: "700",
              color: "rgba(0,0,0,0.5)",
              letterSpacing: 1.2,
            }}
          >
            COMING SOON
          </Text>
        </View>
      </View>
      <Text
        style={{
          marginTop: 2,
          fontSize: 13,
          lineHeight: 17,
          color: "rgba(0,0,0,0.45)",
        }}
      >
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
      style={({ pressed }) => ({
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.08)",
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#1a1a1a" }}>
            {title}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 13,
              lineHeight: 17,
              color: "rgba(0,0,0,0.55)",
            }}
          >
            {subtitle}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color="#1a1a1a" />
      </View>
    </Pressable>
  );
}
