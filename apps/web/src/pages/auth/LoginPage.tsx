import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";
import { authErrorText } from "@/components/auth/authErrors";

interface LoginPageProps {
  // When set, the form is themed for that role and the success redirect
  // prefers that role's dashboard. We still cross-check the actual role
  // on the profile so a host who lands on the vendor form gets routed
  // to /customer/explore, not into a vendor view they can't use.
  role?: "host" | "vendor";
}

type Step = "credentials" | "code";

export default function LoginPage({ role }: LoginPageProps = {}) {
  const { t } = useTranslation();
  const { t: tAuth } = useTranslation("auth");
  const navigate = useNavigate();
  const location = useLocation();
  // Honor a return URL passed via either ?next= or location.state.from
  // (the latter set by RequireRole and the team-invite / claim flows
  // when they bounce an unauthenticated user here). Only same-origin
  // pathnames are accepted to avoid open-redirect to an attacker URL.
  const returnTo = (() => {
    const search = new URLSearchParams(location.search).get("next");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateFrom = (location.state as any)?.from as string | undefined;
    const candidate = search ?? stateFrom ?? null;
    if (!candidate) return null;
    return candidate.startsWith("/") && !candidate.startsWith("//")
      ? candidate
      : null;
  })();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  // Client-side cooldown for Resend code so a rapid-fire button-mash
  // doesn't burn through Resend quota / annoy the user with duplicates.
  // Counts down from 30s on every successful resend.
  const [resendCooldown, setResendCooldown] = useState(0);

  const heading =
    role === "host"
      ? tAuth("login_chooser.host_title")
      : role === "vendor"
        ? tAuth("login_chooser.vendor_title")
        : t("auth.login.title");
  const subheading =
    role === "host"
      ? tAuth("login.welcome_host")
      : role === "vendor"
        ? tAuth("login.welcome_vendor")
        : t("auth.login.subtitle");
  const otherSideHref = role === "host" ? "/login/vendor" : "/login/host";
  const otherSideLabel =
    role === "host" ? tAuth("login.as_vendor") : tAuth("login.as_host");

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Step 1: verify password + send 6-digit code via signin-2fa edge fn
    const { data, error } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "request", email: email.trim(), password },
    });
    setLoading(false);
    if (error) {
      // Transport / non-2xx from signin-2fa. This is the class of bug
      // that bites silently when something platform-side breaks (e.g.
      // Supabase rolls out a new key format and the gateway rejects
      // pre-signin calls). Capture so it doesn't slip past again.
      Sentry.captureMessage("signin-2fa request failed", {
        level: "error",
        tags: { area: "auth", step: "request" },
        extra: { message: error.message, role: role ?? "unknown" },
      });
      toast.error(authErrorText(error.message));
      return;
    }
    const r = data as { ok?: boolean; reason?: string } | null;
    if (!r?.ok) {
      if (r?.reason === "banned") {
        toast.error(tAuth("login.toast.suspended"));
      } else if (r?.reason === "not_confirmed") {
        toast.error(tAuth("login.toast.under_review"));
      } else if (r?.reason === "invalid_credentials") {
        toast.error(tAuth("login.toast.invalid_credentials"));
      } else {
        Sentry.captureMessage("signin-2fa request returned unknown reason", {
          level: "warning",
          tags: { area: "auth", step: "request" },
          extra: { reason: r?.reason ?? null, role: role ?? "unknown" },
        });
        toast.error(tAuth("login.toast.start_failed"));
      }
      return;
    }
    toast.success(tAuth("login.toast.code_sent"));
    setCode("");
    setStep("code");
  }

  async function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Step 2: verify the code. signin-2fa mints the session server-side
    // and returns its tokens (the same path the apps use), so sign-in
    // needs no bot-check: password + emailed code are the protection.
    const { data, error } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "verify", email: email.trim(), code: code.trim() },
    });
    if (error) {
      setLoading(false);
      Sentry.captureMessage("signin-2fa verify failed", {
        level: "error",
        tags: { area: "auth", step: "verify" },
        extra: { message: error.message, role: role ?? "unknown" },
      });
      toast.error(authErrorText(error.message));
      return;
    }
    const r = data as {
      ok?: boolean;
      reason?: string;
      access_token?: string;
      refresh_token?: string;
    } | null;
    if (!r?.ok) {
      setLoading(false);
      const reason = r?.reason ?? "unknown";
      if (reason === "invalid_code") toast.error(tAuth("login.toast.invalid_code"));
      else if (reason === "expired") toast.error(tAuth("login.toast.code_expired"));
      else if (reason === "too_many_attempts") toast.error(tAuth("login.toast.too_many_attempts"));
      else if (reason === "no_pending_code") toast.error(tAuth("login.toast.no_pending_code"));
      else {
        Sentry.captureMessage("signin-2fa verify returned unknown reason", {
          level: "warning",
          tags: { area: "auth", step: "verify" },
          extra: { reason, role: role ?? "unknown" },
        });
        toast.error(tAuth("login.toast.verify_failed"));
      }
      return;
    }
    // Code verified — install the session signin-2fa minted.
    if (!r.access_token || !r.refresh_token) {
      setLoading(false);
      Sentry.captureMessage("signin-2fa verify returned no session", {
        level: "error",
        tags: { area: "auth", step: "verify" },
        extra: { role: role ?? "unknown" },
      });
      toast.error(tAuth("login.toast.sign_in_failed"));
      return;
    }
    const { data: signInData, error: signInError } =
      await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
    setLoading(false);
    if (signInError || !signInData.user) {
      toast.error(
        signInError?.message != null
          ? authErrorText(signInError.message)
          : tAuth("login.toast.sign_in_failed"),
      );
      return;
    }

    // Post-signin gate. Enforces the one-role-per-email rule. Identity
    // lives on profiles.role — a vendor is profiles.role === 'vendor',
    // a host is profiles.role === 'host'. The vendor_profiles row only
    // exists once they create their first listing, so we can't use it
    // to detect vendor identity for fresh-approved-but-no-listing-yet
    // accounts. Approval status lives on profiles.application_status
    // (the admin panel writes there directly).
    const [{ data: prof }, { data: members }] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, application_status, onboarded_at")
        .eq("id", signInData.user.id)
        .maybeSingle(),
      supabase
        .from("vendor_team_members")
        .select("vendor_id")
        .eq("user_id", signInData.user.id)
        .limit(1),
    ]);
    const p = (prof as { role?: string; application_status?: string; onboarded_at?: string | null } | null) ?? {};
    const profileRole = p.role;
    const profileStatus = p.application_status;
    const isAdmin = profileRole === "admin";
    const isVendorProfile = profileRole === "vendor";
    const isHostProfile = profileRole === "host";
    const isApprovedVendor =
      isVendorProfile && profileStatus === "approved";
    const isTeamMember =
      ((members as { vendor_id: string }[] | null) ?? []).length > 0;
    const hasVendorAccess = isApprovedVendor || isTeamMember;

    // /login/vendor: must be a vendor profile (approved) or a team
    // member on someone else's vendor.
    if (role === "vendor" && !isAdmin) {
      if (isHostProfile && !isTeamMember) {
        await supabase.auth.signOut();
        toast.error(tAuth("login.toast.registered_as_host"));
        setLoading(false);
        return;
      }
      if (isVendorProfile && !isApprovedVendor) {
        await supabase.auth.signOut();
        toast.error(
          profileStatus === "rejected"
            ? tAuth("login.toast.vendor_rejected")
            : tAuth("login.toast.vendor_under_review"),
        );
        setLoading(false);
        return;
      }
    }

    // /login/host: must be a host profile. A vendor (even unapproved)
    // can't slip in via the host side.
    if (role === "host" && !isAdmin && isVendorProfile) {
      await supabase.auth.signOut();
      toast.error(tAuth("login.toast.registered_as_vendor"));
      setLoading(false);
      return;
    }

    setLoading(false);
    // Honor an explicit return URL first (e.g. a claim deep link lands
    // users here with ?next=/claim/xxx, or location.state.from set by
    // RequireRole). Falls back to the role-appropriate dashboard otherwise.
    if (returnTo) {
      navigate(returnTo);
      return;
    }
    // Admin accounts (rare on the public web app — the admin panel
    // lives at admin.eventvendora.com) fall through to the host-side
    // dashboard so they have somewhere to land.
    if (role === "vendor" && hasVendorAccess) {
      navigate("/vendor/me");
    } else if (role === "host") {
      navigate("/customer/explore");
    } else {
      navigate(hasVendorAccess ? "/vendor/me" : "/customer/explore");
    }
  }

  // Tick the cooldown down once per second while it's active.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function resendCode() {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("signin-2fa", {
      body: { action: "request", email: email.trim(), password },
    });
    setLoading(false);
    if (error || !(data as { ok?: boolean })?.ok) {
      Sentry.captureMessage("signin-2fa resend failed", {
        level: "error",
        tags: { area: "auth", step: "resend" },
        extra: {
          message: error?.message ?? null,
          reason: (data as { reason?: string } | null)?.reason ?? null,
          role: role ?? "unknown",
        },
      });
      toast.error(tAuth("login.toast.resend_failed"));
      return;
    }
    setResendCooldown(30);
    toast.success(tAuth("login.toast.resent"));
  }

  const isHost = role === "host";
  const pillLabel = isHost
    ? tAuth("login.pill_host")
    : role === "vendor"
      ? tAuth("login.pill_vendor")
      : tAuth("login.pill_default");
  const accentWord = isHost
    ? tAuth("shared.accent_host")
    : role === "vendor"
      ? tAuth("shared.accent_vendor")
      : tAuth("login.accent_default");

  if (step === "code") {
    return (
      <GlassyAuthShell
        title={tAuth("shared.check_your")}
        titleAccent={tAuth("shared.email_accent")}
        subtitle={tAuth("login.code.subtitle", { email })}
        pillLabel={pillLabel}
        topRight={
          <span className="opacity-60">{tAuth("login.code.two_step")}</span>
        }
      >
        <form onSubmit={onSubmitCode} className="flex flex-col gap-4">
          <div>
            <div
              className="uppercase mb-1.5"
              style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
            >
              {tAuth("login.code.label")}
            </div>
            <input
              className="auth-input text-center font-mono"
              style={{ height: "52px", fontSize: "22px", letterSpacing: "0.4em" }}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              maxLength={6}
              placeholder="••••••"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="auth-submit"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {tAuth("login.code.verifying")}
              </>
            ) : (
              <>
                {tAuth("login.code.submit")}
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
          <div
            className="flex items-center justify-between"
            style={{ fontSize: "12px", opacity: 0.7 }}
          >
            <button
              type="button"
              disabled={loading}
              onClick={() => setStep("credentials")}
              className="pb-0.5 font-medium disabled:opacity-50"
              style={{ borderBottom: "0.5px solid currentColor" }}
            >
              {tAuth("login.code.different_account")}
            </button>
            <button
              type="button"
              disabled={loading || resendCooldown > 0}
              onClick={resendCode}
              className="pb-0.5 font-medium disabled:opacity-50"
              style={{ borderBottom: "0.5px solid currentColor" }}
            >
              {resendCooldown > 0
                ? tAuth("login.code.resend_wait", { seconds: resendCooldown })
                : tAuth("login.code.resend")}
            </button>
          </div>
        </form>
      </GlassyAuthShell>
    );
  }

  return (
    <GlassyAuthShell
      title={tAuth("login.title")}
      titleAccent={accentWord}
      subtitle={tAuth("login.subtitle")}
      pillLabel={pillLabel}
      topRight={
        <>
          <span>
            <span style={{ opacity: 0.6 }}>{tAuth("login.new_here")}{" "}</span>
            <Link
              to="/signup"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid #000" }}
            >
              {tAuth("login.create_account")}
            </Link>
          </span>
        </>
      }
      belowCardLink={
        role ? (
          <div>
            <span style={{ opacity: 0.6 }}>{tAuth("shared.other_side")}{" "}</span>
            <Link
              to={otherSideHref}
              className="font-medium pb-px"
              style={{ borderBottom: "0.5px solid #000", color: "#000" }}
            >
              {otherSideLabel}
            </Link>
          </div>
        ) : undefined
      }
    >
      <form onSubmit={onSubmitCredentials} className="flex flex-col gap-3.5">
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder={tAuth("shared.email_placeholder")}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div
              className="uppercase"
              style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
            >
              {t("auth.common.password")}
            </div>
            <Link
              to="/forgot-password"
              className="pb-0.5"
              style={{ fontSize: "11px", opacity: 0.7, borderBottom: "0.5px solid currentColor" }}
            >
              {t("auth.login.forgot")}
            </Link>
          </div>
          <div className="relative">
            <input
              className="auth-input pr-10"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
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
        </div>
        <button type="submit" disabled={loading} className="auth-submit mt-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {tAuth("login.sending_code")}
            </>
          ) : (
            <>
              {tAuth("login.continue")}
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
        <p
          className="text-center font-serif italic"
          style={{ fontSize: "12.5px", opacity: 0.55, marginTop: "6px", lineHeight: 1.5 }}
        >
          {tAuth("login.code_note")}
        </p>
      </form>
    </GlassyAuthShell>
  );
}
