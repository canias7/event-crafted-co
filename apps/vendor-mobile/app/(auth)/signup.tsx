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
import { passwordProblem } from "@/lib/password";
import { PasswordMeter } from "@/components/PasswordMeter";
import { supabase } from "@/lib/supabase";
import { useKeyboardReveal } from "@/lib/useKeyboardReveal";
import { AuthBackdrop } from "@/components/AuthBackdrop";
import { AuthCard } from "@/components/AuthCard";
import { useT } from "@/lib/i18n";
import { useCategoryNames } from "@/lib/categoryNames";
import { C, IS_DARK } from "@/lib/theme";

// Same palette as welcome.tsx — the two screens must read as one flow.
const PAGE = C.page;
const SHEET = IS_DARK ? "#1b1d21" : C.card;
const SURFACE = IS_DARK ? "rgba(255,255,255,0.08)" : C.surface;
const INK = C.text;
const INK_ON_GOLD = C.onGold;
const GOLD = C.gold;
// Champagne bronze — the landing page's text accent. #c9a86a is
// reserved for fills and glyphs; as words on cream it only reaches
// 2:1, so every gold *label* uses this instead.
const BRONZE = C.accentText;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.text;
const SUBTLE = C.placeholder;
const BORDER = C.border;
const FIELD_BG = IS_DARK ? "rgba(255,255,255,0.05)" : C.field;
const FIELD_BORDER = C.border;
const ERROR = C.error;

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

type Step = "account" | "business" | "code" | "done";

export default function VendorSignupScreen() {
  const keyboard = useKeyboardReveal();
  const router = useRouter();
  const { t } = useT("signup");
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

  const step1Valid = email.trim().length > 0 && passwordProblem(password) === null;
  const step2Valid = businessName.trim().length > 0 && category.length > 0;
  const codeValid = code.length === 6;

  async function continueToBusiness() {
    setError(null);
    if (!step1Valid) {
      setError(passwordProblem(password) ?? t("errors.incomplete"));
      return;
    }
    // The server also checks the password against known data breaches
    // (only the server can), so a weak one never reaches the code step.
    setSubmitting(true);
    const { data } = await supabase.functions.invoke<{ ok?: boolean; reason?: string }>(
      "vendor-signup",
      { body: { action: "check_password", password } },
    );
    setSubmitting(false);
    if (data?.ok === false) {
      setError(data.reason ?? t("errors.weakPassword"));
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
        password,
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
      setError(data.reason ?? t("errors.sendFailed"));
      // A password problem belongs on the password screen.
      if (/password/i.test(data.reason ?? "")) setStep("account");
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
        setError(t("errors.wrongCode"));
      } else if (data.reason === "expired") {
        setError(t("errors.expired"));
      } else if (data.reason === "too_many_attempts") {
        setError(t("errors.tooMany"));
      } else if (data.reason === "no_pending_code") {
        setError(t("errors.noPending"));
      } else if (data.reason === "weak_password") {
        setError(passwordProblem(password) ?? t("errors.weakPassword"));
      } else {
        setError(data.reason ?? t("errors.verifyFailed"));
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
      <AuthBackdrop />
      <StatusBar barStyle={C.statusBar === "dark" ? "dark-content" : "light-content"} backgroundColor={PAGE} />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <ScrollView
          {...keyboard.scrollProps}
          contentContainerStyle={{
            paddingHorizontal: 20,
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
                ← {t("back")}
              </Text>
            </Pressable>
          )}

          <AuthCard>
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
          </AuthCard>
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


function StepHeader(p: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View>
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
  const { t } = useT("signup");
  return (
    <>
      <StepHeader
        eyebrow={t("account.eyebrow")}
        title={t("account.title")}
        subtitle={t("account.subtitle")}
      />

      <View style={{ marginTop: 28, gap: 20 }}>
        <Field
          label={t("account.email")}
          icon="email-outline"
          placeholder="business@email.com"
          value={p.email}
          onChangeText={p.setEmail}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
        />
        <View>
          <Text style={fieldLabel}>{t("account.password")}</Text>
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
              placeholder={t("account.passwordPlaceholder")}
              placeholderTextColor={SUBTLE}
              selectionColor={GOLD}
              keyboardAppearance={IS_DARK ? "dark" : "light"}
              style={inputText}
            />
            <TouchableOpacity
              onPress={() => p.setShowPassword(!p.showPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              style={{ paddingLeft: 10 }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 14}}>
                {p.showPassword ? t("account.hide") : t("account.show")}
              </Text>
            </TouchableOpacity>
          </View>
          <PasswordMeter password={p.password} />
        </View>

        {p.error ? <Text style={errorText}>{p.error}</Text> : null}

        <TouchableOpacity
          onPress={p.onContinue}
          disabled={!p.valid}
          activeOpacity={0.85}
          style={primaryBtnFor(!p.valid)}
        >
          <Text style={primaryBtnTextFor(!p.valid)}>{t("account.continue")}</Text>
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
  const { t } = useT("signup");
  const cn = useCategoryNames();
  return (
    <>
      <StepHeader
        eyebrow={t("business.eyebrow")}
        title={t("business.title")}
        subtitle={t("business.subtitle")}
      />

      <View style={{ marginTop: 28, gap: 20 }}>
        <Field
          label={t("business.name")}
          icon="storefront-outline"
          placeholder="Luminara Photography"
          value={p.businessName}
          onChangeText={p.setBusinessName}
          autoCapitalize="words"
        />
        <View>
          <Text style={fieldLabel}>{t("business.category")}</Text>
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
              {p.category ? cn.sub(p.category) : t("business.chooseCategory")}
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
            {p.submitting ? t("business.submitting") : t("business.submit")}
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
          {t("business.note")}
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
  const { t } = useT("signup");
  return (
    <>
      <StepHeader
        eyebrow={t("code.eyebrow")}
        title={t("code.title")}
        subtitle={t("code.subtitle", { email: p.email })}
      />

      <View style={{ marginTop: 28, gap: 20 }}>
        <View>
          <Text style={fieldLabel}>{t("code.label")}</Text>
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
              keyboardAppearance={IS_DARK ? "dark" : "light"}
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
            {p.submitting ? t("code.verifying") : t("code.verify")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={p.onResend}
          disabled={p.submitting}
          activeOpacity={0.7}
          style={{ alignItems: "center", paddingVertical: 8 }}
        >
          <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 14}}>
            {t("code.resend")}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function ThanksView({ onClose }: { onClose: () => void }) {
  const { t } = useT("signup");
  return (
    <View style={{ marginTop: 24, alignItems: "center" }}>
      <MaterialCommunityIcons name="star-four-points" size={22} color={GOLD} />
      <Text style={{ ...eyebrowLabel, marginTop: 16 }}>
        {t("thanks.eyebrow")}
      </Text>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 38,
          color: INK,
          letterSpacing: -0.5,
          marginTop: 12,
          textAlign: "center",
        }}
      >
        {t("thanks.title")}
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
        {t("thanks.body")}
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
        <Text style={primaryBtnText}>{t("thanks.backToStart")}</Text>
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
          keyboardAppearance={IS_DARK ? "dark" : "light"}
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
  const { t } = useT("signup");
  const cn = useCategoryNames();
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
              fontSize: 20,
              color: INK,
              letterSpacing: -0.5,
              paddingHorizontal: 24,
              marginBottom: 12,
            }}
          >
            {t("business.chooseCategory")}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.slug} style={{ marginBottom: 8 }}>
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    paddingHorizontal: 24,
                    paddingVertical: 8,
                    fontSize: 11,
                    color: BRONZE,
                    letterSpacing: 2,
                  }}
                >
                  {cn.group(group.slug, group.name).toUpperCase()}
                </Text>
                {group.subs.map((sub) => {
                  const isSelected = sub === selected;
                  return (
                    <Pressable
                      key={sub}
                      onPress={() => onSelect(sub)}
                      style={{
                        paddingHorizontal: 24,
                        paddingVertical: 16,
                        backgroundColor: isSelected ? SURFACE : "transparent",
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontFamily: SERIF, color: INK, fontSize: 16, flexShrink: 1 }}>{cn.sub(sub)}</Text>
                      {isSelected ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={18}
                          color={INK}
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
  fontSize: 13,
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
  borderRadius: 12,
  paddingHorizontal: 16,
  minHeight: 60,
};
const inputText = {
  fontFamily: SERIF,
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
const GOLD_MUTED = C.goldMuted;
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
