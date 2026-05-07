// Host signup. Sets `intended_role: "host"` in user metadata so the
// existing Supabase trigger (mirrors the web's signup flow) provisions
// a host profile, not a vendor profile.

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

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { intended_role: "host" } },
    });
    if (error) setError(error.message);
    else setInfo("Check your email to confirm your account.");
    setSubmitting(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 px-6 py-8"
      >
        <Text className="mb-1 text-3xl font-semibold text-foreground">
          Plan your event
        </Text>
        <Text className="mb-8 text-sm text-muted-foreground">
          Create an account to message vendors and book events.
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
              placeholder="At least 8 characters"
            />
          </View>

          {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
          {info ? <Text className="text-sm text-accent">{info}</Text> : null}

          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            className="mt-2 rounded-lg bg-foreground px-4 py-3 active:opacity-80 disabled:opacity-50"
          >
            <Text className="text-center text-base font-semibold text-background">
              {submitting ? "Creating account…" : "Sign up"}
            </Text>
          </Pressable>

          <Link href="/(auth)/login" className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account? Log in
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
