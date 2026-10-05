import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";
import { authErrorText } from "@/components/auth/authErrors";

export default function CheckEmailPage() {
  const { t } = useTranslation("auth");
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const role = params.get("role") === "vendor" ? "vendor" : "host";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function resend() {
    if (!email) {
      toast.error(t("check_email.toast.missing_email"));
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    setResending(false);
    if (error) {
      toast.error(authErrorText(error.message));
      return;
    }
    setResent(true);
    toast.success(t("check_email.toast.sent"));
  }

  const isVendor = role === "vendor";

  return (
    <GlassyAuthShell
      title={isVendor ? t("check_email.title_vendor") : t("shared.check_your")}
      titleAccent={isVendor ? t("check_email.accent_vendor") : t("shared.email_accent")}
      subtitle={
        isVendor
          ? email
            ? t("check_email.subtitle_vendor", { email })
            : t("check_email.subtitle_vendor_no_email")
          : email
            ? t("check_email.subtitle_host", { email })
            : t("check_email.subtitle_host_no_email")
      }
      pillLabel={isVendor ? t("check_email.pill_vendor") : t("signup.pill_host")}
      topRight={
        <Link
          to="/login"
          className="pb-px font-medium"
          style={{ borderBottom: "0.5px solid #000" }}
        >
          {t("shared.back_to_sign_in")}
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-5">
        <div
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.08)",
            color: "#18181b",
          }}
        >
          <Mail className="w-6 h-6" />
        </div>

        {/* Vendors don't get a resend button — the email is informational
            only (no confirm link). They wait for admin approval. */}
        {!isVendor && (
          <button
            type="button"
            onClick={resend}
            disabled={resending || resent || !email}
            className="auth-submit w-full"
          >
            {resending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("shared.sending")}
              </>
            ) : resent ? (
              t("check_email.sent")
            ) : (
              <>
                {t("check_email.resend")}
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}

        <p
          className="text-center font-serif italic"
          style={{ fontSize: "12.5px", opacity: 0.7, lineHeight: 1.5 }}
        >
          <Trans
            i18nKey={isVendor ? "check_email.questions" : "check_email.not_received"}
            ns="auth"
            components={{
              link: (
                <a
                  href="mailto:hello@eventvendora.com"
                  className="font-medium pb-px"
                  style={{ borderBottom: "0.5px solid currentColor" }}
                />
              ),
            }}
          />
        </p>
      </div>
    </GlassyAuthShell>
  );
}
