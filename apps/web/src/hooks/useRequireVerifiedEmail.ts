import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import i18n from "@/i18n";

// Helper: returns true when the user can perform a sensitive action
// (their email is verified). When false, fires a toast nudging them
// to confirm + a link to the banner. Used by submit handlers as a
// pre-condition guard.
//
// `action` comes already in the visitor's language ("upgrading your
// plan" / "mejorar tu plan").
//
// We don't block the UI eagerly — the field stays editable so the
// host can compose, but the submit returns early with a clear msg.

export function useRequireVerifiedEmail() {
  const { user } = useAuth();

  return function requireVerified(action: string): boolean {
    if (!user) return true; // anon flows handle their own auth checks
    if (user.email_confirmed_at) return true;
    toast.error(i18n.t("auth.verify_email_first", { action }));
    return false;
  };
}
