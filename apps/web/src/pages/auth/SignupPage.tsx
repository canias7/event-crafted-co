import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Picture } from "@/components/shared/Picture";
import heroImg from "@/assets/vendora-hero-dinner.jpg?as=picture";

export default function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adult) {
      toast.error("You must confirm you're 18 or older to sign up.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        // Role is set server-side by handle_new_user() — every fresh
        // signup is a host. Vendors get bumped to role='vendor' only
        // when they insert a vendor_profiles row via /vendor-apply.
        data: { display_name: name },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // If Supabase has email confirmation enabled, signUp returns no session.
    // Route to the check-email page instead of bouncing into a protected route.
    if (!data.session) {
      navigate(`/check-email?email=${encodeURIComponent(email)}`);
      return;
    }
    toast.success("Account created");
    navigate("/customer/onboarding");
  }

  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
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
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 text-background w-full">
          <Link to="/" className="font-editorial text-3xl">
            Vendora
          </Link>

          <div>
            <div className="flex items-center gap-3 mb-5">
              <p className="font-label text-accent tracking-[0.4em]">
                {t("auth.signup.eyebrow")}
              </p>
              <span className="h-px w-8 bg-accent/40" />
            </div>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              {t("auth.signup.tagline_lead")}{" "}
              <span className="italic font-light text-accent">
                {t("auth.signup.tagline_accent")}
              </span>
            </p>
            <p className="text-sm text-background/70 mt-5 max-w-sm leading-relaxed">
              {t("auth.signup.tagline_subtitle")}
            </p>
          </div>

          <p className="text-xs text-background/50 tracking-wide">
            {t("auth.signup.footer_brand")}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-editorial text-3xl block mb-8">
            Vendora
          </Link>

          <h1 className="font-editorial text-4xl md:text-4xl mb-2 leading-tight">
            {t("auth.signup.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            {t("auth.signup.subtitle")}
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every vendor listing is hand-reviewed before going live.
            </p>
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.signup.name_label")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.common.email")}</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.common.password")}</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder={t("auth.signup.password_hint")}
                className="h-11"
              />
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer pt-1">
              <Checkbox
                checked={adult}
                onCheckedChange={(v) => setAdult(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                {t("auth.signup.adult_lead")}{" "}
                <Link to="/terms" className="text-accent" target="_blank">
                  {t("auth.signup.adult_terms")}
                </Link>{" "}
                {t("auth.signup.adult_and")}{" "}
                <Link to="/privacy" className="text-accent" target="_blank">
                  {t("auth.signup.adult_privacy")}
                </Link>
                .
              </span>
            </label>
            <Button
              type="submit"
              disabled={loading || !adult}
              className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("auth.common.creating")}
                </>
              ) : (
                t("auth.signup.submit")
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              We use your email to send account + booking notifications
              and to verify it's you. We don't sell your data, ever.
            </p>
          </form>

          <p className="text-sm text-muted-foreground mt-8 text-center">
            {t("auth.signup.already_have_account")}{" "}
            <Link to="/login" className="text-accent font-medium">
              {t("auth.signup.sign_in")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
