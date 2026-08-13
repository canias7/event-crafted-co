// Vendor password reset — completion step. Reached via the deep link
// vendora-vendor://reset-password#access_token=...&refresh_token=...&type=recovery
// that Supabase puts in the recovery email. We parse the tokens, seed
// the session, and let the user set a new password via
// supabase.auth.updateUser({ password }).
//
// Flow:
//   1. Cold/warm start with the recovery URL → expo-linking gives us
//      the full URL (including fragment).
//   2. Parse the fragment → call setSession.
//   3. Once we have a session, render the new-password form.
//   4. updateUser → success → route to /(vendor) and let the auth gate
//      pick up the now-authenticated session.
//
// Dark Vendora theme mirroring signup/login. No function-form style
// props (device interop drops them); TouchableOpacity for feedback.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
const PAGE = "#0d0f13";
const CREAM = "#f4efe6";
const INK_ON_GOLD = "#14161a";
const GOLD = "#d9bd82";
const GOLD_DIM = "rgba(217,189,130,0.45)";
const MUTED = "rgba(255,255,255,0.72)";
const FAINT = "rgba(255,255,255,0.45)";
const HAIRLINE = "rgba(255,255,255,0.14)";
const INPUT_BG = "rgba(255,255,255,0.05)";
const ERROR = "#f0938a";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

type State = "loading" | "ready" | "submitting" | "done" | "error";

function parseFragment(url: string): URLSearchParams {
  const hash = url.split("#")[1] ?? "";
  return new URLSearchParams(hash);
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The initial URL may have the recovery tokens in the fragment.
      const initialUrl = await Linking.getInitialURL();
      const fragment = initialUrl ? parseFragment(initialUrl) : null;
      const at = fragment?.get("access_token") ?? null;
      const rt = fragment?.get("refresh_token") ?? null;
      const type = fragment?.get("type") ?? null;
      if (at && rt && type === "recovery") {
        const { error: e } = await supabase.auth.setSession({
          access_token: at,
          refresh_token: rt,
        });
        if (cancelled) return;
        if (e) {
          setError("This reset link has expired. Request a new one.");
          setState("error");
          return;
        }
        setState("ready");
        return;
      }
      // Fallback: maybe the session was already seeded by Supabase's
      // built-in URL listener before we mounted.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setState("ready");
      else {
        setError("This reset link is invalid. Request a new one.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit() {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setState("submitting");
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) {
      setError(e.message);
      setState("ready");
      return;
    }
    setState("done");
    setTimeout(() => router.replace("/(vendor)/profile"), 800);
  }

  if (state === "loading") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: PAGE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar barStyle="light-content" backgroundColor={PAGE} />
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (state === "error") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
        <StatusBar barStyle="light-content" backgroundColor={PAGE} />
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            hitSlop={12}
            style={{ alignSelf: "flex-start", paddingVertical: 8 }}
          >
            <Text style={{ color: MUTED, fontSize: 16, fontWeight: "500" }}>
              ← Back
            </Text>
          </Pressable>

          <StepHeader
            eyebrow="RESET PASSWORD"
            title="Link expired"
            subtitle={error ?? "This password reset link is no longer valid."}
          />

          <TouchableOpacity
            onPress={() => router.replace("/(auth)/forgot-password")}
            activeOpacity={0.85}
            style={{ ...primaryBtn, marginTop: 28 }}
          >
            <Text style={primaryBtnText}>Request a new link</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="light-content" backgroundColor={PAGE} />
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
          <StepHeader
            eyebrow={state === "done" ? "ALL SET" : "RESET PASSWORD"}
            title={state === "done" ? "Password updated" : "Set a new password"}
            subtitle={
              state === "done"
                ? "You're signed in. Sending you to your profile…"
                : "Pick a password you don't use elsewhere. At least 8 characters."
            }
          />

          {state === "done" ? null : (
            <View style={{ marginTop: 28, gap: 20 }}>
              <View>
                <Text style={fieldLabel}>NEW PASSWORD</Text>
                <View style={inputRow}>
                  <MaterialCommunityIcons
                    name="lock-outline"
                    size={20}
                    color={GOLD}
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    placeholder="••••••••"
                    placeholderTextColor={FAINT}
                    selectionColor={GOLD}
                    keyboardAppearance="dark"
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
                onPress={onSubmit}
                disabled={state === "submitting" || password.length < 8}
                activeOpacity={0.85}
                style={{
                  ...primaryBtn,
                  opacity:
                    state === "submitting" || password.length < 8 ? 0.5 : 1,
                }}
              >
                <Text style={primaryBtnText}>
                  {state === "submitting" ? "Saving…" : "Save password"}
                </Text>
              </TouchableOpacity>
            </View>
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
      <View style={{ flex: 1, height: 1, backgroundColor: GOLD_DIM }} />
      <MaterialCommunityIcons name="star-four-points" size={16} color={GOLD} />
      <View style={{ flex: 1, height: 1, backgroundColor: GOLD_DIM }} />
    </View>
  );
}

function StepHeader(p: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={eyebrowLabel}>{p.eyebrow}</Text>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 38,
          lineHeight: 46,
          fontWeight: "700",
          color: CREAM,
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
  fontSize: 17,
  color: MUTED,
  fontStyle: "italic" as const,
  fontFamily: SERIF,
  lineHeight: 24,
};
const fieldLabel = {
  marginBottom: 8,
  fontSize: 13,
  fontWeight: "700" as const,
  color: CREAM,
  letterSpacing: 1.5,
};
const inputRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  backgroundColor: INPUT_BG,
  borderColor: HAIRLINE,
  borderWidth: 1,
  borderRadius: 16,
  paddingHorizontal: 16,
  minHeight: 60,
};
const inputText = {
  flex: 1,
  fontSize: 16,
  color: CREAM,
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
