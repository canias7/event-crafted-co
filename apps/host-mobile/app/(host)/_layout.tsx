// Host mobile tab layout — 4 tabs with a custom floating pill tab
// bar (same shape as vendor-mobile's). Pill floats ~16px above the
// bottom safe area, white bg, soft shadow. Inactive tabs are line
// icons (Feather), active tab is a solid black circle with a white
// icon. No text labels.

import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useAuth } from "@/lib/auth";
import { usePushNotificationTapHandler } from "@/lib/pushNotifications";

const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  explore: "search",
  inbox: "inbox",
  events: "calendar",
  profile: "user",
};

const ORDER = ["explore", "inbox", "events", "profile"];

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const focusedRoute = state.routes[state.index]?.name;
  // Hide the floating bar on screens that own the bottom — the
  // vendor detail screen's sticky Inquire bar would overlap it, and
  // the conversation screen has its own composer pinned to the
  // bottom.
  if (focusedRoute === "vendor/[id]" || focusedRoute === "thread/[id]") return null;
  const visible = ORDER.map((name) =>
    state.routes.find((r) => r.name === name),
  ).filter(Boolean) as typeof state.routes;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 24,
        alignItems: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#fbf9f4",
          borderWidth: 1,
          borderColor: "#e6e1d5",
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 8,
          height: 64,
          width: "100%",
          maxWidth: 420,
          shadowColor: "#000",
          shadowOpacity: 0.10,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {visible.map((route) => {
          const realIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === realIndex;
          const iconName = ICONS[route.name] ?? "circle";
          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name as never);
                }
              }}
              hitSlop={6}
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isFocused ? "#14161a" : "transparent",
              }}
            >
              <Feather
                name={iconName}
                size={20}
                color={isFocused ? "#ffffff" : "#5e636e"}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function HostLayout() {
  const { loading, user } = useAuth();
  // Wire push-tap → deep-link routing once the tab navigator is mounted.
  // Both cold-start taps (app killed) and warm taps go through here.
  usePushNotificationTapHandler();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Content sits behind the floating bar. Each screen's
        // ScrollView already has pb-32 padding; the floating bar is
        // ~76px tall (64 + safe-area), so anything that ends near
        // the bottom should add some extra padding.
        tabBarStyle: { position: "absolute" },
      }}
    >
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="events" options={{ title: "Events" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      {/* Vendor detail — opened from Explore card tap; not a tab. */}
      <Tabs.Screen name="vendor/[id]" options={{ href: null }} />
      {/* Conversation — opened from Inbox row tap; not a tab. */}
      <Tabs.Screen name="thread/[id]" options={{ href: null }} />
      {/* Account settings — reached from Profile's "Account settings" card. */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
