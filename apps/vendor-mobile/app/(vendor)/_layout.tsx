// Vendor mobile tab layout — 5 tabs with a custom floating pill tab bar.
//
// Style spec: pill floats ~16px above the bottom safe area, white bg,
// soft shadow. Inactive tabs are line icons (Feather), active tab is a
// solid black circle with a white icon. No text labels.

import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useAuth } from "@/lib/auth";
import { usePushNotificationTapHandler } from "@/lib/pushNotifications";

// route name → Feather icon name
const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  home: "home",
  calendar: "calendar",
  inbox: "inbox",
  studio: "grid",
  profile: "user",
};

const ORDER = ["home", "calendar", "inbox", "studio", "profile"];

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Hide the floating bar on screens that own the bottom — the listing
  // builder has its own Save / Publish action bar, and the conversation
  // screen has its own composer pinned at the bottom.
  const focusedRoute = state.routes[state.index]?.name;
  if (
    focusedRoute === "listing" ||
    focusedRoute === "thread/[id]" ||
    focusedRoute === "partner-thread/[id]" ||
    focusedRoute === "edit-profile"
  )
    return null;
  // Filter to only the visible tabs we care about, in our preferred order.
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
          backgroundColor: "#f7f3ec",
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 8,
          height: 64,
          width: "100%",
          maxWidth: 420,
          shadowColor: "#000",
          shadowOpacity: 0.08,
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
                backgroundColor: isFocused ? "#1a1410" : "transparent",
              }}
            >
              <Feather
                name={iconName}
                size={20}
                color={isFocused ? "#fdfbf7" : "#776c5f"}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function VendorLayout() {
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
        // The screen content sits behind the floating bar at the bottom.
        // Each screen's ScrollView already has pb-12+ padding; the
        // floating bar is ~76px tall (64 + safe-area), so anything that
        // ends near the bottom should add some extra padding.
        tabBarStyle: { position: "absolute" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="studio" options={{ title: "Studio" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      {/* Dashboard is reached from Profile's "Dashboard" chip, not a tab. */}
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      {/* Listing builder — reached from the Profile tab's "Create
          listing" CTA / 4-segment toggle. Hidden from the bottom nav
          because it's a one-and-done flow per vendor. */}
      <Tabs.Screen name="listing" options={{ href: null }} />
      <Tabs.Screen name="vendor/[id]" options={{ href: null }} />
      <Tabs.Screen name="thread/[id]" options={{ href: null }} />
      <Tabs.Screen name="partner-thread/[id]" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
    </Tabs>
  );
}
