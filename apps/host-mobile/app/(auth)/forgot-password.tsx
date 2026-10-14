// Host password reset — request step. User enters their email, we
// call supabase.auth.resetPasswordForEmail with a deep-link redirect
// (vendora-host://reset-password). Supabase mails a magic link that,
// when tapped, opens the app with recovery tokens in the URL fragment.
// The reset-password screen picks them up and lets the user pick a new
// password.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
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
import { useKeyboardReveal } from "@/lib/useKeyboardReveal";
import { AuthBackdrop } from "@/components/AuthBackdrop";
import { AuthCard } from "@/components/AuthCard";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";

const CREAM = C.page;
const INK = C.text;
// Labels on gold buttons stay ink.
const INK_ON_GOLD = C.onGold;
const GOLD = C.gold;
// Disabled fill for the gold pill — solid, not faded.
const GOLD_MUTED = C.goldMuted;
const INK_DIM = C.textDim;
const PLACEHOLDER = C.placeholder;
const INK_BORDER = C.border;
const INPUT_BG = C.field;
const ERROR = C.error;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

export default function ForgotPasswordScreen() {
  const keyboard = useKeyboardReveal();
  const router = useRouter();
  const { t } = useT("forgotPassword");
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
      <AuthBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          {...keyboard.scrollProps}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("back")}
            >
              <Feather name="chevron-left" size={26} color={INK} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <AuthCard>
          {!sent ? (
            <View>
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  fontSize: 36,
                  color: INK,
                  letterSpacing: -1,
                }}
              >
                {t("request.title")}
              </Text>
              <Text
                style={{ fontFamily: SERIF,
                  marginTop: 10,
                  color: INK_DIM,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                {t("request.body")}
              </Text>

              <View style={{ marginTop: 24 }}>
                <Text
                  style={{ fontFamily: SERIF_BOLD,
                    color: INK_DIM,
                    fontSize: 12,
                    letterSpacing: 0.8,
                  }}
                >
                  {t("request.email")}
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={onSubmit}
                  placeholder={t("request.emailPlaceholder")}
                  placeholderTextColor={PLACEHOLDER}
                  style={{ fontFamily: SERIF,
                    marginTop: 6,
                    backgroundColor: INPUT_BG,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: INK_BORDER,
                    paddingHorizontal: 16,
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
                  marginTop: 20,
                  backgroundColor: submitting || !email.trim() ? GOLD_MUTED : GOLD,
                  borderRadius: 999,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: INK_ON_GOLD, fontSize: 16,}}>
                  {submitting ? t("request.sending") : t("request.send")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  fontSize: 36,
                  color: INK,
                  letterSpacing: -1,
                }}
              >
                {t("sent.title")}
              </Text>
              <Text
                style={{ fontFamily: SERIF,
                  marginTop: 12,
                  fontSize: 15,
                  color: INK_DIM,
                  lineHeight: 22,
                }}
              >
                {t("sent.before")}{" "}
                <Text style={{ fontFamily: SERIF_BOLD, color: INK,}}>{email}</Text>
                {t("sent.after")}
              </Text>

              <Pressable
                onPress={() => router.replace("/(auth)/login")}
                style={{
                  marginTop: 24,
                  backgroundColor: GOLD,
                  borderRadius: 999,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: INK_ON_GOLD, fontSize: 16,}}>
                  {t("sent.backToSignIn")}
                </Text>
              </Pressable>
            </View>
          )}
          </AuthCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
