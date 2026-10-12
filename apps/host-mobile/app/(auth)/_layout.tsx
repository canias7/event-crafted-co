import { StatusBar } from "react-native";
import { Stack } from "expo-router";

// The sign-in screens are dark (ink page, cream text), like the website's.
export default function AuthLayout() {
  return (
    <>
      <StatusBar barStyle="light-content" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#14161a" } }} />
    </>
  );
}
