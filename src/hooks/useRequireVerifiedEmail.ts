import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Helper: returns true when the user can perform a sensitive action
// (their email is verified). When false, fires a toast nudging them
// to confirm + a link to the banner. Used by submit handlers as a
// pre-condition guard.
//
// We don't block the UI eagerly — the field stays editable so the
// host can compose, but the submit returns early with a clear msg.

export function useRequireVerifiedEmail() {
  const { user } = useAuth();

  return function requireVerified(action: string): boolean {
    if (!user) return true; // anon flows handle their own auth checks
    if (user.email_confirmed_at) return true;
    toast.error(
      `Please confirm your email before ${action}. Check your inbox or use the banner at the top to resend.`,
    );
    return false;
  };
}
