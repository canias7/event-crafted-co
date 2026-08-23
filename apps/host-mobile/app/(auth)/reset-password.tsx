// Host password reset — completion step. Reached via the deep link
// vendora-host://reset-password#access_token=...&refresh_token=...&type=recovery
// that Supabase puts in the recovery email. We parse the tokens, seed
// the session, and let the user set a new password via
// supabase.auth.updateUser({ password }).
//
// Flow:
//   1. Cold/warm start with the recovery URL → expo-linking gives us
//      the full URL (including fragment).
//   2. Parse the fragment → call setSession.
//   3. Once we have a session, render the new-password form.
//   4. updateUser → success → route to /(host) and let the auth gate
//      pick up the now-authenticated session.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

const CREAM = "#f4f1ea";
const INK = "#14161a";
const INK_DIM = "rgba(26,20,16,0.6)";
const INK_BORDER = "rgba(26,20,16,0.18)";
const INPUT_BG = "#fbf9f4";
const ERROR = "#dc2828";
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
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 32,
              fontWeight: "700",
              color: INK,
            }}
          >
            Link expired
          </Text>
          <Text style={{ marginTop: 10, color: INK_DIM, fontSize: 15 }}>
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
            <Text style={{ color: CREAM, fontSize: 16, fontWeight: "600" }}>
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
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 36,
              fontWeight: "700",
              color: INK,
              letterSpacing: -1,
            }}
          >
            {state === "done" ? "Password updated" : "Set a new password"}
          </Text>
          {state === "done" ? (
            <Text
              style={{
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
                style={{
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
                  style={{
                    color: INK_DIM,
                    fontSize: 12,
                    fontWeight: "700",
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
                    style={{
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
                <Text style={{ marginTop: 12, color: ERROR, fontSize: 13 }}>
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
                <Text style={{ color: CREAM, fontSize: 16, fontWeight: "600" }}>
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
