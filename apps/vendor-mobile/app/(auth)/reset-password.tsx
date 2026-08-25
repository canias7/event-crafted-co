// Vendor password reset — completion step. Reached via the deep link
// vendora-vendor://reset-password?token_hash=...&type=recovery that the
// emailed landing page hands off to us. We redeem the token with
// verifyOtp, which mints the recovery session, then let the user set a
// new password via supabase.auth.updateUser({ password }).
//
// Why token_hash and not the #access_token fragment GoTrue used to
// send: that fragment never survived the browser -> custom-scheme
// handoff. The app opened on this screen with no URL reaching it at
// all, so every reset read as "expired". Query params do survive, and
// expo-router parses them straight into route params — which is why
// useLocalSearchParams is the primary source here and Linking.useURL()
// is only a backstop for links minted before this change.
//
// Flow:
//   1. Read token_hash from the route (or, for old links, access_token
//      /refresh_token from the URL fragment).
//   2. verifyOtp (or setSession) → recovery session.
//   3. Render the new-password form.
//   4. updateUser → success → route to /(vendor) and let the auth gate
//      pick up the now-authenticated session.
//
// Cream Vendora theme mirroring signup/login. No function-form style
// props (device interop drops them); TouchableOpacity for feedback.

import { useEffect, useRef, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

// Same palette as welcome / signup / login.
const PAGE = "#f4f1ea";
const INK = "#14161a";
const INK_ON_GOLD = "#14161a";
const GOLD = "#c9a86a";
// Champagne bronze — the landing page's text accent. #c9a86a is
// reserved for fills and glyphs; as words on cream it only reaches
// 2:1, so every gold *label* uses this instead.
const BRONZE = "#8a6f3e";
const GOLD_HAIRLINE = "rgba(201,168,106,0.5)";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const SUBTLE = "#a89678";
const BORDER = "#e6e1d5";
const FIELD_BG = "#fbf9f4";
const FIELD_BORDER = "#d9d1bf";
const ERROR = "#b23a34";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

type State = "loading" | "ready" | "submitting" | "done" | "error";

// Backstop for links minted before the token_hash change: GoTrue put the
// tokens in the fragment and failures in the query string, so read both.
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

// Route params come back as string | string[] depending on how many
// times the key appeared; we only ever want the first.
function one(v: unknown): string | null {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : null;
  return typeof v === "string" ? v : null;
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Primary source — expo-router already parsed the deep link's query
  // string by the time this screen mounts. Pulled apart into primitives
  // so the effect below has stable dependencies.
  const params = useLocalSearchParams();
  const routeTokenHash = one(params.token_hash);
  const routeType = one(params.type);
  const routeError = one(params.error_description) ?? one(params.error);

  // Backstop: seeds from getInitialURL (cold start) and updates on every
  // incoming url event (warm start). Only old fragment links need it.
  const url = Linking.useURL();
  // Flips once the url event has had time to arrive, so a genuinely
  // link-less visit resolves to an error instead of an endless spinner.
  const [waitedForUrl, setWaitedForUrl] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaitedForUrl(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // This effect legitimately re-runs — useURL() is null on the first
  // render and fills in once the event lands, and waitedForUrl flips a
  // beat later. Redeeming a recovery token SPENDS it, so without this
  // guard the second pass re-submits an already-used token, GoTrue
  // rejects it, and the screen flips from the form to "expired" a
  // second after opening. Latch as soon as we commit to an outcome, and
  // set it BEFORE awaiting so an overlapping re-run can't slip through.
  const settled = useRef(false);
  // Effect re-runs are not unmounts, so the usual per-run `cancelled`
  // flag would strand a redemption in flight; track real unmount only.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (settled.current) return;
    void (async () => {
      const fromUrl = url ? parseParams(url) : null;

      // GoTrue reports a dead or already-used token this way rather than
      // by redirecting with tokens that then fail.
      const linkError =
        routeError ??
        fromUrl?.get("error_description") ??
        fromUrl?.get("error") ??
        null;
      if (linkError) {
        settled.current = true;
        setError(decodeURIComponent(linkError.replace(/\+/g, " ")));
        setState("error");
        return;
      }

      // The current path: redeem the single-use hash for a session.
      const tokenHash = routeTokenHash ?? fromUrl?.get("token_hash") ?? null;
      if (tokenHash) {
        settled.current = true;
        const { error: e } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (!mounted.current) return;
        if (e) {
          setError("This reset link has expired. Request a new one.");
          setState("error");
          return;
        }
        setState("ready");
        return;
      }

      // Legacy path: fragment tokens from a link sent before the change.
      const at = fromUrl?.get("access_token") ?? null;
      const rt = fromUrl?.get("refresh_token") ?? null;
      const type = routeType ?? fromUrl?.get("type") ?? null;
      if (at && rt && type === "recovery") {
        settled.current = true;
        const { error: e } = await supabase.auth.setSession({
          access_token: at,
          refresh_token: rt,
        });
        if (!mounted.current) return;
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
      if (!mounted.current || settled.current) return;
      if (data.session) {
        settled.current = true;
        setState("ready");
        return;
      }

      // Nothing usable yet — the URL may still be on its way, so wait a
      // beat rather than flashing an error we are about to contradict.
      // Do not spin forever if no link is coming at all.
      if (!waitedForUrl) return;
      settled.current = true;
      setError("We couldn't read that reset link. Request a new one.");
      setState("error");
    })();
  }, [routeTokenHash, routeType, routeError, url, waitedForUrl]);

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
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 16}}>
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
                    <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 14}}>
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
                style={primaryBtnFor(state === "submitting" || password.length < 8)}
              >
                <Text style={primaryBtnTextFor(state === "submitting" || password.length < 8)}>
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
  fontFamily: SERIF_BOLD,
  color: BRONZE,
  fontSize: 12,
  letterSpacing: 3,
};
const subhead = {
  fontFamily: SERIF,
  marginTop: 10,
  fontSize: 13.5,
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
const GOLD_MUTED = "#e0d2b0";
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
