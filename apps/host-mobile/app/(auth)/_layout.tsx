import { StatusBar } from "react-native";
import { Stack } from "expo-router";
import { C } from "@/lib/theme";

// The sign-in screens follow the app theme: ivory page with ink text in
// light, the ink page with cream text in dark (like the website's).
export default function AuthLayout() {
  return (
    <>
      <StatusBar barStyle={C.statusBar === "dark" ? "dark-content" : "light-content"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.page } }} />
    </>
  );
}
