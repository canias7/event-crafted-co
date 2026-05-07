// Vendor tab layout. Mirrors the 4-tab bottom nav used on the web's
// mobile breakpoint (Dashboard, Inbox, Calendar, Listing). If the user
// isn't signed in, kick them back to the auth gate at /.
//
// Tab labels stay short — bottom-tab text gets cropped beyond ~7 chars.

import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";

export default function VendorLayout() {
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
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="listing" options={{ title: "Listing" }} />
    </Tabs>
  );
}
