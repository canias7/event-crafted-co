// Host auth gate. Boot path:
//   resolving session → small loader (no flash)
//   signed in → /(host)/explore (browse vendors first)
//   signed out → /(auth)/welcome (auth-method picker; tapping
//                "Log in" or "Sign up" routes onward)

import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";

export default function Index() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={user ? "/(host)/explore" : "/(auth)/welcome"} />;
}
