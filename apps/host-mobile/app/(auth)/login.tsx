// Host login. Two-step 2FA: email+password → 6-digit code emailed via
// Resend. Cream/ink themed to match the welcome screen.

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
import { supabase } from "@/lib/supabase";

const CREAM = "#f4f1ea";
const INK = "#14161a";
const INK_DIM = "#14161a";
const INK_BORDER = "#e6e1d5";
const INPUT_BG = "#fbf9f4";
const ERROR = "#b23a34";
const ACCENT = "#1B3654";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

type Step = "credentials" | "code";

export default function LoginScreen() {
  const router = useRouter();
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
        setError("This account is currently locked. Please contact support if you think this is a mistake.");
      } else if (r?.reason === "not_confirmed") {
        setError("Your application is still under review. We'll email you the moment it's approved.");
      } else if (r?.reason === "invalid_credentials") {
        setError("Email or password is incorrect.");
      } else if (r?.reason === "wrong_app") {
        setError(
          "That email is a vendor account. Open the Vendora for Vendors app to sign in.",
        );
      } else {
        setError("Couldn't start sign-in. Please try again.");
      }
      return;
    }
    setInfo("We emailed you a 6-digit code.");
    setCode("");
    setStep("code");
  }

  async function onSubmitCode() {
    setError(null);
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code we emailed you.");
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
      if (reason === "invalid_code") setError("That code is incorrect.");
      else if (reason === "expired") setError("That code expired. Request a new one.");
      else if (reason === "too_many_attempts") setError("Too many attempts. Request a new code.");
      else if (reason === "no_pending_code") setError("No pending code. Start over.");
      else setError("Couldn't verify code.");
      return;
    }
    if (!r.token_hash) {
      setSubmitting(false);
      setError("Couldn't complete sign-in. Please try again.");
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
        setError(
          "That email is a vendor account. Open the Vendora for Vendors app to sign in.",
        );
        return;
      }
    }
    setSubmitting(false);
    router.replace("/(host)/explore");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}
      >
        <Pressable
          onPress={() => (step === "credentials" ? router.back() : setStep("credentials"))}
          hitSlop={12}
          style={{ alignSelf: "flex-start", paddingVertical: 8 }}
        >
          <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 16,}}>
            ← Back
          </Text>
        </Pressable>

        {step === "credentials" ? (
          <>
            <View style={{ marginTop: 24 }}>
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  fontSize: 36,
                  color: INK,
                  letterSpacing: -1,
                }}
              >
                Welcome back
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 15,
                  color: INK_DIM,
                  fontFamily: SERIF_ITALIC,
                }}
              >
                Log in to plan your next event.
              </Text>
            </View>

            <View style={{ marginTop: 32, gap: 16 }}>
              <Field
                label="Email"
                placeholder="you@example.com"
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
                  PASSWORD
                </Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={INK_DIM}
                    autoComplete="current-password"
                    style={{ fontFamily: SERIF,
                      backgroundColor: INPUT_BG,
                      borderColor: INK_BORDER,
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
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
                    <Text style={{ fontFamily: SERIF_BOLD, color: ACCENT, fontSize: 13,}}>
                      {showPassword ? "Hide" : "Show"}
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
                  backgroundColor: INK,
                  borderRadius: 999,
                  height: 54,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: submitting || !email || !password ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 16,}}>
                  {submitting ? "Sending code…" : "Continue"}
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
                We'll email you a 6-digit code to confirm it's you.
              </Text>

              <Pressable
                onPress={() => router.push("/(auth)/forgot-password")}
                style={{ marginTop: 12, alignItems: "center" }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 14 }}>
                  Forgot your password?
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.replace("/(auth)/signup")}
                style={{ marginTop: 12, alignItems: "center" }}
              >
                <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14 }}>
                  New here?{" "}
                  <Text style={{ fontFamily: SERIF_BOLD, color: INK,}}>Create an account</Text>
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={{ marginTop: 24 }}>
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
                style={{
                  marginTop: 8,
                  fontSize: 15,
                  color: INK_DIM,
                  fontFamily: SERIF_ITALIC,
                }}
              >
                We sent a 6-digit code to {email}. It expires in 10 minutes.
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
                  6-DIGIT CODE
                </Text>
                <TextInput
                  inputMode="numeric"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  placeholder="••••••"
                  placeholderTextColor={INK_DIM}
                  autoFocus
                  style={{
                    backgroundColor: INPUT_BG,
                    borderColor: INK_BORDER,
                    borderWidth: 1,
                    borderRadius: 14,
                    paddingVertical: 18,
                    fontSize: 28,
                    textAlign: "center",
                    letterSpacing: 12,
                    color: INK,
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  }}
                />
              </View>

              {info && !error ? <Text style={{ fontFamily: SERIF, color: ACCENT, fontSize: 14 }}>{info}</Text> : null}
              {error ? <Text style={{ fontFamily: SERIF, color: ERROR, fontSize: 14 }}>{error}</Text> : null}

              <Pressable
                onPress={onSubmitCode}
                disabled={submitting || code.length !== 6}
                style={{
                  marginTop: 8,
                  backgroundColor: INK,
                  borderRadius: 999,
                  height: 54,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: submitting || code.length !== 6 ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 16,}}>
                  {submitting ? "Verifying…" : "Sign in"}
                </Text>
              </Pressable>

              <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
                <Pressable disabled={submitting} onPress={() => setStep("credentials")}>
                  <Text style={{ fontFamily: SERIF, color: ACCENT, fontSize: 14,}}>
                    ← Use a different account
                  </Text>
                </Pressable>
                <Pressable disabled={submitting} onPress={onSubmitCredentials}>
                  <Text style={{ fontFamily: SERIF, color: ACCENT, fontSize: 14,}}>
                    Resend code
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
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
        placeholderTextColor={INK_DIM}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        style={{ fontFamily: SERIF,
          backgroundColor: INPUT_BG,
          borderColor: INK_BORDER,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 14,
          fontSize: 16,
          color: INK,
        }}
      />
    </View>
  );
}
