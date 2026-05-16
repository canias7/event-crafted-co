import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";

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
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  // Client-side cooldown for Resend code so a rapid-fire button-mash
  // doesn't burn through Resend quota / annoy the user with duplicates.
  // Counts down from 30s on every successful resend.
  const [resendCooldown, setResendCooldown] = useState(0);

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

    // Post-signin gate. Enforces the one-role-per-email rule on the
    // login side — without this, a vendor could open /login/host,
    // sign in with the same email, and slip into the host portal
    // (and vice versa).
    const [{ data: prof }, { data: vp }, { data: members }] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, onboarded_at")
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
    const profileRole = (prof as { role?: string } | null)?.role;
    const isAdmin = profileRole === "admin";
    const ownStatus = (vp as { application_status?: string } | null)
      ?.application_status;
    const hasOwnVendor = !!ownStatus;
    const isApprovedVendor = ownStatus === "approved";
    const isTeamMember =
      ((members as { vendor_id: string }[] | null) ?? []).length > 0;
    const hasVendorAccess = isApprovedVendor || isTeamMember;

    // Vendor side: must be approved, or a team member of another vendor.
    if (role === "vendor" && !isAdmin) {
      if (hasOwnVendor && !hasVendorAccess) {
        await supabase.auth.signOut();
        toast.error(
          ownStatus === "rejected"
            ? "Your vendor application wasn't approved. Reach out to support if you think this is a mistake."
            : "Your vendor application is still under review. We'll email you the moment it's approved.",
        );
        setLoading(false);
        return;
      }
      if (!hasOwnVendor && !isTeamMember) {
        // No vendor identity at all — this email is registered as a host.
        await supabase.auth.signOut();
        toast.error(
          "This email is registered as a host. Sign in on the host side instead.",
        );
        setLoading(false);
        return;
      }
    }

    // Host side: the email can't belong to a vendor account.
    // One-role-per-email means a vendor's email shouldn't have host
    // access, even if Supabase's email_confirmed_at lets the user in.
    if (role === "host" && !isAdmin && hasOwnVendor) {
      await supabase.auth.signOut();
      toast.error(
        "This email is registered as a vendor. Sign in on the vendor side instead.",
      );
      setLoading(false);
      return;
    }

    setLoading(false);
    // Admin accounts (rare on the public web app — the admin panel
    // lives at admin.eventvendora.com) just fall through to the
    // host-side dashboard so they have somewhere to land.
    if (role === "vendor" && hasVendorAccess) {
      navigate("/vendor/home");
    } else if (role === "host") {
      navigate("/customer/explore");
    } else {
      navigate(hasVendorAccess ? "/vendor/home" : "/customer/explore");
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
      toast.error("Couldn't resend the code. Try again.");
      return;
    }
    setResendCooldown(30);
    toast.success("We sent a new code.");
  }

  const isHost = role === "host";
  const pillLabel = isHost ? "HOST SIGN IN" : role === "vendor" ? "VENDOR SIGN IN" : "SIGN IN";
  const accentWord = isHost ? "host." : role === "vendor" ? "vendor." : "Vendora.";

  if (step === "code") {
    return (
      <GlassyAuthShell
        title="Check your"
        titleAccent="email."
        subtitle={`We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
        pillLabel={pillLabel}
        topRight={
          <span className="opacity-60">2-step verification</span>
        }
      >
        <form onSubmit={onSubmitCode} className="flex flex-col gap-4">
          <div>
            <div
              className="uppercase mb-1.5"
              style={{ fontSize: "11px", letterSpacing: "1.5px", opacity: 0.65, fontWeight: 500 }}
            >
              6-digit code
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
          <button type="submit" disabled={loading || code.length !== 6} className="auth-submit">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                Sign in
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
              ← Use a different account
            </button>
            <button
              type="button"
              disabled={loading || resendCooldown > 0}
              onClick={resendCode}
              className="pb-0.5 font-medium disabled:opacity-50"
              style={{ borderBottom: "0.5px solid currentColor" }}
            >
              {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend code"}
            </button>
          </div>
        </form>
      </GlassyAuthShell>
    );
  }

  return (
    <GlassyAuthShell
      title="Welcome back,"
      titleAccent={accentWord}
      subtitle="Sign in to manage your events with Vendora."
      pillLabel={pillLabel}
      topRight={
        <>
          <Link to="/support" className="opacity-60">
            Need help?
          </Link>
          <span>
            <span style={{ opacity: 0.6 }}>New here? </span>
            <Link
              to="/signup"
              className="pb-px font-medium"
              style={{ borderBottom: "0.5px solid #000" }}
            >
              Create an account
            </Link>
          </span>
        </>
      }
      belowCardLink={
        role ? (
          <div>
            <span style={{ opacity: 0.6 }}>On the other side? </span>
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
            placeholder="you@example.com"
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
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        <button type="submit" disabled={loading} className="auth-submit mt-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending code…
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
        <p
          className="text-center font-editorial italic"
          style={{ fontSize: "12.5px", opacity: 0.55, marginTop: "6px", lineHeight: 1.5 }}
        >
          We'll email you a 6-digit code to confirm it's you.
        </p>
      </form>
    </GlassyAuthShell>
  );
}
