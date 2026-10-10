// Password strength bar for sign-up and password reset. Four segments, one
// per rule Supabase Auth enforces (8+ characters, upper- and lowercase
// letters, a number, a symbol), champagne when met; the line under it names
// what's still missing. Same rules as the apps (lib/password.ts there).
// Supabase also rejects passwords found in data breaches; that check can
// only run on the server, at sign-up.

import { useTranslation } from "react-i18next";

export function passwordChecks(pw: string): boolean[] {
  return [
    pw.length >= 8,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ];
}

const RULE_KEYS = ["length", "case", "number", "symbol"] as const;

/** Key (under password.rules) of the first unmet rule, or null when all pass. */
export function passwordProblemKey(pw: string): (typeof RULE_KEYS)[number] | null {
  const i = passwordChecks(pw).findIndex((ok) => !ok);
  return i === -1 ? null : RULE_KEYS[i];
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation("auth");
  if (!password) return null;
  const met = passwordChecks(password).filter(Boolean).length;
  const problem = passwordProblemKey(password);

  return (
    <div className="mt-2" aria-live="polite">
      <div
        className="flex items-center gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={met}
        aria-label={t("password.rules.meter_label")}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < met ? "bg-gold" : "bg-muted"}`}
            aria-hidden
          />
        ))}
      </div>
      {problem ? (
        <p className="mt-1.5 text-[13px] text-accent">{t(`password.rules.${problem}`)}</p>
      ) : (
        <p className="mt-1.5 text-[13px] font-bold text-foreground">{t("password.rules.ok")}</p>
      )}
    </div>
  );
}
