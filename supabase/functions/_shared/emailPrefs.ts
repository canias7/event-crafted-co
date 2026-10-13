// Footer line + List-Unsubscribe header for non-essential emails (digests,
// review prompts, onboarding nudges, reply emails). Every one of these
// honours a switch in Settings -> Notifications (profiles.notification_prefs),
// so they all point there. Server emails stay English.

export const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

export const NOTIFICATION_SETTINGS_URL = `${APP_URL}/settings/notifications`;

// `reason` is plain English finishing "You're getting this because ...",
// e.g. "daily summary emails are on".
export function emailPrefsFooterHtml(reason: string): string {
  return `You're getting this because ${reason}. Change which emails you get in <a href="${NOTIFICATION_SETTINGS_URL}" style="color:#a08259;text-decoration:underline;">Settings → Notifications</a>.`;
}

// Resend `headers` for the email payload.
export function listUnsubscribeHeaders(): Record<string, string> {
  return { "List-Unsubscribe": `<${NOTIFICATION_SETTINGS_URL}>` };
}
