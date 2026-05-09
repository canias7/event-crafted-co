// Auth gate. Decides where to send the user the moment the app boots:
//   - still resolving session → show a tiny loader so we don't flash
//     login then immediately redirect away
//   - signed in → /(vendor)/home
//   - signed out → /(auth)/welcome (auth-method picker; tapping
//                  "Log in" or "Sign up" routes onward)

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

  return <Redirect href={user ? "/(vendor)/home" : "/(auth)/welcome"} />;
}
