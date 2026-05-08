// Vendor login. Email + password against Supabase auth. On success the
// onAuthStateChange subscription in AuthProvider fires, the gate at
// app/index.tsx re-resolves, and the user lands on /(vendor)/dashboard.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Pending vendors are banned via auth.users.banned_until until
      // an admin approves them — surface the actual reason instead of
      // GoTrue's generic "User is banned".
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("banned") || msg.includes("not allowed")) {
        setError(
          "Your vendor application is still under review. We'll email you once it's approved.",
        );
      } else {
        setError(error.message);
      }
    }
    setSubmitting(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 px-6 py-8"
      >
        <Text className="mb-1 text-3xl font-semibold text-foreground">
          Welcome back
        </Text>
        <Text className="mb-8 text-sm text-muted-foreground">
          Log in to manage your Vendora listing.
        </Text>

        <View className="gap-4">
          <View>
            <Text className="mb-1 text-xs font-medium text-muted-foreground">
              Email
            </Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
              placeholder="you@example.com"
            />
          </View>

          <View>
            <Text className="mb-1 text-xs font-medium text-muted-foreground">
              Password
            </Text>
            <TextInput
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
              placeholder="••••••••"
            />
          </View>

          {error ? (
            <Text className="text-sm text-red-600">{error}</Text>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            className="mt-2 rounded-lg bg-foreground px-4 py-3 active:opacity-80 disabled:opacity-50"
          >
            <Text className="text-center text-base font-semibold text-background">
              {submitting ? "Logging in…" : "Log in"}
            </Text>
          </Pressable>

          <Link href="/(auth)/signup" className="mt-4 text-center text-sm text-muted-foreground">
            New to Vendora? Create an account
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
