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

interface LoginPageProps {
  // When set, the form is themed for that role and the success redirect
  // prefers that role's dashboard. We still cross-check the actual role
  // on the profile so a host who lands on the vendor form gets routed
  // to /customer/dashboard, not into a vendor view they can't use.
  role?: "host" | "vendor";
}

type Step = "credentials" | "code";

export default function LoginPage({ role }: LoginPageProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const heading =
    role === "host"
      ? "Host sign in"
      : role === "vendor"
        ? "Vendor sign in"
        : t("auth.login.title");
  const subheading =
    role === "host"
      ? "Welcome back, host."
      : role === "vendor"
        ? "Welcome back, vendor."
        : t("auth.login.subtitle");
  const otherSideHref = role === "host" ? "/login/vendor" : "/login/host";
  const otherSideLabel =
    role === "host" ? "Sign in as a vendor" : "Sign in as a host";

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Step 1: verify password + send 6-digit code via signin-2fa edge fn
    const { data, error } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "request", email: email.trim(), password },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = data as { ok?: boolean; reason?: string } | null;
    if (!r?.ok) {
      if (r?.reason === "banned") {
        toast.error(
          "Your vendor application is still under review. We'll email you once it's approved.",
        );
      } else if (r?.reason === "invalid_credentials") {
        toast.error("Email or password is incorrect.");
      } else {
        toast.error("Couldn't start sign-in. Please try again.");
      }
      return;
    }
    toast.success("We emailed you a 6-digit code.");
    setCode("");
    setStep("code");
  }

  async function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Step 2: verify the code, then call signInWithPassword to actually
    // establish the session.
    const { data, error } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "verify", email: email.trim(), code: code.trim() },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    const r = data as { ok?: boolean; reason?: string } | null;
    if (!r?.ok) {
      setLoading(false);
      const reason = r?.reason ?? "unknown";
      if (reason === "invalid_code") toast.error("That code is incorrect.");
      else if (reason === "expired") toast.error("That code expired. Request a new one.");
      else if (reason === "too_many_attempts") toast.error("Too many attempts. Request a new code.");
      else if (reason === "no_pending_code") toast.error("No pending code. Start over.");
      else toast.error("Couldn't verify code.");
      return;
    }
    // Code verified — now actually sign in with password.
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      toast.error(signInError.message);
      return;
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", signInData.user.id)
      .maybeSingle();
    const userRole = prof?.role ?? "host";
    navigate(userRole === "vendor" ? "/vendor/dashboard" : "/customer/dashboard");
  }

  async function resendCode() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "request", email: email.trim(), password },
    });
    setLoading(false);
    if (error || !(data as { ok?: boolean })?.ok) {
      toast.error("Couldn't resend the code. Try again.");
      return;
    }
    toast.success("We sent a new code.");
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

          {step === "credentials" ? (
            <>
              <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
                {heading}
              </h1>
              <p className="text-sm text-muted-foreground mb-10">{subheading}</p>

              <form onSubmit={onSubmitCredentials} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.common.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
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
                    autoComplete="current-password"
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
                      Sending code…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  We'll email you a 6-digit code to confirm it's you.
                </p>
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

              {role ? (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  On the other side?{" "}
                  <Link to={otherSideHref} className="text-accent font-medium">
                    {otherSideLabel}
                  </Link>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
                Check your email
              </h1>
              <p className="text-sm text-muted-foreground mb-10">
                We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
              </p>

              <form onSubmit={onSubmitCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    placeholder="••••••"
                    className="h-12 text-center font-mono text-xl tracking-[0.4em]"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep("credentials")}
                  className="text-accent font-medium hover:underline disabled:opacity-50"
                >
                  ← Use a different account
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={resendCode}
                  className="text-accent font-medium hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
