// Vendor password reset — completion step. Reached via the deep link
// vendora-vendor://reset-password#access_token=...&refresh_token=...&type=recovery
// that Supabase puts in the recovery email. We parse the tokens, seed
// the session, and let the user set a new password via
// supabase.auth.updateUser({ password }).
//
// Flow:
//   1. Cold OR warm start with the recovery URL. This matters: the
//      normal path is requesting the link from inside the app, then
//      switching to Mail and tapping it — which leaves the app RUNNING,
//      so it is a warm deep link. getInitialURL() only ever returns the
//      URL that launched the process, so on that path it returns null
//      (or a stale link) and the screen wrongly reported the link as
//      expired every time. Linking.useURL() covers both cases: it seeds
//      from getInitialURL and then updates on each incoming url event.
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

type State = "loading" | "ready" | "submitting" | "done" | "error";

// GoTrue puts the tokens in the fragment, but returns failures as query
// params (?error=...&error_description=...), so read both.
function parseParams(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  const [beforeHash, hash] = url.split("#");
  const query = beforeHash.split("?")[1];
  for (const part of [query, hash]) {
    if (!part) continue;
    new URLSearchParams(part).forEach((v, k) => merged.set(k, v));
  }
  return merged;
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeds from getInitialURL (cold start) and then updates on every
  // incoming url event (warm start) — see the flow note at the top.
  const url = Linking.useURL();
  // Flips once the url event has had time to arrive, so a genuinely
  // link-less visit resolves to an error instead of an endless spinner.
  const [waitedForUrl, setWaitedForUrl] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaitedForUrl(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = url ? parseParams(url) : null;

      // GoTrue reports a dead or already-used token this way rather than
      // by redirecting with tokens that then fail.
      const linkError = params?.get("error_description") ?? params?.get("error");
      if (linkError) {
        setError(decodeURIComponent(linkError.replace(/\+/g, " ")));
        setState("error");
        return;
      }

      const at = params?.get("access_token") ?? null;
      const rt = params?.get("refresh_token") ?? null;
      const type = params?.get("type") ?? null;
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

      // Maybe the session was already seeded by Supabase's built-in URL
      // listener before we mounted.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setState("ready");
        return;
      }

      // useURL() is null on the first render and fills in once the event
      // lands, so a missing URL here is usually just "not yet". Wait a
      // beat rather than flashing an error we are about to contradict —
      // but do not spin forever if no link is coming at all (someone
      // reached this screen without one).
      if (!url) {
        if (waitedForUrl) {
          setError("We couldn't read that reset link. Request a new one.");
          setState("error");
        }
        return;
      }

      setError("We couldn't read that reset link. Request a new one.");
      setState("error");
    })();
    return () => {
      cancelled = true;
    };
  }, [url, waitedForUrl]);

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
        <StatusBar barStyle="dark-content" backgroundColor={PAGE} />
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (state === "error") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
        <StatusBar barStyle="dark-content" backgroundColor={PAGE} />
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            hitSlop={12}
            style={{ alignSelf: "flex-start", paddingVertical: 8 }}
          >
            <Text style={{ color: INK_DIM, fontSize: 16, fontWeight: "500" }}>
              ← Back
            </Text>
          </Pressable>

          <StepHeader
            eyebrow="RESET PASSWORD"
            title={
              error?.startsWith("We couldn't read")
                ? "Link didn't open"
                : "Link expired"
            }
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
                    placeholderTextColor={SUBTLE}
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
          fontWeight: "700",
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
