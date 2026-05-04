import { useEffect, useState } from "react";
import { Mail, X, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

// Top-of-app banner that nudges unverified users to confirm their
// email. Uses Supabase auth's built-in resend (Lovable handles the
// SMTP side via Supabase auth emails — no custom transactional
// pipeline needed).
//
// Dismiss is per-session (sessionStorage) so the user isn't
// hammered, but it shows again next session until they verify.

const DISMISS_KEY = "vendora.emailVerifyDismissed";

export function EmailVerificationBanner() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (loading || !user || user.email_confirmed_at || dismissed) {
    return null;
  }

  async function resend() {
    if (!user?.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
    });
    setResending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Verification email sent — check your inbox");
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage may be disabled — that's fine, just don't persist.
    }
  }

  return (
    <div
      className="bg-accent/10 border-b border-accent/30 text-sm relative z-40"
      role="status"
    >
      <div className="container mx-auto px-4 md:px-6 py-2.5 flex items-center gap-3 flex-wrap">
        <Mail className="w-4 h-4 text-accent shrink-0" aria-hidden />
        <p className="flex-1 leading-relaxed">
          <span className="font-medium">Confirm your email.</span>{" "}
          <span className="text-muted-foreground">
            We sent a link to{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
            Some features stay limited until you confirm.
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full h-8"
          onClick={resend}
          disabled={resending}
        >
          {resending ? (
            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-1.5" />
          )}
          Resend
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
