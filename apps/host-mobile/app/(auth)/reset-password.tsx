// Host password reset — completion step. Reached via the deep link
// vendora-host://reset-password?token_hash=...&type=recovery that the
// emailed landing page hands off to us. We redeem the token with
// verifyOtp and let the user set a new password via
// supabase.auth.updateUser({ password }).
//
// Why token_hash and not the #access_token fragment GoTrue used to
// send: that fragment did not survive the browser -> custom-scheme
// handoff, so the app landed here with no URL at all and every reset
// read as "expired". Query params do survive, and expo-router parses
// them straight into route params — hence useLocalSearchParams as the
// primary source, with Linking.useURL() only as a backstop for links
// minted before this change.
//
// Flow:
//   1. Read token_hash from the route (or, for old links, access_token
//      /refresh_token from the URL fragment).
//   2. verifyOtp (or setSession) → recovery session.
//   3. Render the new-password form.
//   4. updateUser → success → route to /(host) and let the auth gate
//      pick up the now-authenticated session.

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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

      // Fallback: maybe the session was already seeded by Supabase's
      // built-in URL listener before we mounted.
      const { data } = await supabase.auth.getSession();
      if (!mounted.current || settled.current) return;
      if (data.session) {
        settled.current = true;
        setState("ready");
        return;
      }

      // Nothing usable yet — wait for the url event before giving up.
      if (!waitedForUrl) return;
      settled.current = true;
      setError("This reset link is invalid. Request a new one.");
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
    setTimeout(() => router.replace("/(host)/inbox"), 800);
  }

  if (state === "loading") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: CREAM,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  if (state === "error") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
          <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 32,
              color: INK,
            }}
          >
            Link expired
          </Text>
          <Text style={{ fontFamily: SERIF, marginTop: 10, color: INK_DIM, fontSize: 15 }}>
            {error ?? "This password reset link is no longer valid."}
          </Text>
          <Pressable
            onPress={() => router.replace("/(auth)/forgot-password")}
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
              Request a new link
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 36,
              color: INK,
              letterSpacing: -1,
            }}
          >
            {state === "done" ? "Password updated" : "Set a new password"}
          </Text>
          {state === "done" ? (
            <Text
              style={{ fontFamily: SERIF,
                marginTop: 12,
                color: INK_DIM,
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              You're signed in. Sending you to your inbox…
            </Text>
          ) : (
            <>
              <Text
                style={{ fontFamily: SERIF,
                  marginTop: 10,
                  color: INK_DIM,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                Pick a password you don't use elsewhere. At least 8
                characters.
              </Text>

              <View style={{ marginTop: 24 }}>
                <Text
                  style={{ fontFamily: SERIF_BOLD,
                    color: INK_DIM,
                    fontSize: 12,
                    letterSpacing: 0.8,
                  }}
                >
                  NEW PASSWORD
                </Text>
                <View
                  style={{
                    marginTop: 6,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: INPUT_BG,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: INK_BORDER,
                    paddingRight: 8,
                  }}
                >
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    placeholder="••••••••"
                    placeholderTextColor={INK_DIM}
                    style={{ fontFamily: SERIF,
                      flex: 1,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: INK,
                      fontSize: 16,
                    }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                    style={{ paddingHorizontal: 8 }}
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={18}
                      color={INK_DIM}
                    />
                  </Pressable>
                </View>
              </View>

              {error ? (
                <Text style={{ fontFamily: SERIF, marginTop: 12, color: ERROR, fontSize: 13 }}>
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={onSubmit}
                disabled={state === "submitting" || password.length < 8}
                style={{
                  marginTop: 18,
                  backgroundColor: INK,
                  borderRadius: 999,
                  height: 54,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity:
                    state === "submitting" || password.length < 8 ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 16,}}>
                  {state === "submitting" ? "Saving…" : "Save password"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
