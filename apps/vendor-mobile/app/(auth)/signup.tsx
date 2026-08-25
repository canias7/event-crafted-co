// Vendor signup. Two-step flow mirroring the web /vendor-apply page:
//
//   1. Account — email, password (with show/hide toggle)
//   2. Business — business name + category (grouped picker)
//   (+ an email-code verification screen between submit and done)
//
// Submit calls the vendor-signup edge function, which emails a 6-digit
// code, then creates the account on verify with vendor_business_name +
// vendor_category in user_metadata. handle_new_user picks those up
// server-side and provisions:
//   - profiles (role: 'host')
//   - vendor_profiles (application_status: 'pending')
//
// The user can't access the vendor portal until admin approves. Lands
// on an inline "thanks for applying" view instead of a separate route.
//
// Styling notes, learned the hard way on the welcome screen:
//   - No function-form style props anywhere. The styling interop drops
//     them on device (pills rendered as bare text). Plain objects only;
//     TouchableOpacity supplies press feedback.
//   - Dark Vendora theme matching welcome.tsx — same PAGE / GOLD values.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CATEGORY_GROUPS } from "@vendora/core";
import { supabase } from "@/lib/supabase";

// Same palette as welcome.tsx — the two screens must read as one flow.
const PAGE = "#f4f1ea";
const SHEET = "#fbf9f4";
const SURFACE = "#ece7db";
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

  // Code screen
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

  // Code screen submit: verify the code; account is created server-side.
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
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE} />
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
              <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 16}}>
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

// Gold hairlines meeting a four-point star — the section divider from the
// reference design.
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
      <StepHeader
        eyebrow="STEP 1 OF 2"
        title="Set up your account"
        subtitle="Used to sign in and receive inquiries."
      />

      <View style={{ marginTop: 28, gap: 20 }}>
        <Field
          label="Email"
          icon="email-outline"
          placeholder="business@email.com"
          value={p.email}
          onChangeText={p.setEmail}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
        />
        <View>
          <Text style={fieldLabel}>PASSWORD</Text>
          <View style={inputRow}>
            <MaterialCommunityIcons
              name="lock-outline"
              size={20}
              color={GOLD}
              style={{ marginRight: 10 }}
            />
            <TextInput
              secureTextEntry={!p.showPassword}
              value={p.password}
              onChangeText={p.setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={SUBTLE}
              selectionColor={GOLD}
              keyboardAppearance="dark"
              style={inputText}
            />
            <TouchableOpacity
              onPress={() => p.setShowPassword(!p.showPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              style={{ paddingLeft: 10 }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 14}}>
                {p.showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {p.error ? <Text style={errorText}>{p.error}</Text> : null}

        <TouchableOpacity
          onPress={p.onContinue}
          disabled={!p.valid}
          activeOpacity={0.85}
          style={primaryBtnFor(!p.valid)}
        >
          <Text style={primaryBtnTextFor(!p.valid)}>Continue</Text>
        </TouchableOpacity>
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
      <StepHeader
        eyebrow="STEP 2 OF 2"
        title="Tell us about your business"
        subtitle="You can edit any of this later from your dashboard."
      />

      <View style={{ marginTop: 28, gap: 20 }}>
        <Field
          label="Business name"
          icon="storefront-outline"
          placeholder="Luminara Photography"
          value={p.businessName}
          onChangeText={p.setBusinessName}
          autoCapitalize="words"
        />
        <View>
          <Text style={fieldLabel}>CATEGORY</Text>
          <TouchableOpacity
            onPress={p.openPicker}
            activeOpacity={0.7}
            style={inputRow}
          >
            <MaterialCommunityIcons
              name="shape-outline"
              size={20}
              color={GOLD}
              style={{ marginRight: 10 }}
            />
            <Text
              style={{
                fontFamily: SERIF,
                fontSize: 16,
                color: p.category ? INK : SUBTLE,
                flex: 1,
              }}
            >
              {p.category || "Choose a category"}
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color={SUBTLE}
            />
          </TouchableOpacity>
        </View>

        {p.error ? <Text style={errorText}>{p.error}</Text> : null}

        <TouchableOpacity
          onPress={p.onSubmit}
          disabled={p.submitting || !p.valid}
          activeOpacity={0.85}
          style={primaryBtnFor(p.submitting || !p.valid)}
        >
          <Text style={primaryBtnTextFor(p.submitting || !p.valid)}>
            {p.submitting ? "Submitting…" : "Submit application"}
          </Text>
        </TouchableOpacity>

        <Text
          style={{
            fontFamily: SERIF,
            marginTop: 4,
            textAlign: "center",
            fontSize: 12,
            color: SUBTLE,
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
    <>
      <StepHeader
        eyebrow="VERIFY YOUR EMAIL"
        title="Enter your code"
        subtitle={`We sent a 6-digit code to ${p.email}.`}
      />

      <View style={{ marginTop: 28, gap: 20 }}>
        <View>
          <Text style={fieldLabel}>6-DIGIT CODE</Text>
          <View style={inputRow}>
            <MaterialCommunityIcons
              name="email-check-outline"
              size={20}
              color={GOLD}
              style={{ marginRight: 10 }}
            />
            <TextInput
              value={p.code}
              onChangeText={(v) =>
                p.setCode(v.replace(/[^0-9]/g, "").slice(0, 6))
              }
              placeholder="123456"
              placeholderTextColor={SUBTLE}
              selectionColor={GOLD}
              keyboardAppearance="dark"
              keyboardType="number-pad"
              autoCapitalize="none"
              style={{ ...inputText, fontSize: 18, letterSpacing: 6 }}
            />
          </View>
        </View>

        {p.error ? <Text style={errorText}>{p.error}</Text> : null}

        <TouchableOpacity
          onPress={p.onVerify}
          disabled={p.submitting || !p.valid}
          activeOpacity={0.85}
          style={primaryBtnFor(p.submitting || !p.valid)}
        >
          <Text style={primaryBtnTextFor(p.submitting || !p.valid)}>
            {p.submitting ? "Verifying…" : "Verify"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={p.onResend}
          disabled={p.submitting}
          activeOpacity={0.7}
          style={{ alignItems: "center", paddingVertical: 8 }}
        >
          <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 14}}>
            Resend code
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function ThanksView({ onClose }: { onClose: () => void }) {
  return (
    <View style={{ marginTop: 80, alignItems: "center" }}>
      <MaterialCommunityIcons name="star-four-points" size={22} color={GOLD} />
      <Text style={{ ...eyebrowLabel, marginTop: 14 }}>
        APPLICATION RECEIVED
      </Text>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 36,
          color: INK,
          letterSpacing: -0.5,
          marginTop: 12,
          textAlign: "center",
        }}
      >
        Thanks for applying.
      </Text>
      <Text
        style={{
          fontFamily: SERIF,
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

      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        style={{
          ...primaryBtn,
          marginTop: 32,
          width: "88%",
          maxWidth: 320,
        }}
      >
        <Text style={primaryBtnText}>Back to start</Text>
      </TouchableOpacity>
    </View>
  );
}

interface FieldProps {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  placeholder?: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "email-address" | "number-pad" | "numeric";
  autoComplete?: "email" | "off";
  autoCapitalize?: "none" | "sentences" | "words";
}

function Field({
  label,
  icon,
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
      <View style={inputRow}>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={GOLD}
          style={{ marginRight: 10 }}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={SUBTLE}
          selectionColor={GOLD}
          keyboardAppearance="dark"
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          style={inputText}
        />
      </View>
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
            backgroundColor: SHEET,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderColor: BORDER,
            borderWidth: 1,
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
              backgroundColor: BORDER,
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 22,
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
                    fontFamily: SERIF_BOLD,
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    fontSize: 11,
                    color: BRONZE,
                    letterSpacing: 2,
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
                        backgroundColor: isSelected ? SURFACE : "transparent",
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontFamily: SERIF, color: INK, fontSize: 16 }}>{sub}</Text>
                      {isSelected ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={18}
                          color={GOLD}
                        />
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
// Input = outer row (border, bg, icon) + flex TextInput. Two pieces so the
// icon sits inside the border like the reference design.
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
