import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Picture } from "@/components/shared/Picture";
import heroImg from "@/assets/vendora-hero-cinematic.jpg?as=picture";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    const role = prof?.role ?? "host";
    navigate(
      role === "vendor" ? "/vendor/dashboard" : "/customer/dashboard",
    );
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
          <Link to="/" className="font-display text-2xl">
            Vendora
          </Link>

          <div>
            <div className="flex items-center gap-3 mb-5">
              <p className="font-label text-accent tracking-[0.4em]">
                {t("auth.login.eyebrow")}
              </p>
              <span className="h-px w-8 bg-accent/40" />
            </div>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              {t("auth.login.tagline_lead")}{" "}
              <span className="italic font-light text-accent">
                {t("auth.login.tagline_accent")}
              </span>
            </p>
          </div>

          <p className="text-xs text-background/50 tracking-wide">
            {t("auth.login.footer_brand")}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-display text-2xl block mb-8">
            Vendora
          </Link>

          <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
            {t("auth.login.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            {t("auth.login.subtitle")}
          </p>

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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.common.password")}</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-accent font-medium"
                >
                  {t("auth.login.forgot")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("auth.common.signing_in")}
                </>
              ) : (
                t("auth.login.submit")
              )}
            </Button>
          </form>

          <div className="mt-6 mb-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="flex-1 h-px bg-border" />
            {t("auth.common.or")}
            <span className="flex-1 h-px bg-border" />
          </div>

          <SocialAuthButtons />

          <p className="text-sm text-muted-foreground mt-8 text-center">
            {t("auth.login.new_here")}{" "}
            <Link to="/signup" className="text-accent font-medium">
              {t("auth.login.create_account")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
