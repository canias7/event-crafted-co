// Host auth gate. Boot path:
//   resolving session → small loader (no flash)
//   signed in → /(host)/explore (browse vendors first)
//   signed out → /(auth)/welcome (auth-method picker; tapping
//                "Log in" or "Sign up" routes onward)

import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";

export default function Index() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: C.page }}>
        <ActivityIndicator color={C.text} />
      </View>
    );
  }

  return <Redirect href={user ? "/(host)/explore" : "/(auth)/welcome"} />;
}
