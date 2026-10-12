import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";
import { TurnstileWidget, useCaptchaFallback } from "@/components/auth/TurnstileWidget";
import { authErrorText } from "@/components/auth/authErrors";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { t: tAuth } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  // No bot-check by default; only shown if the server still demands one.
  const captcha = useCaptchaFallback();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (captcha.blocked) {
      toast.error(tAuth("captcha.complete"));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      ...captcha.options,
    });
    setSubmitting(false);
    if (error) {
      if (captcha.handleError(error)) {
        toast.error(tAuth("captcha.complete_retry"));
      } else {
        toast.error(authErrorText(error.message));
      }
      return;
    }
    setSent(true);
  }

  return (
    <GlassyAuthShell
      title={t("auth.forgot.tagline_lead")}
      titleAccent={t("auth.forgot.tagline_accent")}
      subtitle={t("auth.forgot.subtitle")}
      pillLabel={tAuth("forgot.pill")}
      topRight={
        <Link
          to="/login"
          className="pb-px font-medium"
          style={{ borderBottom: "0.5px solid #000", color: "#000" }}
        >
          {t("auth.forgot.back_to_sign_in")}
        </Link>
      }
      belowCardLink={
        !sent ? (
          <div className="flex items-center justify-center gap-1.5 opacity-70">
            <span>{t("auth.forgot.remembered")}</span>
            <Link
              to="/login"
              className="font-medium pb-px"
              style={{ borderBottom: "0.5px solid #000", color: "#000" }}
            >
              {t("auth.forgot.sign_in")}
            </Link>
          </div>
        ) : undefined
      }
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-xl"
            style={{
              background: "rgba(0,0,0,0.035)",
              border: "0.5px solid rgba(0,0,0,0.3)",
              padding: "16px 18px",
            }}
          >
            <p
              className="leading-relaxed"
              style={{ fontSize: "14px", color: "#000" }}
            >
              {t("auth.forgot.sent_lead")}{" "}
              <span className="font-medium">{email}</span>{" "}
              {t("auth.forgot.sent_trail")}
            </p>
          </div>
          <Link to="/login" className="block">
            <button type="button" className="auth-submit">
              {t("auth.forgot.back_to_sign_in")}
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
              {t("auth.common.email")}
            </div>
            <input
              className="auth-input"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={tAuth("shared.email_placeholder")}
            />
          </div>
          {captcha.required ? (
            <div className="flex justify-center pt-1">
              <TurnstileWidget {...captcha.widgetProps} />
            </div>
          ) : null}
          <button
            type="submit"
            disabled={submitting || captcha.blocked}
            className="auth-submit mt-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {tAuth("shared.sending")}
              </>
            ) : (
              t("auth.forgot.submit")
            )}
          </button>
        </form>
      )}
    </GlassyAuthShell>
  );
}
