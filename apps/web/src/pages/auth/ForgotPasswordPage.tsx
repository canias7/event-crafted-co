import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picture } from "@/components/shared/Picture";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import heroImg from "@/assets/vendora-hero-cinematic.jpg?as=picture";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      toast.error("Please complete the bot-check below.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0">
          <Picture
            source={heroImg}
            alt=""
            loading="eager"
            fetchPriority="high"
            sizes="50vw"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 via-foreground/60 to-foreground/35" />
        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 text-background w-full">
          <Link to="/" className="font-editorial text-3xl">
            Vendora
          </Link>
          <div>
            <p className="font-label text-accent tracking-[0.4em] mb-5">
              {t("auth.forgot.eyebrow")}
            </p>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              {t("auth.forgot.tagline_lead")}{" "}
              <span className="italic font-light text-accent">
                {t("auth.forgot.tagline_accent")}
              </span>
            </p>
          </div>
          <p className="text-xs text-background/50 tracking-wide">© 2026 Vendora</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-editorial text-3xl block mb-8">
            Vendora
          </Link>

          <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mb-6">
            <KeyRound className="w-5 h-5" />
          </div>

          <h1 className="font-editorial text-4xl md:text-4xl mb-2 leading-tight">
            {t("auth.forgot.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            {t("auth.forgot.subtitle")}
          </p>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-sm border border-accent/30 bg-accent/5 p-4">
                <p className="text-sm leading-relaxed">
                  {t("auth.forgot.sent_lead")}{" "}
                  <span className="font-medium">{email}</span>{" "}
                  {t("auth.forgot.sent_trail")}
                </p>
              </div>
              <Link to="/login" className="block">
                <Button variant="outline" className="w-full h-11 rounded-full">
                  {t("auth.forgot.back_to_sign_in")}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="flex justify-center pt-1">
                <TurnstileWidget
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !captchaToken}
                className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {submitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {t("auth.forgot.submit")}
              </Button>
            </form>
          )}

          <p className="text-sm text-muted-foreground mt-8 text-center">
            {t("auth.forgot.remembered")}{" "}
            <Link to="/login" className="text-accent font-medium">
              {t("auth.forgot.sign_in")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
