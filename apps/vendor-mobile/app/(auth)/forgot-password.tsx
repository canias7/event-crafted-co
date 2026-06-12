// Host password reset — request step. User enters their email, we
// call supabase.auth.resetPasswordForEmail with a deep-link redirect
// (vendora-host://reset-password). Supabase mails a magic link that,
// when tapped, opens the app with recovery tokens in the URL fragment.
// The reset-password screen picks them up and lets the user pick a new
// password.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const CREAM = "#ffffff";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const INK_BORDER = "rgba(20,22,26,0.08)";
const INPUT_BG = "#ffffff";
const ERROR = "#dc2828";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!email.trim()) return;
    setSubmitting(true);
    const redirectTo = Linking.createURL("reset-password");
    const { error: e } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo },
    );
    setSubmitting(false);
    // Don't reveal whether the email exists — succeed silently either
    // way to prevent enumeration. Only surface an error if Supabase
    // itself rejects the request (rate-limit, bad email format, etc).
    if (e && !/rate|invalid/i.test(e.message)) {
      setError(e.message);
      return;
    }
    setSent(true);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
        </View>

        {!sent ? (
          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            <Text
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 36,
                fontWeight: "700",
                color: INK,
                letterSpacing: -1,
              }}
            >
              Forgot your password?
            </Text>
            <Text
              style={{
                marginTop: 10,
                color: INK_DIM,
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              Enter your email and we'll send a reset link. Tap it on
              this device to pick a new password.
            </Text>

            <View style={{ marginTop: 24 }}>
              <Text
                style={{
                  color: INK_DIM,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 0.8,
                }}
              >
                EMAIL
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={onSubmit}
                placeholder="you@example.com"
                placeholderTextColor={INK_DIM}
                style={{
                  marginTop: 6,
                  backgroundColor: INPUT_BG,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: INK_BORDER,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: INK,
                  fontSize: 16,
                }}
              />
            </View>

            {error ? (
              <Text
                style={{
                  marginTop: 12,
                  color: ERROR,
                  fontSize: 13,
                }}
              >
                {error}
              </Text>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={submitting || !email.trim()}
              style={{
                marginTop: 18,
                backgroundColor: INK,
                borderRadius: 999,
                height: 54,
                alignItems: "center",
                justifyContent: "center",
                opacity: submitting || !email.trim() ? 0.5 : 1,
              }}
            >
              <Text style={{ color: CREAM, fontSize: 16, fontWeight: "600" }}>
                {submitting ? "Sending…" : "Send reset link"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
            <Text
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 36,
                fontWeight: "700",
                color: INK,
                letterSpacing: -1,
              }}
            >
              Check your email
            </Text>
            <Text
              style={{
                marginTop: 12,
                fontSize: 15,
                color: INK_DIM,
                lineHeight: 22,
              }}
            >
              If an account exists for{" "}
              <Text style={{ color: INK, fontWeight: "600" }}>{email}</Text>,
              you'll get a reset link within a minute. Open it on this
              device to set a new password.
            </Text>

            <Pressable
              onPress={() => router.replace("/(auth)/login")}
              style={{
                marginTop: 24,
                backgroundColor: INK,
                borderRadius: 999,
                height: 54,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: CREAM, fontSize: 16, fontWeight: "600" }}>
                Back to sign in
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
