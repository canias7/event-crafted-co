import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";
import { TurnstileWidget, useCaptchaFallback } from "@/components/auth/TurnstileWidget";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { authErrorText } from "@/components/auth/authErrors";
import { logHomeEvent } from "@/lib/homeExperiment";

// `role` decides what the user is signing up as. Default "host" keeps
// the existing behavior (post-signup → /customer/onboarding). When
// passed "vendor", we route the user to the "Application received"
// page (/check-email?role=vendor) after signup — their application is
// hand-reviewed and they have no portal access until an admin approves
// it. The auth.users row is the same either way — role differentiation
// happens at the next step (onboarded_at vs. inserting a
// vendor_profiles row), with DB triggers enforcing the one-role-per-
// email rule.
export default function SignupPage({ role = "host" }: { role?: "host" | "vendor" } = {}) {
  const { t } = useTranslation();
  const { t: tAuth } = useTranslation("auth");
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adult, setAdult] = useState(false);
  const [loading, setLoading] = useState(false);
  // No bot-check by default; only shown if the server still demands one.
  const captcha = useCaptchaFallback();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adult) {
      toast.error(tAuth("signup.toast.must_be_adult"));
      return;
    }
    if (captcha.blocked) {
      toast.error(tAuth("captcha.complete"));
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        ...captcha.options,
        // For vendors the "name" field IS their business name — pass it
        // through as vendor_business_name so handle_new_user can seed
        // profiles.business_name on the spot. display_name still gets
        // the same value so other surfaces that key off it don't break.
        data: {
          display_name: name,
          intended_role: role,
          ...(role === "vendor" ? { vendor_business_name: name } : {}),
        },
      },
    });
    setLoading(false);
    if (error) {
      if (captcha.handleError(error)) {
        toast.error(tAuth("captcha.complete_retry"));
      } else {
        toast.error(authErrorText(error.message));
      }
      return;
    }

    // Duplicate email: with enumeration protection on, Supabase returns a
    // FAKE success for an existing email — no error, but the obfuscated
    // user has an empty identities array. Without this check the user is
    // told "Application received" when nothing was created.
    if (data.user && (data.user.identities?.length ?? 0) === 0 && !data.session) {
      toast.error(tAuth("signup.toast.email_taken"));
      captcha.reset();
      return;
    }

    // An account was created: count it for the homepage test version this
    // visitor saw (nothing is sent if they never got one).
    logHomeEvent("signup", role);

    // Vendors always land on the "Application received" page. Their
    // application is hand-reviewed and they have NO portal access until
    // an admin approves it (hasVendorAccess is false while pending), so
    // routing them to /vendor/me would just bounce them back to "/" and
    // they'd never see the under-review confirmation. If Supabase
    // returned a session (email auto-confirm on) we drop it so the
    // under-review state is truthful — they sign in once the approval
    // email arrives.
    if (role === "vendor") {
      if (data.session) await supabase.auth.signOut();
      navigate(`/check-email?email=${encodeURIComponent(email)}&role=vendor`);
      return;
    }

    // Host flow: confirm-email page when no session yet, else straight in.
    if (!data.session) {
      navigate(`/check-email?email=${encodeURIComponent(email)}&role=host`);
      return;
    }
    toast.success(tAuth("signup.toast.created"));
    navigate("/customer/onboarding");
  }

  const isVendor = role === "vendor";
  const pillLabel = isVendor ? tAuth("signup.pill_vendor") : tAuth("signup.pill_host");
  const accentWord = isVendor ? tAuth("shared.accent_vendor") : tAuth("shared.accent_host");
  const otherSidePath = isVendor ? "/signup/host" : "/signup/vendor";
  const otherSideLabel = isVendor ? tAuth("signup.as_host") : tAuth("signup.as_vendor");

  return (
    <GlassyAuthShell
      title={isVendor ? tAuth("signup.title_vendor") : tAuth("signup.title_host")}
      titleAccent={accentWord}
      subtitle={
        isVendor
          ? tAuth("signup.subtitle_vendor")
          : tAuth("signup.subtitle_host")
      }
      pillLabel={pillLabel}
      topRight={
        <>
          <span>
            <span style={{ opacity: 0.6 }}>{tAuth("shared.have_account")}{" "}</span>
            <Link
              to="/login"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid #000" }}
            >
              {t("auth.signup.sign_in")}
            </Link>
          </span>
        </>
      }
      belowCardLink={
        <div>
          <span style={{ opacity: 0.6 }}>{tAuth("shared.other_side")}{" "}</span>
          <Link
            to={otherSidePath}
            className="font-medium pb-px"
            style={{ borderBottom: "0.5px solid #000", color: "#000" }}
          >
            {otherSideLabel}
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div>
          <div
            className="uppercase mb-1.5"
            style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
          >
            {isVendor ? tAuth("signup.business_name") : t("auth.signup.name_label")}
          </div>
          <input
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={isVendor ? tAuth("signup.business_placeholder") : tAuth("signup.name_placeholder")}
          />
        </div>
        <div>
          <div
            className="uppercase mb-1.5"
            style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
          >
            {t("auth.common.email")}
          </div>
          <input
            className="auth-input"
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder={tAuth("shared.email_placeholder")}
          />
        </div>
        <div>
          <div
            className="uppercase mb-1.5"
            style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
          >
            {t("auth.common.password")}
          </div>
          <div className="relative">
            <input
              className="auth-input pr-10"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder={t("auth.signup.password_hint")}
              autoComplete="new-password"
            />
            <button
              type="button"
              aria-label={showPassword ? tAuth("password.hide") : tAuth("password.show")}
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-foreground/55 hover:text-accent transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <PasswordStrengthMeter password={password} />
        </div>
        <div
          className="flex items-start pt-1"
          style={{ gap: "8px", fontSize: "12px", opacity: 0.8 }}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={adult}
            onClick={() => setAdult((v) => !v)}
            className="shrink-0 inline-flex items-center justify-center cursor-pointer"
            style={{
              width: 16,
              height: 16,
              border: "0.5px solid rgba(0,0,0,0.3)",
              borderRadius: "3px",
              background: adult ? "#000" : "rgba(255,255,255,0.6)",
              marginTop: "1px",
              padding: 0,
            }}
          >
            {adult && <Check className="w-3 h-3 text-white" />}
          </button>
          <span
            className="leading-relaxed cursor-pointer select-none"
            onClick={(e) => {
              // Toggle on text click — but let inner links navigate normally.
              if ((e.target as HTMLElement).closest("a")) return;
              setAdult((v) => !v);
            }}
          >
            {t("auth.signup.adult_lead")}{" "}
            <Link
              to="/terms"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid currentColor" }}
              target="_blank"
            >
              {t("auth.signup.adult_terms")}
            </Link>{" "}
            {t("auth.signup.adult_and")}{" "}
            <Link
              to="/privacy"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid currentColor" }}
              target="_blank"
            >
              {t("auth.signup.adult_privacy")}
            </Link>
            .
          </span>
        </div>
        {captcha.required ? (
          <div className="flex justify-center pt-1">
            <TurnstileWidget {...captcha.widgetProps} />
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading || !adult || captcha.blocked}
          className="auth-submit mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("auth.common.creating")}
            </>
          ) : (
            <>
              {t("auth.signup.submit")}
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>
    </GlassyAuthShell>
  );
}
