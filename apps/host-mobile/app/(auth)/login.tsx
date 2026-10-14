// Host login. Two-step 2FA: email+password → 6-digit code emailed via
// Resend. Cream/ink themed to match the welcome screen.

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
import { supabase } from "@/lib/supabase";
import { useKeyboardReveal } from "@/lib/useKeyboardReveal";
import { AuthBackdrop } from "@/components/AuthBackdrop";
import { AuthCard } from "@/components/AuthCard";
import { useT } from "@/lib/i18n";

const CREAM = "#14161a";
const INK = "#f4f1ea";
// Labels on gold buttons stay ink.
const INK_ON_GOLD = "#14161a";
const GOLD = "#c9a86a";
// Disabled fill for the gold pill — solid, not faded.
const GOLD_MUTED = "#e0d2b0";
const INK_DIM = "#f4f1ea";
const PLACEHOLDER = "#a39a88";
const INK_BORDER = "rgba(255,255,255,0.15)";
const INPUT_BG = "rgba(255,255,255,0.05)";
const ERROR = "#e0716a";
const BRONZE = "#c9a86a";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

type Step = "credentials" | "code";

export default function LoginScreen() {
  const keyboard = useKeyboardReveal();
  const router = useRouter();
  const { t } = useT("login");
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitCredentials() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { data, error: invokeErr } = await supabase.functions.invoke("signin-2fa", {
      body: {
        action: "request",
        email: email.trim().toLowerCase(),
        password,
        app: "host",
      },
    });
    setSubmitting(false);
    if (invokeErr) {
      setError(invokeErr.message);
      return;
    }
    const r = data as { ok?: boolean; reason?: string } | null;
    if (!r?.ok) {
      if (r?.reason === "banned") {
        setError(t("errors.banned"));
      } else if (r?.reason === "not_confirmed") {
        setError(t("errors.notConfirmed"));
      } else if (r?.reason === "invalid_credentials") {
        setError(t("errors.invalidCredentials"));
      } else if (r?.reason === "wrong_app") {
        setError(t("errors.wrongApp"));
      } else {
        setError(t("errors.startFailed"));
      }
      return;
    }
    setInfo(t("code.sent"));
    setCode("");
    setStep("code");
  }

  async function onSubmitCode() {
    setError(null);
    if (code.trim().length !== 6) {
      setError(t("errors.codeLength"));
      return;
    }
    setSubmitting(true);
    const { data, error: invokeErr } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "verify", email: email.trim().toLowerCase(), code: code.trim() },
    });
    if (invokeErr) {
      setSubmitting(false);
      setError(invokeErr.message);
      return;
    }
    const r = data as { ok?: boolean; reason?: string; token_hash?: string } | null;
    if (!r?.ok) {
      setSubmitting(false);
      const reason = r?.reason ?? "unknown";
      if (reason === "invalid_code") setError(t("errors.invalidCode"));
      else if (reason === "expired") setError(t("errors.expired"));
      else if (reason === "too_many_attempts") setError(t("errors.tooManyAttempts"));
      else if (reason === "no_pending_code") setError(t("errors.noPendingCode"));
      else setError(t("errors.verifyFailed"));
      return;
    }
    if (!r.token_hash) {
      setSubmitting(false);
      setError(t("errors.completeFailed"));
      return;
    }
    // Establish the session with the server-minted magiclink token rather
    // than signInWithPassword: the project has captcha bot-protection
    // enabled, which the app can't satisfy. verifyOtp's /verify endpoint
    // is captcha-exempt, and the password + 6-digit code were already
    // checked server-side, so this is no weaker.
    const { data: signInData, error: signInErr } =
      await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: r.token_hash,
      });
    if (signInErr) {
      setSubmitting(false);
      setError(signInErr.message);
      return;
    }
    // Gate by role: host app only accepts host (or admin) accounts.
    // Vendor accounts have to sign in on the Vendor app.
    const userId = signInData.user?.id;
    if (userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      const role = (prof as { role?: string } | null)?.role ?? "host";
      if (role !== "host" && role !== "admin") {
        await supabase.auth.signOut();
        setSubmitting(false);
        setError(t("errors.wrongApp"));
        return;
      }
    }
    setSubmitting(false);
    router.replace("/(host)/explore");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <AuthBackdrop />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <ScrollView
          {...keyboard.scrollProps}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => (step === "credentials" ? router.back() : setStep("credentials"))}
            hitSlop={12}
            style={{ alignSelf: "flex-start", paddingVertical: 8 }}
          >
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 16,}}>
              ← {t("back")}
            </Text>
          </Pressable>

          <AuthCard>
          {step === "credentials" ? (
            <>
              <View>
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    fontSize: 36,
                    color: INK,
                    letterSpacing: -1,
                  }}
                >
                  {t("credentials.title")}
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 15,
                    color: INK_DIM,
                    fontFamily: SERIF_ITALIC,
                  }}
                >
                  {t("credentials.subtitle")}
                </Text>
              </View>

              <View style={{ marginTop: 32, gap: 16 }}>
                <Field
                  label={t("credentials.email")}
                  placeholder={t("credentials.emailPlaceholder")}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoComplete="email"
                  autoCapitalize="none"
                />

                <View>
                  <Text
                    style={{ fontFamily: SERIF_BOLD,
                      marginBottom: 6,
                      fontSize: 12,
                      color: INK_DIM,
                      letterSpacing: 0.5,
                    }}
                  >
                    {t("credentials.password")}
                  </Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor={PLACEHOLDER}
                      autoComplete="current-password"
                      style={{ fontFamily: SERIF,
                        backgroundColor: INPUT_BG,
                        borderColor: INK_BORDER,
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 16,
                        paddingRight: 64,
                        fontSize: 16,
                        color: INK,
                      }}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={8}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: 0,
                        bottom: 0,
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 13,}}>
                        {showPassword ? t("credentials.hide") : t("credentials.show")}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {error ? <Text style={{ fontFamily: SERIF, color: ERROR, fontSize: 14 }}>{error}</Text> : null}

                <Pressable
                  onPress={onSubmitCredentials}
                  disabled={submitting || !email || !password}
                  style={{
                    marginTop: 8,
                    backgroundColor: submitting || !email || !password ? GOLD_MUTED : GOLD,
                    borderRadius: 999,
                    height: 52,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, color: INK_ON_GOLD, fontSize: 16,}}>
                    {submitting ? t("credentials.sending") : t("credentials.continue")}
                  </Text>
                </Pressable>
                <Text
                  style={{ fontFamily: SERIF,
                    marginTop: 4,
                    textAlign: "center",
                    fontSize: 12,
                    color: INK_DIM,
                  }}
                >
                  {t("credentials.codeNote")}
                </Text>

                <Pressable
                  onPress={() => router.push("/(auth)/forgot-password")}
                  style={{ marginTop: 12, alignItems: "center" }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 14 }}>
                    {t("credentials.forgot")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => router.replace("/(auth)/signup")}
                  style={{ marginTop: 12, alignItems: "center" }}
                >
                  <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14 }}>
                    {t("credentials.newHere")}{" "}
                    <Text style={{ fontFamily: SERIF_BOLD, color: INK,}}>{t("credentials.createAccount")}</Text>
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View>
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    fontSize: 36,
                    color: INK,
                    letterSpacing: -1,
                  }}
                >
                  {t("code.title")}
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 15,
                    color: INK_DIM,
                    fontFamily: SERIF_ITALIC,
                  }}
                >
                  {t("code.subtitle", { email })}
                </Text>
              </View>

              <View style={{ marginTop: 32, gap: 16 }}>
                <View>
                  <Text
                    style={{ fontFamily: SERIF_BOLD,
                      marginBottom: 6,
                      fontSize: 12,
                      color: INK_DIM,
                      letterSpacing: 0.5,
                    }}
                  >
                    {t("code.label")}
                  </Text>
                  <TextInput
                    inputMode="numeric"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    placeholder="••••••"
                    placeholderTextColor={PLACEHOLDER}
                    autoFocus
                    style={{
                      backgroundColor: INPUT_BG,
                      borderColor: INK_BORDER,
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingVertical: 20,
                      fontSize: 28,
                      textAlign: "center",
                      letterSpacing: 12,
                      color: INK,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  />
                </View>

                {info && !error ? <Text style={{ fontFamily: SERIF, color: BRONZE, fontSize: 14 }}>{info}</Text> : null}
                {error ? <Text style={{ fontFamily: SERIF, color: ERROR, fontSize: 14 }}>{error}</Text> : null}

                <Pressable
                  onPress={onSubmitCode}
                  disabled={submitting || code.length !== 6}
                  style={{
                    marginTop: 8,
                    backgroundColor: submitting || code.length !== 6 ? GOLD_MUTED : GOLD,
                    borderRadius: 999,
                    height: 52,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, color: INK_ON_GOLD, fontSize: 16,}}>
                    {submitting ? t("code.verifying") : t("code.signIn")}
                  </Text>
                </Pressable>

                <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: 16, rowGap: 8 }}>
                  <Pressable disabled={submitting} onPress={() => setStep("credentials")}>
                    <Text style={{ fontFamily: SERIF, color: BRONZE, fontSize: 14,}}>
                      ← {t("code.differentAccount")}
                    </Text>
                  </Pressable>
                  <Pressable disabled={submitting} onPress={onSubmitCredentials}>
                    <Text style={{ fontFamily: SERIF, color: BRONZE, fontSize: 14,}}>
                      {t("code.resend")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
          </AuthCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface FieldProps {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "email-address" | "number-pad" | "numeric";
  autoComplete?: "email" | "off";
  autoCapitalize?: "none" | "sentences";
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoComplete,
  autoCapitalize,
}: FieldProps) {
  return (
    <View>
      <Text
        style={{ fontFamily: SERIF_BOLD,
          marginBottom: 6,
          fontSize: 12,
          color: INK_DIM,
          letterSpacing: 0.5,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        style={{ fontFamily: SERIF,
          backgroundColor: INPUT_BG,
          borderColor: INK_BORDER,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 16,
          fontSize: 16,
          color: INK,
        }}
      />
    </View>
  );
}
