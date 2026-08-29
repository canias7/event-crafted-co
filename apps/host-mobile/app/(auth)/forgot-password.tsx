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

const CREAM = "#f4f1ea";
const INK = "#14161a";
const INK_DIM = "#14161a";
const INK_BORDER = "#e6e1d5";
const INPUT_BG = "#fbf9f4";
const ERROR = "#b23a34";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

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
    // Go through the password-reset edge function instead of
    // supabase.auth.resetPasswordForEmail: the project's bot/abuse
    // captcha blocks the /recover endpoint from inside the app. The
    // function mints the recovery link with the service role
    // (captcha-exempt) and emails it; the link still deep-links into
    // reset-password. It returns ok:true for unknown emails too
    // (anti-enumeration), so a clean response reveals nothing.
    const { error: invokeErr } = await supabase.functions.invoke(
      "password-reset",
      { body: { email: email.trim().toLowerCase(), redirectTo } },
    );
    setSubmitting(false);
    if (invokeErr) {
      setError(invokeErr.message);
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
                fontFamily: SERIF_BOLD,
                fontSize: 36,
                color: INK,
                letterSpacing: -1,
              }}
            >
              Forgot your password?
            </Text>
            <Text
              style={{ fontFamily: SERIF,
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
                style={{ fontFamily: SERIF_BOLD,
                  color: INK_DIM,
                  fontSize: 12,
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
                style={{ fontFamily: SERIF,
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
                style={{ fontFamily: SERIF,
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
              <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 16,}}>
                {submitting ? "Sending…" : "Send reset link"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
            <Text
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 36,
                color: INK,
                letterSpacing: -1,
              }}
            >
              Check your email
            </Text>
            <Text
              style={{ fontFamily: SERIF,
                marginTop: 12,
                fontSize: 15,
                color: INK_DIM,
                lineHeight: 22,
              }}
            >
              If an account exists for{" "}
              <Text style={{ fontFamily: SERIF_BOLD, color: INK,}}>{email}</Text>,
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
              <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 16,}}>
                Back to sign in
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
