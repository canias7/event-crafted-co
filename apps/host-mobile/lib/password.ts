// Mirrors Supabase Auth's password rules (8+ characters with lower- and
// uppercase letters, a number and a symbol), so a weak password is caught
// before a code is sent. Auth also rejects passwords from breach lists,
// which only the server can check. Messages come from the "password"
// namespace in the current language.
import { i18n } from "@/lib/i18n";

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return i18n.t("password.minLength");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return i18n.t("password.mixedCase");
  if (!/[0-9]/.test(pw)) return i18n.t("password.number");
  if (!/[^A-Za-z0-9]/.test(pw)) return i18n.t("password.symbol");
  return null;
}

// The four rules as separate checks, for the strength bar.
export function passwordChecks(pw: string): boolean[] {
  return [
    pw.length >= 8,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ];
}
