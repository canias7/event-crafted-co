// Auth gate. Decides where to send the user the moment the app boots:
//   - still resolving session → show a tiny loader so we don't flash
//     login then immediately redirect away
//   - signed in → /(vendor)/dashboard
//   - signed out → /(auth)/login

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

  return <Redirect href={user ? "/(vendor)/dashboard" : "/(auth)/login"} />;
}
