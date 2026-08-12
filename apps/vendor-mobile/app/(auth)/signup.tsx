// Vendor signup. Two-step flow mirroring the web /vendor-apply page:
//
//   1. Account — owner name, email, password (with show/hide toggle)
//   2. Business — business name + category (grouped picker)
//
// Submit calls supabase.auth.signUp with vendor_business_name +
// vendor_category in user_metadata. handle_new_user picks those up
// server-side and provisions:
//   - profiles (role: 'host')
//   - vendor_profiles (application_status: 'pending')
//
// We sign out immediately after — the user can't access the vendor
// portal until admin approves. Lands on an inline "thanks for
// applying" view instead of a separate route.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CATEGORY_GROUPS } from "@vendora/core";
import { supabase } from "@/lib/supabase";

const CREAM = "#ffffff";
const CREAM_DEEP = "#f3f4f6";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const INK_BORDER = "rgba(20,22,26,0.08)";
const INPUT_BG = "#ffffff";
const ERROR = "#dc2828";
const ACCENT = "#1B3654";

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

type Step = "account" | "business" | "code" | "done";

export default function VendorSignupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Step 3 (code)
  const [code, setCode] = useState("");

  const step1Valid = email.trim().length > 0 && password.length >= 8;
  const step2Valid = businessName.trim().length > 0 && category.length > 0;
  const codeValid = code.length === 6;

  function continueToBusiness() {
    setError(null);
    if (!step1Valid) {
      setError("Please complete every field. Password needs 8+ characters.");
      return;
    }
    setStep("business");
  }

  // Step 2 submit: ask the edge function to email a 6-digit code.
  async function sendCode() {
    if (!step2Valid) return;
    setError(null);
    setSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();
    const { data, error: invokeErr } = await supabase.functions.invoke<{
      ok?: boolean;
      reason?: string;
      error?: string;
    }>("vendor-signup", {
      body: {
        action: "request",
        email: cleanEmail,
        businessName: businessName.trim(),
        category,
      },
    });
    setSubmitting(false);
    if (invokeErr) {
      setError(invokeErr.message);
      return;
    }
    if (data?.ok === false) {
      // vendor-signup no longer returns "email_taken" — it instead
      // sends an "already registered, log in" email and returns
      // ok:true so the API can't be used to enumerate accounts.
      // Any other ok:false here is genuinely something else.
      setError(data.reason ?? "Couldn't send code.");
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    setCode("");
    setStep("code");
  }

  // Step 3 submit: verify the code, then signInWithPassword.
  async function verifyCode() {
    if (!codeValid) return;
    setError(null);
    setSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();
    const { data, error: invokeErr } = await supabase.functions.invoke<{
      ok?: boolean;
      reason?: string;
      error?: string;
    }>("vendor-signup", {
      body: {
        action: "verify",
        email: cleanEmail,
        code: code.trim(),
        password,
        businessName: businessName.trim(),
        category,
      },
    });
    if (invokeErr) {
      setSubmitting(false);
      setError(invokeErr.message);
      return;
    }
    if (data?.ok === false) {
      setSubmitting(false);
      if (data.reason === "wrong_code") {
        setError("That code didn't match. Try again or resend.");
      } else if (data.reason === "expired") {
        setError("That code expired. Hit Resend code for a new one.");
      } else if (data.reason === "too_many_attempts") {
        setError("Too many wrong tries. Hit Resend code to start over.");
      } else if (data.reason === "no_pending_code") {
        setError("We couldn't find a pending code. Hit Resend code.");
      } else if (data.reason === "weak_password") {
        setError("Password must be at least 8 characters.");
      } else {
        setError(data.reason ?? "Verification failed.");
      }
      return;
    }
    if (data?.error) {
      setSubmitting(false);
      setError(data.error);
      return;
    }
    // Account created at status='pending' (handle_new_user). Don't
    // sign in — admin has to approve the application first. Land
    // on the "thanks, we'll review" screen.
    setSubmitting(false);
    setStep("done");
  }

  async function resend() {
    setCode("");
    await sendCode();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
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
          {/* Hidden on the final step: the application is already submitted,
              so there's nothing to go back to. It used to render `disabled`
              with no visual difference, so it read as a live control that
              did nothing when tapped. "Back to start" is the action there. */}
          {step === "done" ? null : (
            <Pressable
              onPress={() => {
                if (step === "code") {
                  setStep("business");
                  setCode("");
                  setError(null);
                } else if (step === "business") {
                  setStep("account");
                } else if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(auth)/welcome");
                }
              }}
              hitSlop={12}
              style={{ alignSelf: "flex-start", paddingVertical: 8 }}
            >
              <Text style={{ color: INK_DIM, fontSize: 16, fontWeight: "500" }}>
                ← Back
              </Text>
            </Pressable>
          )}

          {step === "account" ? (
            <AccountStep
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              error={error}
              onContinue={continueToBusiness}
              valid={step1Valid}
            />
          ) : null}

          {step === "business" ? (
            <BusinessStep
              businessName={businessName}
              setBusinessName={setBusinessName}
              category={category}
              setCategory={setCategory}
              openPicker={() => setPickerOpen(true)}
              error={error}
              submitting={submitting}
              onSubmit={sendCode}
              valid={step2Valid}
            />
          ) : null}

          {step === "code" ? (
            <CodeStep
              email={email.trim().toLowerCase()}
              code={code}
              setCode={setCode}
              error={error}
              submitting={submitting}
              onVerify={verifyCode}
              onResend={resend}
              valid={codeValid}
            />
          ) : null}

          {/* "Back to start" goes to welcome explicitly rather than
              router.back(): back() is a no-op when this screen is the first
              in the stack (deep link, or a fresh launch into signup), which
              left the button doing nothing. replace() also drops the
              completed signup from history so it can't be swiped back into. */}
          {step === "done" ? (
            <ThanksView onClose={() => router.replace("/(auth)/welcome")} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <CategoryPicker
        visible={pickerOpen}
        selected={category}
        onSelect={(value) => {
          setCategory(value);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

interface AccountStepProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  error: string | null;
  onContinue: () => void;
  valid: boolean;
}

function AccountStep(p: AccountStepProps) {
  return (
    <>
      <View style={{ marginTop: 24 }}>
        <Text style={accentLabel}>STEP 1 OF 2</Text>
        <Text
          style={{
            fontFamily: SERIF,
            fontSize: 36,
            fontWeight: "700",
            color: INK,
            letterSpacing: -1,
            marginTop: 6,
          }}
        >
          Set up your account
        </Text>
        <Text style={subhead}>Used to sign in and receive inquiries.</Text>
      </View>

      <View style={{ marginTop: 32, gap: 16 }}>
        <Field
          label="Email"
          placeholder="business@email.com"
          value={p.email}
          onChangeText={p.setEmail}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
        />
        <View>
          <Text style={fieldLabel}>PASSWORD</Text>
          <View style={{ position: "relative" }}>
            <TextInput
              secureTextEntry={!p.showPassword}
              value={p.password}
              onChangeText={p.setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={INK_DIM}
              style={[input, { paddingRight: 64 }]}
            />
            <Pressable
              onPress={() => p.setShowPassword(!p.showPassword)}
              hitSlop={8}
              style={{
                position: "absolute",
                right: 12,
                top: 0,
                bottom: 0,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: ACCENT, fontSize: 13, fontWeight: "600" }}>
                {p.showPassword ? "Hide" : "Show"}
              </Text>
            </Pressable>
          </View>
        </View>

        {p.error ? <Text style={errorText}>{p.error}</Text> : null}

        <Pressable
          onPress={p.onContinue}
          disabled={!p.valid}
          style={{ ...primaryBtn, opacity: !p.valid ? 0.5 : 1 }}
        >
          <Text style={primaryBtnText}>Continue</Text>
        </Pressable>
      </View>
    </>
  );
}

interface BusinessStepProps {
  businessName: string;
  setBusinessName: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  openPicker: () => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  valid: boolean;
}

function BusinessStep(p: BusinessStepProps) {
  return (
    <>
      <View style={{ marginTop: 24 }}>
        <Text style={accentLabel}>STEP 2 OF 2</Text>
        <Text
          style={{
            fontFamily: SERIF,
            fontSize: 36,
            fontWeight: "700",
            color: INK,
            letterSpacing: -1,
            marginTop: 6,
          }}
        >
          Tell us about your business
        </Text>
        <Text style={subhead}>You can edit any of this later from your dashboard.</Text>
      </View>

      <View style={{ marginTop: 32, gap: 16 }}>
        <Field
          label="Business name"
          placeholder="Luminara Photography"
          value={p.businessName}
          onChangeText={p.setBusinessName}
          autoCapitalize="words"
        />
        <View>
          <Text style={fieldLabel}>CATEGORY</Text>
          <Pressable
            onPress={p.openPicker}
            style={{
              ...input,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                color: p.category ? INK : INK_DIM,
                flex: 1,
              }}
            >
              {p.category || "Choose a category"}
            </Text>
            <Text style={{ color: INK_DIM, fontSize: 18, marginLeft: 8 }}>
              ›
            </Text>
          </Pressable>
        </View>

        {p.error ? <Text style={errorText}>{p.error}</Text> : null}

        <Pressable
          onPress={p.onSubmit}
          disabled={p.submitting || !p.valid}
          style={{
            ...primaryBtn,
            opacity: p.submitting || !p.valid ? 0.5 : 1,
          }}
        >
          <Text style={primaryBtnText}>
            {p.submitting ? "Submitting…" : "Submit application"}
          </Text>
        </Pressable>

        <Text
          style={{
            marginTop: 8,
            textAlign: "center",
            fontSize: 12,
            color: INK_DIM,
            lineHeight: 18,
          }}
        >
          By submitting, you agree to Vendora's vendor terms. We hand-review
          every application within 2–3 business days.
        </Text>
      </View>
    </>
  );
}

interface CodeStepProps {
  email: string;
  code: string;
  setCode: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onVerify: () => void;
  onResend: () => void;
  valid: boolean;
}

function CodeStep(p: CodeStepProps) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 14,
          color: ACCENT,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Step 3 of 3
      </Text>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 32,
          lineHeight: 38,
          fontWeight: "700",
          color: INK,
          marginTop: 8,
        }}
      >
        Enter your code
      </Text>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 15,
          color: INK_DIM,
          fontStyle: "italic",
          marginTop: 8,
        }}
      >
        We sent a 6-digit code to {p.email}.
      </Text>

      <View style={{ marginTop: 32, gap: 16 }}>
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
            6-DIGIT CODE
          </Text>
          <TextInput
            value={p.code}
            onChangeText={(v) => p.setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={INK_DIM}
            keyboardType="number-pad"
            autoCapitalize="none"
            style={{
              backgroundColor: "#ffffff",
              borderColor: INK_BORDER,
              borderWidth: 1,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 18,
              color: INK,
              letterSpacing: 4,
            }}
          />
        </View>

        {p.error ? (
          <Text style={{ color: "#dc2828", fontSize: 14 }}>{p.error}</Text>
        ) : null}

        <Pressable
          onPress={p.onVerify}
          disabled={p.submitting || !p.valid}
          style={{
            marginTop: 8,
            backgroundColor: INK,
            borderRadius: 999,
            height: 54,
            alignItems: "center",
            justifyContent: "center",
            opacity: p.submitting || !p.valid ? 0.5 : 1,
          }}
        >
          <Text style={{ color: CREAM, fontSize: 16, fontWeight: "600" }}>
            {p.submitting ? "Verifying…" : "Verify"}
          </Text>
        </Pressable>

        <Pressable
          onPress={p.onResend}
          disabled={p.submitting}
          style={{ alignItems: "center", paddingVertical: 8 }}
        >
          <Text style={{ color: ACCENT, fontSize: 14, fontWeight: "600" }}>
            Resend code
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ThanksView({ onClose }: { onClose: () => void }) {
  return (
    <View style={{ marginTop: 80, alignItems: "center" }}>
      <Text style={accentLabel}>— APPLICATION RECEIVED</Text>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 36,
          fontWeight: "700",
          color: INK,
          letterSpacing: -1,
          marginTop: 12,
          textAlign: "center",
        }}
      >
        Thanks for applying.
      </Text>
      <Text
        style={{
          marginTop: 16,
          fontSize: 15,
          color: INK_DIM,
          textAlign: "center",
          lineHeight: 22,
          maxWidth: 320,
        }}
      >
        We hand-review every Vendora application. Expect an email from us
        within 2–3 business days. If approved, you'll be able to sign in and
        finish setting up your listing.
      </Text>

      <Pressable
        onPress={onClose}
        style={{
          ...primaryBtn,
          marginTop: 32,
          width: "88%",
          maxWidth: 320,
        }}
      >
        <Text style={primaryBtnText}>Back to start</Text>
      </Pressable>
    </View>
  );
}

interface FieldProps {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "email-address" | "number-pad" | "numeric";
  autoComplete?: "email" | "off";
  autoCapitalize?: "none" | "sentences" | "words";
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
      <Text style={fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={INK_DIM}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        style={input}
      />
    </View>
  );
}

interface CategoryPickerProps {
  visible: boolean;
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function CategoryPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: CategoryPickerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(20,22,26,0.45)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: CREAM,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "82%",
            paddingHorizontal: 0,
            paddingTop: 8,
            paddingBottom: 24,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: INK_BORDER,
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: 22,
              fontWeight: "700",
              color: INK,
              letterSpacing: -0.5,
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            Choose a category
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.slug} style={{ marginBottom: 8 }}>
                <Text
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    fontSize: 11,
                    fontWeight: "600",
                    color: INK_DIM,
                    letterSpacing: 1,
                  }}
                >
                  {group.name.toUpperCase()}
                </Text>
                {group.subs.map((sub) => {
                  const isSelected = sub === selected;
                  return (
                    <Pressable
                      key={sub}
                      onPress={() => onSelect(sub)}
                      style={{
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        backgroundColor: isSelected
                          ? CREAM_DEEP
                          : "transparent",
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: INK, fontSize: 16 }}>{sub}</Text>
                      {isSelected ? (
                        <Text style={{ color: ACCENT, fontSize: 16, fontWeight: "600" }}>
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const accentLabel = {
  color: ACCENT,
  fontSize: 11,
  fontWeight: "600" as const,
  letterSpacing: 2,
};
const subhead = {
  marginTop: 8,
  fontSize: 15,
  color: INK_DIM,
  fontStyle: "italic" as const,
  fontFamily: SERIF,
};
const fieldLabel = {
  marginBottom: 6,
  fontSize: 12,
  fontWeight: "600" as const,
  color: INK_DIM,
  letterSpacing: 0.5,
};
const input = {
  backgroundColor: INPUT_BG,
  borderColor: INK_BORDER,
  borderWidth: 1,
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 14,
  fontSize: 16,
  color: INK,
};
const primaryBtn = {
  marginTop: 8,
  backgroundColor: INK,
  borderRadius: 999,
  paddingVertical: 16,
  alignItems: "center" as const,
};
const primaryBtnText = {
  color: CREAM,
  fontSize: 16,
  fontWeight: "600" as const,
};
const errorText = {
  color: ERROR,
  fontSize: 14,
};
