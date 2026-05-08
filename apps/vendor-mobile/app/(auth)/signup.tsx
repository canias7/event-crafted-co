// Vendor signup. Two steps:
//   1. Account — display name, email, password
//   2. Business — business name + category
// On submit we pass display_name, vendor_business_name, and
// vendor_category in user_metadata. handle_new_user reads those, creates
// a vendor_profile in 'pending' state, and sets auth.users.banned_until
// so the user can't sign in until an admin approves them on the admin
// app's Vendor applications tab. The web flow at /vendor-apply does
// the same thing — this just mirrors it for mobile.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CATEGORY_GROUPS } from "@vendora/core";
import { supabase } from "@/lib/supabase";

export default function SignupScreen() {
  const [step, setStep] = useState<1 | 2 | "thanks">(1);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function step1Valid() {
    return (
      ownerName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 8
    );
  }

  function step2Valid() {
    return businessName.trim().length > 0 && category.length > 0;
  }

  async function onSubmit() {
    if (!step2Valid()) {
      setError("Business name and category are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: ownerName.trim(),
          vendor_business_name: businessName.trim(),
          vendor_category: category,
        },
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }
    // Make sure the user can't access the app until admin approves —
    // even if email confirmation is off and signUp returned a session.
    await supabase.auth.signOut();
    setSubmitting(false);
    setStep("thanks");
  }

  if (step === "thanks") {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="mb-3 text-3xl font-semibold text-foreground text-center">
            Thank you for applying.
          </Text>
          <Text className="mb-8 text-base text-muted-foreground text-center leading-relaxed">
            We hand-review every application within 2–3 business days.
            We'll email you with the decision. Once approved, you'll
            be able to sign in and finish your listing.
          </Text>
          <Link
            href="/(auth)/login"
            className="text-sm text-accent underline"
          >
            Back to sign in
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="mb-1 text-xs font-medium uppercase tracking-widest text-accent">
            Step {step} of 2
          </Text>
          <Text className="mb-1 text-3xl font-semibold text-foreground">
            {step === 1 ? "Become a Vendora vendor" : "Tell us about your business"}
          </Text>
          <Text className="mb-8 text-sm text-muted-foreground">
            {step === 1
              ? "Create an account. Listings are hand-reviewed before going live."
              : "You can edit any of this after admin approves you."}
          </Text>

          {step === 1 ? (
            <View className="gap-4">
              <Field label="Owner name">
                <TextInput
                  value={ownerName}
                  onChangeText={setOwnerName}
                  className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
                  placeholder="Your full name"
                />
              </Field>
              <Field label="Email">
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
                  placeholder="business@email.com"
                />
              </Field>
              <Field label="Password">
                <TextInput
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
                  placeholder="At least 8 characters"
                />
              </Field>

              {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

              <Pressable
                onPress={() => {
                  if (!step1Valid()) {
                    setError("Please complete every field. Password must be 8+ characters.");
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
                className="mt-2 rounded-lg bg-foreground px-4 py-3 active:opacity-80"
              >
                <Text className="text-center text-base font-semibold text-background">
                  Continue
                </Text>
              </Pressable>

              <Link
                href="/(auth)/login"
                className="mt-4 text-center text-sm text-muted-foreground"
              >
                Already have an account? Log in
              </Link>
            </View>
          ) : (
            <View className="gap-4">
              <Field label="Business name">
                <TextInput
                  value={businessName}
                  onChangeText={setBusinessName}
                  className="rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground"
                  placeholder="Luminara Photography"
                />
              </Field>

              <View>
                <Text className="mb-2 text-xs font-medium text-muted-foreground">
                  Category
                </Text>
                <View className="rounded-lg border border-border bg-background">
                  {CATEGORY_GROUPS.map((group) => (
                    <View key={group.slug} className="border-b border-border last:border-b-0">
                      <Text className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {group.name}
                      </Text>
                      {group.subs.map((sub) => {
                        const selected = category === sub;
                        return (
                          <Pressable
                            key={sub}
                            onPress={() => setCategory(sub)}
                            className={`px-3 py-2.5 active:opacity-70 ${
                              selected ? "bg-foreground/5" : ""
                            }`}
                          >
                            <Text
                              className={`text-sm ${
                                selected
                                  ? "font-semibold text-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {selected ? "● " : "○ "}
                              {sub}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>

              {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

              <View className="mt-2 flex-row gap-3">
                <Pressable
                  onPress={() => setStep(1)}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-3 active:opacity-80"
                >
                  <Text className="text-center text-base font-semibold text-foreground">
                    Back
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onSubmit}
                  disabled={submitting || !step2Valid()}
                  className="flex-[2] rounded-lg bg-foreground px-4 py-3 active:opacity-80 disabled:opacity-50"
                >
                  <Text className="text-center text-base font-semibold text-background">
                    {submitting ? "Submitting…" : "Submit application"}
                  </Text>
                </Pressable>
              </View>

              <Text className="mt-2 text-center text-[11px] text-muted-foreground leading-relaxed">
                By submitting, you agree to Vendora's vendor terms.
                We hand-review every application within 2–3 business days.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="mb-1 text-xs font-medium text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}
