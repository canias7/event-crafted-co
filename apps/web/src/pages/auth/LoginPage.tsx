import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { PasswordInput } from "@/components/auth/PasswordInput";

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
          "This account is suspended. Contact support if you think that's a mistake.",
        );
      } else if (r?.reason === "not_confirmed") {
        toast.error(
          "Your application is still under review. We'll email you the moment it's approved.",
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

    // Multi-role redirect: the entry point (`role` prop, set by route)
    // is the user's stated intent. Honour it when the user actually has
    // access to that side; otherwise fall back to whichever side they
    // do have, preferring host (the always-available default).
    const [{ data: prof }, { data: vp }, { data: members }] = await Promise.all([
      supabase
        .from("profiles")
        .select("role")
        .eq("id", signInData.user.id)
        .maybeSingle(),
      supabase
        .from("vendor_profiles")
        .select("application_status")
        .eq("user_id", signInData.user.id)
        .maybeSingle(),
      supabase
        .from("vendor_team_members")
        .select("vendor_id")
        .eq("user_id", signInData.user.id)
        .limit(1),
    ]);
    const profileRole = prof?.role as "host" | "vendor" | "admin" | undefined;
    const isLegacyVendorRole = profileRole === "vendor";
    const ownStatus = (vp as { application_status?: string } | null)
      ?.application_status;
    const hasVendorAccess =
      isLegacyVendorRole ||
      ownStatus === "approved" ||
      ownStatus === "pending" ||
      ((members as { vendor_id: string }[] | null) ?? []).length > 0;

    if (role === "vendor" && hasVendorAccess) {
      navigate("/vendor/dashboard");
    } else if (role === "host") {
      navigate("/customer/dashboard");
    } else {
      // No explicit intent — auto-detect: send vendors to vendor portal,
      // everyone else to the host dashboard.
      navigate(hasVendorAccess ? "/vendor/dashboard" : "/customer/dashboard");
    }
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
      {/* Brand panel — Vendora animated intro served from /public so
          the choreographed CSS/vanilla-JS animation runs untouched. */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-[#faf5ec]">
        <iframe
          src="/vendora-intro.html"
          title="Vendora"
          className="absolute inset-0 w-full h-full border-0"
          loading="eager"
        />
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-[#faf5ec]">
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
                  <PasswordInput
                    id="password"
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
