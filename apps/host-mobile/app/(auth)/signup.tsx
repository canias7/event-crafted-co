// Host signup. Cream/ink themed to match the welcome screen — same
// fonts, same dark pill submit, same back affordance into the
// auth-method picker. Logic is unchanged: signs up via Supabase
// auth.signUp with intended_role: 'host' so handle_new_user
// provisions a host profile.

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

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { intended_role: "host" } },
    });
    if (error) setError(error.message);
    else setInfo("Check your email to confirm your account.");
    setSubmitting(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}
      >
        <Pressable
          onPress={() => router.back()}
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
            Plan your event
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
            Create an account to message vendors and book events.
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
                  style={{
                    color: ACCENT,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>
          </View>

          {error ? (
            <Text style={{ color: ERROR, fontSize: 14 }}>{error}</Text>
          ) : null}
          {info && !error ? (
            <Text style={{ color: ACCENT, fontSize: 14 }}>{info}</Text>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={submitting || !email || password.length < 8}
            style={{
              marginTop: 8,
              backgroundColor: INK,
              borderRadius: 999,
              height: 54,
              alignItems: "center",
              justifyContent: "center",
              opacity:
                submitting || !email || password.length < 8 ? 0.5 : 1,
            }}
          >
            <Text style={{ color: CREAM, fontSize: 16, fontWeight: "600" }}>
              {submitting ? "Creating account…" : "Sign up"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={{ marginTop: 12, alignItems: "center" }}
          >
            <Text style={{ color: INK_DIM, fontSize: 14 }}>
              Already have an account?{" "}
              <Text style={{ color: INK, fontWeight: "600" }}>Log in</Text>
            </Text>
          </Pressable>
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
