// Vendor login. Two-step 2FA: email+password → 6-digit code emailed via
// Resend. Dark Vendora theme mirroring signup.tsx — same palette, gold
// eyebrow + serif headline + star divider, dark bordered inputs with
// gold leading icons.
//
// Styling rule carried over from the welcome-screen debugging: no
// function-form style props (the styling interop drops them on device).
// Plain objects only; TouchableOpacity supplies press feedback.

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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

// Same palette as welcome.tsx / signup.tsx.
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
        app: "vendor",
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
          "That email is a host account. Open the Vendora app to sign in.",
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
    const r = data as {
      ok?: boolean;
      reason?: string;
      access_token?: string;
      refresh_token?: string;
    } | null;
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
    if (!r.access_token || !r.refresh_token) {
      setSubmitting(false);
      setError("Couldn't complete sign-in. Please try again.");
      return;
    }
    // The edge function already minted the session server-side (password +
    // 6-digit code were verified there). Install it with setSession, which
    // never hits the project's captcha bot-protection — unlike the client
    // verifyOtp/password grant, which GoTrue rejects in a native app.
    const { data: signInData, error: signInErr } =
      await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
    if (signInErr) {
      setSubmitting(false);
      setError(signInErr.message);
      return;
    }
    // Vendor app gate. Two checks:
    //   1. role IN ('vendor','admin') — host accounts go elsewhere.
    //   2. application_status = 'approved' — vendor signups have to
    //      be reviewed + approved by an admin before they can use
    //      the app. Pending / rejected signups bounce here.
    const userId = signInData.user?.id;
    if (userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role, application_status")
        .eq("id", userId)
        .maybeSingle();
      const row = (prof as {
        role?: string;
        application_status?: string;
      } | null) ?? {};
      const role = row.role ?? "host";
      const status = row.application_status ?? "approved";
      if (role !== "vendor" && role !== "admin") {
        await supabase.auth.signOut();
        setSubmitting(false);
        setError(
          "That email is a host account. Open the Vendora app to sign in.",
        );
        return;
      }
      if (role === "vendor" && status !== "approved") {
        await supabase.auth.signOut();
        setSubmitting(false);
        if (status === "rejected") {
          setError(
            "Your vendor application wasn't approved. Reach out to support if you think this is a mistake.",
          );
        } else {
          setError(
            "Your vendor application is still under review. We'll email you the moment it's approved.",
          );
        }
        return;
      }
    }
    setSubmitting(false);
    router.replace("/(vendor)/profile");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
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
              if (step === "code") {
                setStep("credentials");
              } else if (router.canGoBack()) {
                router.back();
              } else {
                // Deep launch straight into login leaves nothing on the
                // stack — back() would silently no-op (same dead-button
                // bug signup had).
                router.replace("/(auth)/welcome");
              }
            }}
            hitSlop={12}
            style={{ alignSelf: "flex-start", paddingVertical: 8 }}
          >
            <Text style={{ color: INK_DIM, fontSize: 16, fontWeight: "500" }}>
              ← Back
            </Text>
          </Pressable>

          {step === "credentials" ? (
            <>
              <StepHeader
                eyebrow="SIGN IN"
                title="Welcome back"
                subtitle="Log in to plan your next event."
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
                      placeholder="you@example.com"
                      placeholderTextColor={SUBTLE}
                      selectionColor={GOLD}
                      keyboardAppearance="dark"
                      keyboardType="email-address"
                      autoComplete="email"
                      autoCapitalize="none"
                      style={inputText}
                    />
                  </View>
                </View>

                <View>
                  <Text style={fieldLabel}>PASSWORD</Text>
                  <View style={inputRow}>
                    <MaterialCommunityIcons
                      name="lock-outline"
                      size={20}
                      color={GOLD}
                      style={{ marginRight: 10 }}
                    />
                    <TextInput
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor={SUBTLE}
                      selectionColor={GOLD}
                      keyboardAppearance="dark"
                      autoComplete="current-password"
                      style={inputText}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      style={{ paddingLeft: 10 }}
                    >
                      <Text style={{ color: GOLD, fontSize: 14, fontWeight: "600" }}>
                        {showPassword ? "Hide" : "Show"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {error ? <Text style={errorText}>{error}</Text> : null}

                <TouchableOpacity
                  onPress={onSubmitCredentials}
                  disabled={submitting || !email || !password}
                  activeOpacity={0.85}
                  style={{
                    ...primaryBtn,
                    opacity: submitting || !email || !password ? 0.5 : 1,
                  }}
                >
                  <Text style={primaryBtnText}>
                    {submitting ? "Sending code…" : "Continue"}
                  </Text>
                </TouchableOpacity>
                <Text
                  style={{
                    marginTop: 0,
                    textAlign: "center",
                    fontSize: 12,
                    color: SUBTLE,
                  }}
                >
                  We'll email you a 6-digit code to confirm it's you.
                </Text>

                <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password")}
                  activeOpacity={0.7}
                  style={{ marginTop: 8, alignItems: "center" }}
                >
                  <Text style={{ color: GOLD, fontWeight: "600", fontSize: 14 }}>
                    Forgot your password?
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.replace("/(auth)/signup")}
                  activeOpacity={0.7}
                  style={{ marginTop: 8, alignItems: "center" }}
                >
                  <Text style={{ color: INK_DIM, fontSize: 14 }}>
                    New here?{" "}
                    <Text style={{ color: GOLD, fontWeight: "600" }}>
                      Create an account
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <StepHeader
                eyebrow="ONE MORE STEP"
                title="Check your email"
                subtitle={`We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
              />

              <View style={{ marginTop: 28, gap: 20 }}>
                <View>
                  <Text style={fieldLabel}>6-DIGIT CODE</Text>
                  <TextInput
                    inputMode="numeric"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    placeholder="••••••"
                    placeholderTextColor={SUBTLE}
                    selectionColor={GOLD}
                    keyboardAppearance="dark"
                    autoFocus
                    style={{
                      backgroundColor: FIELD_BG,
                      borderColor: FIELD_BORDER,
                      borderWidth: 1,
                      borderRadius: 16,
                      paddingVertical: 18,
                      fontSize: 28,
                      textAlign: "center",
                      letterSpacing: 12,
                      color: INK,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  />
                </View>

                {info && !error ? (
                  <Text style={{ color: GOLD, fontSize: 14 }}>{info}</Text>
                ) : null}
                {error ? <Text style={errorText}>{error}</Text> : null}

                <TouchableOpacity
                  onPress={onSubmitCode}
                  disabled={submitting || code.length !== 6}
                  activeOpacity={0.85}
                  style={{
                    ...primaryBtn,
                    opacity: submitting || code.length !== 6 ? 0.5 : 1,
                  }}
                >
                  <Text style={primaryBtnText}>
                    {submitting ? "Verifying…" : "Sign in"}
                  </Text>
                </TouchableOpacity>

                <View
                  style={{
                    marginTop: 4,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <TouchableOpacity
                    disabled={submitting}
                    onPress={() => setStep("credentials")}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: GOLD, fontSize: 14, fontWeight: "500" }}>
                      ← Use a different account
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={submitting}
                    onPress={onSubmitCredentials}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: GOLD, fontSize: 14, fontWeight: "500" }}>
                      Resend code
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Gold hairlines meeting a four-point star — same divider as signup.tsx.
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
