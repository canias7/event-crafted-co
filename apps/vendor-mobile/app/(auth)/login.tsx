// Vendor login. Two steps: email+password → 6-digit code emailed via
// Resend. The signin-2fa edge function verifies the password (without
// signing in), generates the code, sends it. Step 2 verifies the code,
// then we call signInWithPassword to actually establish the session.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

type Step = "credentials" | "code";

export default function LoginScreen() {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitCredentials() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { data, error: invokeErr } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "request", email: email.trim().toLowerCase(), password },
    });
    setSubmitting(false);
    if (invokeErr) {
      setError(invokeErr.message);
      return;
    }
    const r = data as { ok?: boolean; reason?: string } | null;
    if (!r?.ok) {
      if (r?.reason === "banned") {
        setError("Your vendor application is still under review. We'll email you once it's approved.");
      } else if (r?.reason === "invalid_credentials") {
        setError("Email or password is incorrect.");
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
    setSubmitting(true);
    const { data, error: invokeErr } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "verify", email: email.trim().toLowerCase(), code: code.trim() },
    });
    if (invokeErr) {
      setSubmitting(false);
      setError(invokeErr.message);
      return;
    }
    const r = data as { ok?: boolean; reason?: string } | null;
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
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setSubmitting(false);
    if (signInErr) setError(signInErr.message);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 px-6 py-8"
      >
        {step === "credentials" ? (
          <>
            <Text className="mb-1 text-3xl font-semibold text-foreground">Welcome back</Text>
            <Text className="mb-8 text-sm text-muted-foreground">
              Log in to manage your Vendora listing.
            </Text>

            <View className="gap-4">
              <View>
                <Text className="mb-1 text-xs font-medium text-muted-foreground">Email</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
                  placeholder="you@example.com"
                />
              </View>

              <View>
                <Text className="mb-1 text-xs font-medium text-muted-foreground">Password</Text>
                <TextInput
                  secureTextEntry
                  autoComplete="current-password"
                  value={password}
                  onChangeText={setPassword}
                  className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
                  placeholder="••••••••"
                />
              </View>

              {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

              <Pressable
                onPress={onSubmitCredentials}
                disabled={submitting || !email || !password}
                className="mt-2 rounded-lg bg-foreground px-4 py-3 active:opacity-80 disabled:opacity-50"
              >
                <Text className="text-center text-base font-semibold text-background">
                  {submitting ? "Sending code…" : "Continue"}
                </Text>
              </Pressable>
              <Text className="text-center text-xs text-muted-foreground">
                We'll email you a 6-digit code to confirm it's you.
              </Text>

              <Link href="/(auth)/signup" className="mt-4 text-center text-sm text-muted-foreground">
                New to Vendora? Create an account
              </Link>
            </View>
          </>
        ) : (
          <>
            <Text className="mb-1 text-3xl font-semibold text-foreground">Check your email</Text>
            <Text className="mb-8 text-sm text-muted-foreground">
              We sent a 6-digit code to {email}. It expires in 10 minutes.
            </Text>

            <View className="gap-4">
              <View>
                <Text className="mb-1 text-xs font-medium text-muted-foreground">6-digit code</Text>
                <TextInput
                  inputMode="numeric"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  placeholder="••••••"
                  autoFocus
                  className="rounded-lg border border-border bg-background px-3 py-4 text-center font-mono text-2xl tracking-[0.4em] text-foreground"
                />
              </View>

              {info && !error ? <Text className="text-sm text-accent">{info}</Text> : null}
              {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

              <Pressable
                onPress={onSubmitCode}
                disabled={submitting || code.length !== 6}
                className="mt-2 rounded-lg bg-foreground px-4 py-3 active:opacity-80 disabled:opacity-50"
              >
                <Text className="text-center text-base font-semibold text-background">
                  {submitting ? "Verifying…" : "Sign in"}
                </Text>
              </Pressable>

              <View className="mt-2 flex-row justify-between">
                <Pressable disabled={submitting} onPress={() => setStep("credentials")}>
                  <Text className="text-sm text-accent">← Use a different account</Text>
                </Pressable>
                <Pressable disabled={submitting} onPress={onSubmitCredentials}>
                  <Text className="text-sm text-accent">Resend code</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
