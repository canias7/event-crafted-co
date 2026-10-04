// Canary configuration, read from the environment. Nothing here prints a
// secret's value: the inventory functions only ever report variable NAMES and
// whether they are set.

export const BASE_URL = (process.env.CANARY_BASE_URL || "https://eventvendora.com").replace(/\/$/, "");
export const ALT_URLS = (process.env.CANARY_ALT_URLS || "https://app.eventvendora.com")
  .split(",")
  .map((u) => u.trim().replace(/\/$/, ""))
  .filter(Boolean);
export const ADMIN_URL = (process.env.CANARY_ADMIN_URL || "https://admin.eventvendora.com").replace(/\/$/, "");

// The production Supabase project the deployed web app talks to. The URL and
// publishable key are public (they ship in the browser bundle); they default
// to production so the public/anon checks work even with no secrets at all.
export const SUPABASE_URL = (
  process.env.E2E_SUPABASE_URL || "https://pahpjjubhbcbwqjpamwv.supabase.co"
).replace(/\/$/, "");
export const SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY || "sb_publishable_CtDX5E4wcZZAAjx7JtGRgw_ZaPNmjS0";

export const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "";
export const VENDOR_EMAIL = process.env.E2E_VENDOR_EMAIL || "";
// Dedicated synthetic host (no password; minted via the admin OTP path).
export const HOST_EMAIL = process.env.E2E_HOST_EMAIL || "e2e-host-1@eventvendora.test";

export const SUPABASE_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

// Listing ids the owner has confirmed are intentional even though their name
// looks like test data (comma-separated; the workflow's allowed_listings input).
export const ALLOWED_LISTING_IDS = new Set(
  (process.env.CANARY_ALLOWED_LISTINGS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// First-party hosts: a failed request to one of these is a canary failure.
export const FIRST_PARTY_HOSTS = [
  new URL(BASE_URL).hostname,
  ...ALT_URLS.map((u) => new URL(u).hostname),
  new URL(SUPABASE_URL).hostname,
];

export interface EnvVar {
  name: string;
  purpose: string;
  requiredFor: string;
}

// Variables the AUTHENTICATED canary needs. Missing any of these is a blocker:
// the preflight test fails and the authed tests are reported as BLOCKED, never
// as a silent skip.
export const REQUIRED_AUTH_VARS: EnvVar[] = [
  {
    name: "E2E_VENDOR_EMAIL",
    purpose: "Dedicated synthetic vendor account (e2e-vendor@eventvendora.test)",
    requiredFor: "vendor dashboard, profile, inbox, calendar checks",
  },
  {
    name: "E2E_SUPABASE_SERVICE_ROLE_KEY",
    purpose:
      "Mints a session for the dedicated test accounts via the admin OTP API. Production requires an emailed 6-digit code on the login form, so this is the path that doesn't weaken production auth.",
    requiredFor: "every authenticated check (seeded session)",
  },
];

// Optional: defaults to production values that are already public.
export const OPTIONAL_VARS: EnvVar[] = [
  { name: "E2E_SUPABASE_URL", purpose: "Supabase project URL (defaults to production)", requiredFor: "-" },
  { name: "E2E_SUPABASE_ANON_KEY", purpose: "Publishable key (defaults to production)", requiredFor: "-" },
  { name: "E2E_HOST_EMAIL", purpose: "Dedicated host account (defaults to e2e-host-1@eventvendora.test)", requiredFor: "role-isolation checks" },
];

export function missingAuthVars(): string[] {
  return REQUIRED_AUTH_VARS.filter((v) => !process.env[v.name]).map((v) => v.name);
}

export const AUTH_CONFIGURED = missingAuthVars().length === 0;

export const BLOCKED_REASON = `BLOCKED: missing required secret(s) ${missingAuthVars().join(", ")} — see the preflight result`;
