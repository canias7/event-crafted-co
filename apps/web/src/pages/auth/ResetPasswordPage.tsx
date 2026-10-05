// Reset-password landing page, reached two ways:
//
//   1. ?token_hash=…&type=recovery&app=vendor|host — the link the
//      password-reset edge function emails to mobile users. The token is
//      still unspent at this point, so the page's job is to hand it to
//      the app untouched (query params survive the custom-scheme handoff
//      where a fragment does not). "Reset in this browser" redeems it
//      here instead, which is the path when the app isn't installed.
//   2. #access_token=… — the classic fragment link from the web-side
//      forgot-password flow, which supabase-js consumes on its own.
//
// Whichever arrives, we end up holding a recovery session and show the
// same new-password form.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { authErrorText } from "@/components/auth/authErrors";

const APP_SCHEMES: Record<string, string> = {
  vendor: "vendora-vendor",
  host: "vendora-host",
};

export default function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tokenHash = searchParams.get("token_hash");
  const scheme = APP_SCHEMES[searchParams.get("app") ?? ""] ?? null;
  const appLink =
    tokenHash && scheme
      ? `${scheme}://reset-password?token_hash=${
          encodeURIComponent(tokenHash)
        }&type=recovery`
      : null;

  // Offer the app first when the link came from one, but let the user
  // opt out — tapping "reset in this browser" drops to the form below.
  const [handOffToApp, setHandOffToApp] = useState(!!appLink);

  // Redeeming token_hash spends it, so this must happen exactly once and
  // never while we're still offering the app the chance to take it.
  const redeemed = useRef(false);
  useEffect(() => {
    if (!tokenHash || handOffToApp || redeemed.current) return;
    redeemed.current = true;
    supabase.auth
      .verifyOtp({ type: "recovery", token_hash: tokenHash })
      .then(({ data, error }) => setHasSession(!error && !!data.session))
      .catch(() => setHasSession(false));
  }, [tokenHash, handOffToApp]);

  // Fragment links: supabase parses the recovery token from the URL on
  // its own, so an authed session means the link was valid.
  useEffect(() => {
    if (tokenHash) return;
    let cancelled = false;
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setHasSession(!!session);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
    });
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, [tokenHash]);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordMismatch =
    confirm.length > 0 && password.length >= 8 && password !== confirm;
  const formValid =
    password.length >= 8 && confirm.length >= 8 && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(authErrorText(error.message));
      return;
    }
    toast.success(t("reset.toast.updated"));
    navigate("/", { replace: true });
  }

  const backToSignIn = (
    <Link
      to="/login"
      className="pb-px font-medium"
      style={{ borderBottom: "0.5px solid #000", color: "#000" }}
    >
      {t("shared.back_to_sign_in")}
    </Link>
  );

  if (appLink && handOffToApp) {
    return (
      <GlassyAuthShell
        title={t("reset.app.title")}
        titleAccent={t("reset.app.title_accent")}
        subtitle={t("reset.app.subtitle")}
        pillLabel={t("reset.pill_reset")}
        topRight={backToSignIn}
      >
        <div className="flex flex-col gap-4">
          <a href={appLink} className="block">
            <button type="button" className="auth-submit">
              {t("reset.app.open")}
            </button>
          </a>
          <button
            type="button"
            onClick={() => setHandOffToApp(false)}
            className="self-center pb-px font-medium"
            style={{ borderBottom: "0.5px solid #000", color: "#000" }}
          >
            {t("reset.app.use_browser")}
          </button>
        </div>
      </GlassyAuthShell>
    );
  }

  if (tokenHash && hasSession === null) {
    return (
      <GlassyAuthShell
        title={t("reset.checking.title")}
        titleAccent={t("reset.checking.title_accent")}
        subtitle={t("reset.checking.subtitle")}
        pillLabel={t("reset.pill_reset")}
        topRight={backToSignIn}
      >
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </GlassyAuthShell>
    );
  }

  return (
    <GlassyAuthShell
      title={t("reset.form.title")}
      titleAccent={t("reset.form.title_accent")}
      subtitle={t("reset.form.subtitle")}
      pillLabel={t("reset.pill_new")}
      topRight={backToSignIn}
    >
      {hasSession === false ? (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-xl"
            style={{
              background: "rgba(220,38,38,0.06)",
              border: "0.5px solid rgba(220,38,38,0.3)",
              padding: "16px 18px",
            }}
          >
            <p
              className="leading-relaxed"
              style={{ fontSize: "14px", color: "#000" }}
            >
              {t("reset.form.invalid_link")}
            </p>
          </div>
          <Link to="/forgot-password" className="block">
            <button type="button" className="auth-submit">
              {t("reset.form.request_new")}
            </button>
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <div>
            <div
              className="uppercase mb-1.5"
              style={{
                fontSize: "11px",
                letterSpacing: "1.5px",
                opacity: 0.65,
                fontWeight: 500,
              }}
            >
              {t("reset.form.new_password")}
            </div>
            <div className="relative">
              <input
                id="new-password"
                className="auth-input pr-10"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder={t("reset.form.placeholder")}
                required
                autoComplete="new-password"
                aria-invalid={passwordTooShort || undefined}
                aria-describedby={passwordTooShort ? "pw-error" : undefined}
              />
              <button
                type="button"
                aria-label={showPassword ? t("password.hide") : t("password.show")}
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
            {passwordTooShort && (
              <p
                id="pw-error"
                className="mt-1.5"
                style={{ fontSize: "12px", color: "rgb(220,38,38)" }}
              >
                {t("reset.form.too_short")}
              </p>
            )}
            <PasswordStrengthMeter password={password} />
          </div>
          <div>
            <div
              className="uppercase mb-1.5"
              style={{
                fontSize: "11px",
                letterSpacing: "1.5px",
                opacity: 0.65,
                fontWeight: 500,
              }}
            >
              {t("reset.form.confirm")}
            </div>
            <input
              id="confirm"
              className="auth-input"
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              aria-invalid={passwordMismatch || undefined}
              aria-describedby={
                passwordMismatch ? "confirm-error" : undefined
              }
            />
            {passwordMismatch && (
              <p
                id="confirm-error"
                className="mt-1.5"
                style={{ fontSize: "12px", color: "rgb(220,38,38)" }}
              >
                {t("reset.form.mismatch")}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || hasSession !== true || !formValid}
            className="auth-submit mt-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("reset.form.submit")}
          </button>
        </form>
      )}
    </GlassyAuthShell>
  );
}
