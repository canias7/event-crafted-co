// Supabase Auth and Edge Function error messages that the sign-in,
// sign-up and password pages show in toasts, in the visitor's language.
//
// English keeps the server's own wording exactly: every English entry
// under "server_errors" in locales/en/auth.json is "{{message}}", so only
// Spanish swaps in a translation. Messages we don't recognise pass
// through unchanged.

import i18n from "@/i18n";

interface Rule {
  key: string;
  pattern: RegExp;
  vars?: (match: RegExpMatchArray) => Record<string, string>;
}

const RULES: Rule[] = [
  // Rate limits (resend, password reset, sign-up).
  {
    key: "rate_limit_wait",
    pattern: /^For security purposes, you can only request this after (\d+) seconds?\.?$/i,
    vars: (m) => ({ seconds: m[1] }),
  },
  {
    key: "rate_limit_every",
    pattern: /^For security purposes, you can only request this once every (\d+) seconds?\.?$/i,
    vars: (m) => ({ seconds: m[1] }),
  },
  { key: "email_rate_limit", pattern: /^Email rate limit exceeded\.?$/i },
  { key: "request_rate_limit", pattern: /^(?:Request rate limit reached|Too many requests)\.?$/i },
  // Sign-up.
  {
    key: "user_exists",
    pattern: /^(?:User already registered|A user with this email address has already been registered)\.?$/i,
  },
  {
    key: "signups_disabled",
    pattern: /^(?:Signups not allowed for this instance|Email signups are disabled)\.?$/i,
  },
  { key: "password_required", pattern: /^Signup requires a valid password\.?$/i },
  {
    key: "email_required",
    pattern: /^(?:To signup, please provide your email|An email address is required)\.?$/i,
  },
  {
    key: "email_invalid",
    pattern: /^(?:Unable to validate email address: invalid format|Email address ".*" is invalid)\.?$/i,
  },
  { key: "email_not_authorized", pattern: /^Email address .*not authorized\.?$/i },
  { key: "save_user_failed", pattern: /^Database error saving new user\.?$/i },
  { key: "confirmation_email_failed", pattern: /^Error sending confirmation e?mail\.?$/i },
  { key: "recovery_email_failed", pattern: /^Error sending recovery e?mail\.?$/i },
  // Password rules.
  {
    key: "password_min_length",
    pattern: /^Password should be at least (\d+) characters?\.?$/i,
    vars: (m) => ({ min: m[1] }),
  },
  {
    key: "password_max_length",
    pattern: /^Password cannot be longer than (\d+) characters?\.?$/i,
    vars: (m) => ({ max: m[1] }),
  },
  {
    key: "password_characters",
    pattern: /^Password should contain at least one character of each: (.+?)\.?$/i,
    vars: (m) => ({ sets: m[1] }),
  },
  {
    key: "password_pwned",
    pattern: /^Password is known to be weak and easy to guess, please choose a different one\.?$/i,
  },
  { key: "same_password", pattern: /^New password should be different from the old password\.?$/i },
  { key: "reauthentication", pattern: /^Password update requires reauthentication\.?$/i },
  // Sessions and emailed links.
  {
    key: "session_missing",
    pattern:
      /^(?:Auth session missing!?|Session not found|Session from session_id claim in JWT does not exist|Invalid Refresh Token: .+)$/i,
  },
  {
    key: "link_invalid",
    pattern: /^(?:Token has expired or is invalid|Email link is invalid or has expired)\.?$/i,
  },
  { key: "user_not_found", pattern: /^(?:User not found|User from sub claim in JWT does not exist)\.?$/i },
  // Network and Edge Function failures.
  {
    key: "network",
    pattern:
      /^(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Failed to send a request to the Edge Function)$/i,
  },
  {
    key: "server",
    pattern: /^(?:Edge Function returned a non-2xx status code|Relay Error invoking the Edge Function)$/i,
  },
];

function translateSentence(sentence: string): string | null {
  for (const { key, pattern, vars } of RULES) {
    const match = sentence.match(pattern);
    if (match) {
      return i18n.t(`server_errors.${key}`, {
        ns: "auth",
        message: sentence,
        ...vars?.(match),
      });
    }
  }
  return null;
}

/** An auth error message in the current language (unknown ones pass through). */
export function authErrorText(message: string): string {
  if (!message) return message;
  const whole = translateSentence(message);
  if (whole !== null) return whole;
  // Supabase joins several weak-password reasons into one message
  // ("Password should be at least 8 characters. Password is known to be
  // weak…"). Translate each sentence and keep the original spacing.
  const parts = message.split(/(\s+)(?=Password\b)/);
  if (parts.length > 1) {
    const translated = parts.map((part, i) => (i % 2 === 1 ? part : translateSentence(part)));
    if (translated.every((part) => part !== null)) return translated.join("");
  }
  return message;
}
