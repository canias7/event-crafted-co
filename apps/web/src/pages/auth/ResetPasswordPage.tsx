import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FieldError } from "@/components/ui/field-error";
import { Picture } from "@/components/shared/Picture";
import heroImg from "@/assets/vendora-hero-cinematic.jpg?as=picture";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
              — NEW PASSWORD
            </p>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              Pick something{" "}
              <span className="italic font-light text-accent">
                memorable.
              </span>
            </p>
          </div>
          <p className="text-xs text-background/50 tracking-wide">
            © 2026 Vendora
          </p>
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
            Reset password
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            Choose a new password for your Vendora account.
          </p>

          {hasSession === false ? (
            <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-4 mb-4">
              <p className="text-sm leading-relaxed">
                Your reset link is invalid or has expired.
              </p>
              <Link to="/forgot-password" className="block mt-3">
                <Button variant="outline" className="w-full rounded-full">
                  Request a new link
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <PasswordInput
                  id="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="h-11"
                  required
                  aria-invalid={passwordTooShort || undefined}
                  aria-describedby={passwordTooShort ? "pw-error" : undefined}
                />
                {passwordTooShort && (
                  <FieldError id="pw-error">
                    Password must be at least 8 characters.
                  </FieldError>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm</Label>
                <PasswordInput
                  id="confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  className="h-11"
                  required
                  aria-invalid={passwordMismatch || undefined}
                  aria-describedby={passwordMismatch ? "confirm-error" : undefined}
                />
                {passwordMismatch && (
                  <FieldError id="confirm-error">
                    Passwords don't match.
                  </FieldError>
                )}
              </div>
              <Button
                type="submit"
                disabled={submitting || hasSession !== true || !formValid}
                className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {submitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
