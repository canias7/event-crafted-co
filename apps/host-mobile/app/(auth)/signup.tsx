// Host signup — email + password on step 1, 6-digit code on step 2.
//
// Flow:
//   1. User enters email + password → tap Sign up → we call
//      signInWithOtp({ shouldCreateUser:true, data:{intended_role:"host"} })
//      which mails a 6-digit code AND creates the auth user (the
//      role lands in user_metadata so handle_new_user provisions
//      the host profile).
//   2. User enters the code → verifyOtp signs them in. We then
//      call updateUser({ password }) to set the password they
//      typed on step 1, so future logins can use email + password
//      (login.tsx) instead of OTP.

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

const CREAM = "#faf5ec";
const INK = "#1a1410";
const INK_DIM = "rgba(26,20,16,0.6)";
const INK_BORDER = "rgba(26,20,16,0.18)";
const INPUT_BG = "#ffffff";
const ERROR = "#b42318";
const ACCENT = "#a08259";

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

type Stage = "form" | "code";

export default function SignupScreen() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendCode() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        data: { intended_role: "host" },
      },
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStage("code");
    setInfo("We emailed you a 6-digit code. Enter it below.");
  }

  async function verifyAndSetPassword() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: code.trim(),
      type: "email",
    });
    if (verifyErr) {
      setSubmitting(false);
      setError(verifyErr.message);
      return;
    }
    // Now signed in — set the password the user typed on step 1 so
    // they can log in with email + password from now on.
    const { error: passErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (passErr) {
      setError(
        `Account created, but couldn't save password: ${passErr.message}`,
      );
      return;
    }
    // The (host) layout redirects to home automatically once useAuth
    // picks up the session.
  }

  async function resend() {
    setCode("");
    await sendCode();
  }

  const formValid = email.trim() && password.length >= 8;
  const codeValid = code.length === 6;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}
      >
        <Pressable
          onPress={() => {
            if (stage === "code") {
              setStage("form");
              setCode("");
              setError(null);
              setInfo(null);
            } else {
              router.back();
            }
          }}
          hitSlop={12}
          style={{ alignSelf: "flex-start", paddingVertical: 8 }}
        >
          <Text style={{ color: INK_DIM, fontSize: 16, fontWeight: "500" }}>
            ← Back
          </Text>
        </Pressable>

        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: 36,
              fontWeight: "700",
              color: INK,
              letterSpacing: -1,
            }}
          >
            {stage === "form" ? "Plan your event" : "Enter your code"}
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 15,
              color: INK_DIM,
              fontStyle: "italic",
              fontFamily: SERIF,
            }}
          >
            {stage === "form"
              ? "Create an account to message vendors and book events."
              : `We sent a 6-digit code to ${email.trim().toLowerCase()}.`}
          </Text>
        </View>

        <View style={{ marginTop: 32, gap: 16 }}>
          {stage === "form" ? (
            <>
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
                  style={{
                    marginBottom: 6,
                    fontSize: 12,
                    fontWeight: "600",
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
                    placeholder="At least 8 characters"
                    placeholderTextColor={INK_DIM}
                    style={{
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
                    <Text
                      style={{ color: ACCENT, fontSize: 13, fontWeight: "600" }}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <Field
              label="Code"
              placeholder="123456"
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoCapitalize="none"
            />
          )}

          {error ? (
            <Text style={{ color: ERROR, fontSize: 14 }}>{error}</Text>
          ) : null}
          {info && !error ? (
            <Text style={{ color: ACCENT, fontSize: 14 }}>{info}</Text>
          ) : null}

          <Pressable
            onPress={stage === "form" ? sendCode : verifyAndSetPassword}
            disabled={
              submitting || (stage === "form" ? !formValid : !codeValid)
            }
            style={{
              marginTop: 8,
              backgroundColor: INK,
              borderRadius: 999,
              height: 54,
              alignItems: "center",
              justifyContent: "center",
              opacity:
                submitting || (stage === "form" ? !formValid : !codeValid)
                  ? 0.5
                  : 1,
            }}
          >
            <Text style={{ color: CREAM, fontSize: 16, fontWeight: "600" }}>
              {submitting
                ? stage === "form"
                  ? "Sending…"
                  : "Verifying…"
                : stage === "form"
                  ? "Sign up"
                  : "Verify"}
            </Text>
          </Pressable>

          {stage === "code" ? (
            <Pressable
              onPress={resend}
              disabled={submitting}
              style={{ alignItems: "center", paddingVertical: 8 }}
            >
              <Text style={{ color: ACCENT, fontSize: 14, fontWeight: "600" }}>
                Resend code
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.replace("/(auth)/login")}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={{ color: INK_DIM, fontSize: 14 }}>
                Already have an account?{" "}
                <Text style={{ color: INK, fontWeight: "600" }}>Log in</Text>
              </Text>
            </Pressable>
          )}
        </View>
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
        style={{
          marginBottom: 6,
          fontSize: 12,
          fontWeight: "600",
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
        style={{
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
