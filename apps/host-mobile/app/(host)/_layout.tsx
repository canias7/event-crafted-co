// Host tab layout. The host journey is browse → message → book → plan,
// so the bottom nav prioritizes Explore (vendor browse) as the home,
// with Inbox (vendor threads), Events (their bookings), and Profile.

import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";

export default function HostLayout() {
  const { loading, user } = useAuth();

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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0a0a0a",
        tabBarInactiveTintColor: "#737373",
        tabBarStyle: { borderTopColor: "#e5e5e5" },
      }}
    >
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="events" options={{ title: "Events" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      {/* Vendor detail — opened from Explore card tap; not a tab. */}
      <Tabs.Screen name="vendor/[id]" options={{ href: null }} />
    </Tabs>
  );
}
