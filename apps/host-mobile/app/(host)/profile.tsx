// Host profile / settings tab. Surfaces email + a logout button — the
// account-management surface stays light here. Detailed preferences
// (notification toggles, contact info, payment methods) live on web
// until the host app needs them.

import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pb-12 pt-4">
        <Text className="mb-1 text-2xl font-semibold text-foreground">Profile</Text>
        <Text className="mb-6 text-sm text-muted-foreground">
          Account settings
        </Text>

        <View className="rounded-xl border border-border bg-background px-4 py-3">
          <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email
          </Text>
          <Text className="mt-1 text-base text-foreground">{user?.email ?? "—"}</Text>
        </View>

        <Pressable
          onPress={signOut}
          className="mt-10 rounded-lg border border-border bg-background py-3 active:opacity-70"
        >
          <Text className="text-center text-sm font-medium text-foreground">
            Log out
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
