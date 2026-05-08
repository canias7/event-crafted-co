// Auth landing screen. Vendora branding up top; auth-method picker
// docked to the bottom in a rounded sheet that mirrors apps like
// ChatGPT, where the focus is on choosing how to sign in rather than
// the form itself. The actual email/password form lives at
// /(auth)/login — this screen routes there from "Log in".

import { useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const router = useRouter();

  function comingSoon(provider: string) {
    Alert.alert(
      `${provider} sign-in`,
      "Coming soon. For now, sign up or log in with email.",
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />

      {/* Brand block — sits in the top third so the empty middle
          gives the page room to breathe, like the ChatGPT entry. */}
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="flex-1 items-center justify-center pb-32">
          <Text className="text-5xl font-semibold tracking-tight text-white">
            Vendora
          </Text>
        </View>
      </SafeAreaView>

      {/* Bottom sheet of auth methods. */}
      <View className="bg-black px-3 pb-2">
        <View className="rounded-3xl bg-black p-3 shadow">
          <Pressable
            onPress={() => comingSoon("Apple")}
            className="rounded-2xl bg-white px-4 py-4 active:opacity-80"
          >
            <Text className="text-center text-base font-semibold text-black">
              Continue with Apple
            </Text>
          </Pressable>
          <Pressable
            onPress={() => comingSoon("Google")}
            className="mt-2 rounded-2xl bg-zinc-800 px-4 py-4 active:opacity-80"
          >
            <Text className="text-center text-base font-semibold text-white">
              Continue with Google
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(auth)/signup")}
            className="mt-2 rounded-2xl bg-zinc-800 px-4 py-4 active:opacity-80"
          >
            <Text className="text-center text-base font-semibold text-white">
              Sign up
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            className="mt-2 rounded-2xl border border-zinc-700 px-4 py-4 active:opacity-60"
          >
            <Text className="text-center text-base font-semibold text-white">
              Log in
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
