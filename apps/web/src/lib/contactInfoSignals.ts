// Soft-warning signal detector for messages. Returns true if the body
// looks like it contains a phone number, email, or social handle.
//
// IMPORTANT: this is intentionally easy to bypass. We use it for the
// inline warning banner ("keep contact info on Vendora until booked"),
// not for hard-blocking. See the design rationale in commit history.

const PHONE_RE =
  /(?:\+?1[\s.-]?)?\(?\b\d{3}\b\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;

// Common social handle patterns. @-prefixed (igram/twitter/tiktok) +
// "find me on insta" / "DM me on the gram" phrasing.
const SOCIAL_RE =
  /(?:@\w{3,})|(?:\b(?:insta|instagram|the gram|tiktok|whatsapp|telegram|signal)\b)/i;

export interface ContactInfoFlags {
  phone: boolean;
  email: boolean;
  social: boolean;
  any: boolean;
}

export function detectContactInfo(body: string): ContactInfoFlags {
  const phone = PHONE_RE.test(body);
  const email = EMAIL_RE.test(body);
  const social = SOCIAL_RE.test(body);
  return { phone, email, social, any: phone || email || social };
}

export function contactInfoLabel(flags: ContactInfoFlags): string {
  if (flags.phone && flags.email) return "phone number + email";
  if (flags.phone && flags.social) return "phone number + social handle";
  if (flags.email && flags.social) return "email + social handle";
  if (flags.phone) return "phone number";
  if (flags.email) return "email address";
  if (flags.social) return "social handle";
  return "contact info";
}
