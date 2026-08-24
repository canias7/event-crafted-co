// Vendor password reset — request step. User enters their email, we
// call the password-reset edge function with a deep-link redirect
// (vendora-vendor://reset-password). It mails a recovery link that,
// when tapped, opens the app with tokens in the URL fragment. The
// reset-password screen picks them up and lets the user pick a new
// password.
//
// Dark Vendora theme mirroring signup/login. No function-form style
// props (device interop drops them); TouchableOpacity for feedback.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

// Same palette as welcome / signup / login.
const PAGE = "#f4f1ea";
const INK = "#14161a";
const INK_ON_GOLD = "#14161a";
const GOLD = "#c9a86a";
const GOLD_HAIRLINE = "rgba(201,168,106,0.5)";
const INK_DIM = "#5e636e";
const SUBTLE = "#8b8f99";
const BORDER = "#e6e1d5";
const FIELD_BG = "#fbf9f4";
const FIELD_BORDER = "#d9d1bf";
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
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 48,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(auth)/login");
              }
            }}
            hitSlop={12}
            style={{ alignSelf: "flex-start", paddingVertical: 8 }}
          >
            <Text style={{ color: INK_DIM, fontSize: 16, fontWeight: "500" }}>
              ← Back
            </Text>
          </Pressable>

          {!sent ? (
            <>
              <StepHeader
                eyebrow="RESET PASSWORD"
                title="Forgot your password?"
                subtitle="Enter your email and we'll send a reset link. Tap it on this device to pick a new password."
              />

              <View style={{ marginTop: 28, gap: 20 }}>
                <View>
                  <Text style={fieldLabel}>EMAIL</Text>
                  <View style={inputRow}>
                    <MaterialCommunityIcons
                      name="email-outline"
                      size={20}
                      color={GOLD}
                      style={{ marginRight: 10 }}
                    />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      returnKeyType="send"
                      onSubmitEditing={onSubmit}
                      placeholder="you@example.com"
                      placeholderTextColor={SUBTLE}
                      selectionColor={GOLD}
                      keyboardAppearance="dark"
                      style={inputText}
                    />
                  </View>
                </View>

                {error ? <Text style={errorText}>{error}</Text> : null}

                <TouchableOpacity
                  onPress={onSubmit}
                  disabled={submitting || !email.trim()}
                  activeOpacity={0.85}
                  style={{
                    ...primaryBtn,
                    opacity: submitting || !email.trim() ? 0.5 : 1,
                  }}
                >
                  <Text style={primaryBtnText}>
                    {submitting ? "Sending…" : "Send reset link"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <StepHeader
                eyebrow="RESET PASSWORD"
                title="Check your email"
                subtitle={`If an account exists for ${email}, you'll get a reset link within a minute. Open it on this device to set a new password.`}
              />

              <TouchableOpacity
                onPress={() => router.replace("/(auth)/login")}
                activeOpacity={0.85}
                style={{ ...primaryBtn, marginTop: 28 }}
              >
                <Text style={primaryBtnText}>Back to sign in</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Gold hairlines meeting a four-point star — same divider as signup/login.
function StarDivider() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 28,
        gap: 14,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: GOLD_HAIRLINE }} />
      <MaterialCommunityIcons name="star-four-points" size={16} color={GOLD} />
      <View style={{ flex: 1, height: 1, backgroundColor: GOLD_HAIRLINE }} />
    </View>
  );
}

function StepHeader(p: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={eyebrowLabel}>{p.eyebrow}</Text>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 38,
          lineHeight: 46,
          color: INK,
          letterSpacing: -0.5,
          marginTop: 10,
        }}
      >
        {p.title}
      </Text>
      <Text style={subhead}>{p.subtitle}</Text>
      <StarDivider />
    </View>
  );
}

const eyebrowLabel = {
  color: GOLD,
  fontSize: 12,
  fontWeight: "600" as const,
  letterSpacing: 3,
};
const subhead = {
  marginTop: 10,
  fontSize: 13.5,
  color: INK_DIM,
  lineHeight: 19,
};
const fieldLabel = {
  marginBottom: 8,
  fontSize: 13,
  fontWeight: "700" as const,
  color: INK,
  letterSpacing: 1.5,
};
const inputRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  backgroundColor: FIELD_BG,
  borderColor: FIELD_BORDER,
  borderWidth: 1,
  borderRadius: 16,
  paddingHorizontal: 16,
  minHeight: 60,
};
const inputText = {
  flex: 1,
  fontSize: 16,
  color: INK,
  paddingVertical: 16,
};
const primaryBtn = {
  marginTop: 4,
  backgroundColor: GOLD,
  borderRadius: 999,
  height: 56,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const primaryBtnText = {
  color: INK_ON_GOLD,
  fontSize: 17,
  fontWeight: "600" as const,
};
const errorText = {
  color: ERROR,
  fontSize: 14,
  lineHeight: 20,
};
