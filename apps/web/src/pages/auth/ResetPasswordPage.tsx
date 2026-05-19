import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GlassyAuthShell } from "@/components/auth/GlassyAuthShell";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Supabase parses the recovery token from the URL fragment automatically;
  // an authed session means the link was valid.
  useEffect(() => {
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
  }, []);

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
      toast.error(error.message);
      return;
    }
    toast.success("Password updated — you're signed in");
    navigate("/", { replace: true });
  }

  return (
    <GlassyAuthShell
      title="Pick something"
      titleAccent="memorable."
      subtitle="Choose a new password for your Vendora account."
      pillLabel="NEW PASSWORD"
      topRight={
        <Link
          to="/login"
          className="pb-px font-medium"
          style={{ borderBottom: "0.5px solid #000", color: "#000" }}
        >
          Back to sign in
        </Link>
      }
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
              Your reset link is invalid or has expired.
            </p>
          </div>
          <Link to="/forgot-password" className="block">
            <button type="button" className="auth-submit">
              Request a new link
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
              New password
            </div>
            <div className="relative">
              <input
                id="new-password"
                className="auth-input pr-10"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
                aria-invalid={passwordTooShort || undefined}
                aria-describedby={passwordTooShort ? "pw-error" : undefined}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-foreground/55 hover:text-foreground transition-colors"
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
                Password must be at least 8 characters.
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
              Confirm
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
                Passwords don't match.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || hasSession !== true || !formValid}
            className="auth-submit mt-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Update password
          </button>
        </form>
      )}
    </GlassyAuthShell>
  );
}
