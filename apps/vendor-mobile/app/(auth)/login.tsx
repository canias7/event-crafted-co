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
import { useKeyboardReveal } from "@/lib/useKeyboardReveal";
import { AuthBackdrop } from "@/components/AuthBackdrop";
import { AuthCard } from "@/components/AuthCard";
import { useT } from "@/lib/i18n";
import { C, IS_DARK } from "@/lib/theme";

// Same palette as welcome.tsx / signup.tsx.
const PAGE = C.page;
const INK = C.text;
const INK_ON_GOLD = C.onGold;
const GOLD = C.gold;
// Champagne bronze — the landing page's text accent. #c9a86a is
// reserved for fills and glyphs; as words on cream it only reaches
// 2:1, so every gold *label* uses this instead.
const BRONZE = C.accentText;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.text;
const SUBTLE = C.placeholder;
const BORDER = C.border;
const FIELD_BG = IS_DARK ? "rgba(255,255,255,0.05)" : C.field;
const FIELD_BORDER = C.border;
const ERROR = C.error;

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
        setError(t("errors.banned"));
      } else if (r?.reason === "not_confirmed") {
        setError(t("errors.notConfirmed"));
      } else if (r?.reason === "invalid_credentials") {
        setError(t("errors.invalidCredentials"));
      } else if (r?.reason === "wrong_app") {
        setError(t("errors.hostAccount"));
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
    const r = data as {
      ok?: boolean;
      reason?: string;
      access_token?: string;
      refresh_token?: string;
    } | null;
    if (!r?.ok) {
      setSubmitting(false);
      const reason = r?.reason ?? "unknown";
      if (reason === "invalid_code") setError(t("errors.invalidCode"));
      else if (reason === "expired") setError(t("errors.expired"));
      else if (reason === "too_many_attempts") setError(t("errors.tooMany"));
      else if (reason === "no_pending_code") setError(t("errors.noPending"));
      else setError(t("errors.verifyFailed"));
      return;
    }
    if (!r.access_token || !r.refresh_token) {
      setSubmitting(false);
      setError(t("errors.completeFailed"));
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
        setError(t("errors.hostAccount"));
        return;
      }
      if (role === "vendor" && status !== "approved") {
        await supabase.auth.signOut();
        setSubmitting(false);
        if (status === "rejected") {
          setError(t("errors.rejected"));
        } else {
          setError(t("errors.underReview"));
        }
        return;
      }
    }
    setSubmitting(false);
    router.replace("/(vendor)/profile");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <AuthBackdrop />
      <StatusBar barStyle={C.statusBar === "dark" ? "dark-content" : "light-content"} backgroundColor={PAGE} />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <ScrollView
          {...keyboard.scrollProps}
          contentContainerStyle={{
            paddingHorizontal: 20,
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
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 16}}>
              ← {t("back")}
            </Text>
          </Pressable>

          <AuthCard>
          {step === "credentials" ? (
            <>
              <StepHeader
                eyebrow={t("credentials.eyebrow")}
                title={t("credentials.title")}
                subtitle={t("credentials.subtitle")}
              />

              <View style={{ marginTop: 28, gap: 20 }}>
                <View>
                  <Text style={fieldLabel}>{t("credentials.email")}</Text>
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
                      keyboardAppearance={IS_DARK ? "dark" : "light"}
                      keyboardType="email-address"
                      autoComplete="email"
                      autoCapitalize="none"
                      style={inputText}
                    />
                  </View>
                </View>

                <View>
                  <Text style={fieldLabel}>{t("credentials.password")}</Text>
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
                      keyboardAppearance={IS_DARK ? "dark" : "light"}
                      autoComplete="current-password"
                      style={inputText}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      style={{ paddingLeft: 10 }}
                    >
                      <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 14}}>
                        {showPassword ? t("credentials.hide") : t("credentials.show")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {error ? <Text style={errorText}>{error}</Text> : null}

                <TouchableOpacity
                  onPress={onSubmitCredentials}
                  disabled={submitting || !email || !password}
                  activeOpacity={0.85}
                  style={primaryBtnFor(submitting || !email || !password)}
                >
                  <Text style={primaryBtnTextFor(submitting || !email || !password)}>
                    {submitting ? t("credentials.sending") : t("credentials.continue")}
                  </Text>
                </TouchableOpacity>
                <Text
                  style={{
                    fontFamily: SERIF,
                    marginTop: 0,
                    textAlign: "center",
                    fontSize: 12,
                    color: SUBTLE,
                  }}
                >
                  {t("credentials.codeNote")}
                </Text>

                <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password")}
                  activeOpacity={0.7}
                  style={{ marginTop: 8, alignItems: "center" }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 14 }}>
                    {t("credentials.forgot")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.replace("/(auth)/signup")}
                  activeOpacity={0.7}
                  style={{ marginTop: 8, alignItems: "center" }}
                >
                  <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14 }}>
                    {t("credentials.newHere")}{" "}
                    <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE}}>
                      {t("credentials.createAccount")}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <StepHeader
                eyebrow={t("code.eyebrow")}
                title={t("code.title")}
                subtitle={t("code.subtitle", { email })}
              />

              <View style={{ marginTop: 28, gap: 20 }}>
                <View>
                  <Text style={fieldLabel}>{t("code.label")}</Text>
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
                    keyboardAppearance={IS_DARK ? "dark" : "light"}
                    autoFocus
                    style={{
                      backgroundColor: FIELD_BG,
                      borderColor: FIELD_BORDER,
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingVertical: 20,
                      fontSize: 30,
                      textAlign: "center",
                      letterSpacing: 12,
                      color: INK,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  />
                </View>

                {info && !error ? (
                  <Text style={{ fontFamily: SERIF, color: BRONZE, fontSize: 14 }}>{info}</Text>
                ) : null}
                {error ? <Text style={errorText}>{error}</Text> : null}

                <TouchableOpacity
                  onPress={onSubmitCode}
                  disabled={submitting || code.length !== 6}
                  activeOpacity={0.85}
                  style={primaryBtnFor(submitting || code.length !== 6)}
                >
                  <Text style={primaryBtnTextFor(submitting || code.length !== 6)}>
                    {submitting ? t("code.verifying") : t("code.signIn")}
                  </Text>
                </TouchableOpacity>

                <View
                  style={{
                    marginTop: 4,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    columnGap: 16,
                    rowGap: 8,
                  }}
                >
                  <TouchableOpacity
                    disabled={submitting}
                    onPress={() => setStep("credentials")}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontFamily: SERIF, color: BRONZE, fontSize: 14}}>
                      ← {t("code.differentAccount")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={submitting}
                    onPress={onSubmitCredentials}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontFamily: SERIF, color: BRONZE, fontSize: 14}}>
                      {t("code.resend")}
                    </Text>
                  </TouchableOpacity>
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


function StepHeader(p: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View>
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
    </View>
  );
}

const eyebrowLabel = {
  fontFamily: SERIF_BOLD,
  color: BRONZE,
  fontSize: 12,
  letterSpacing: 3,
};
const subhead = {
  fontFamily: SERIF,
  marginTop: 10,
  fontSize: 13,
  color: INK_DIM,
  lineHeight: 19,
};
const fieldLabel = {
  fontFamily: SERIF_BOLD,
  marginBottom: 8,
  fontSize: 13,
  color: INK,
  letterSpacing: 1.5,
};
const inputRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  backgroundColor: FIELD_BG,
  borderColor: FIELD_BORDER,
  borderWidth: 1,
  borderRadius: 12,
  paddingHorizontal: 16,
  minHeight: 60,
};
const inputText = {
  fontFamily: SERIF,
  flex: 1,
  fontSize: 16,
  color: INK,
  paddingVertical: 16,
};
const primaryBtn = {
  marginTop: 4,
  backgroundColor: GOLD,
  borderRadius: 999,
  // 52 / 16 and no shadow — the same pill the welcome screen uses for
  // Sign up and Sign in, so every gold primary in the flow matches.
  height: 52,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const primaryBtnText = {
  fontFamily: SERIF_BOLD,
  color: INK_ON_GOLD,
  fontSize: 16,
};

// A disabled primary button used to be the enabled one at 50% opacity.
// On gold over cream that fades BOTH fill and label toward the page, so
// it read as broken rather than as "nothing typed yet". Give the state
// its own solid colours instead, and keep the lift for the live one.
const GOLD_MUTED = C.goldMuted;
function primaryBtnFor(disabled: boolean) {
  return disabled ? { ...primaryBtn, backgroundColor: GOLD_MUTED } : primaryBtn;
}
// The label stays ink in both states. A bronze label only reaches 3.7:1
// on the muted fill, and bronze-on-gold would be worse still — the fill
// alone is a clear enough cue, and both states stay readable.
function primaryBtnTextFor(_disabled: boolean) {
  return primaryBtnText;
}
const errorText = {
  fontFamily: SERIF,
  color: ERROR,
  fontSize: 14,
  lineHeight: 20,
};
