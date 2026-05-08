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

const CREAM = "#faf5ec";
const CREAM_DEEP = "#f5efe5";
const INK = "#1a1410";
const INK_DIM = "rgba(26,20,16,0.6)";
const INK_BORDER = "rgba(26,20,16,0.18)";
const INPUT_BG = "#ffffff";
const ERROR = "#b42318";
const ACCENT = "#a08259";

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

type Step = "account" | "business" | "done";

export default function VendorSignupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const step1Valid =
    ownerName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8;
  const step2Valid = businessName.trim().length > 0 && category.length > 0;

  function continueToBusiness() {
    setError(null);
    if (!step1Valid) {
      setError("Please complete every field. Password needs 8+ characters.");
      return;
    }
    setStep("business");
  }

  async function submit() {
    if (!step2Valid) return;
    setError(null);
    setSubmitting(true);
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          display_name: ownerName.trim(),
          vendor_business_name: businessName.trim(),
          vendor_category: category,
        },
      },
    });
    if (signUpErr) {
      setSubmitting(false);
      const msg = signUpErr.message?.toLowerCase() ?? "";
      if (msg.includes("rate limit")) {
        setError(
          "We've sent too many emails recently. Please try again in a few minutes.",
        );
      } else if (msg.includes("already registered") || msg.includes("already exists")) {
        setError(
          "An account with this email already exists. Sign in to it on the host app first, then apply to be a vendor from your dashboard.",
        );
      } else {
        setError(signUpErr.message);
      }
      return;
    }
    // Supabase silently no-ops if the email already exists, returning
    // user.identities = []. handle_new_user never fires in that case.
    if (data?.user && (data.user.identities ?? []).length === 0) {
      setSubmitting(false);
      setError(
        "An account with this email already exists. Sign in to it on the host app first, then apply to be a vendor from your dashboard.",
      );
      return;
    }
    // Sign out so the user can't access the vendor portal until admin
    // approves. They'll receive a "thanks for applying" email and an
    // approval email later.
    await supabase.auth.signOut();
    setSubmitting(false);
    setStep("done");
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
          <Pressable
            onPress={() => {
              if (step === "business") setStep("account");
              else router.back();
            }}
            hitSlop={12}
            style={{ alignSelf: "flex-start", paddingVertical: 8 }}
            disabled={step === "done"}
          >
            <Text style={{ color: INK_DIM, fontSize: 16, fontWeight: "500" }}>
              ← Back
            </Text>
          </Pressable>

          {step === "account" ? (
            <AccountStep
              ownerName={ownerName}
              setOwnerName={setOwnerName}
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
              onSubmit={submit}
              valid={step2Valid}
            />
          ) : null}

          {step === "done" ? <ThanksView onClose={() => router.back()} /> : null}
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
  ownerName: string;
  setOwnerName: (v: string) => void;
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
          label="Owner name"
          placeholder="Your full name"
          value={p.ownerName}
          onChangeText={p.setOwnerName}
          autoCapitalize="words"
        />
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
          backgroundColor: "rgba(26,20,16,0.45)",
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
