import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

// The homepage A/B/C test: the section under the hero comes in three
// versions (A: category showcase, B: "What are you planning?",
// C: how it works). A visitor gets one at random the first time they see
// the homepage, about a third each, and keeps it on every return visit
// (localStorage).
//
// Preview any version with ?home=a, ?home=b or ?home=c on the homepage:
// that shows it without giving the visitor a version and records nothing.
//
// Recorded only for visitors who chose "Accept all" in the cookie banner,
// in home_experiment_events:
//   visit         got a version (once per visitor)
//   view          scrolled down to the section (once per browser session)
//   click/select  a tile, event type, category chip, link or main button
//   signup_start  opened a sign-up form
// A completed registration is the account itself: sign-up saves the
// visitor's version with the new account (user metadata "home_test"), and
// the admin "A/B testing" page counts those accounts, vendors and hosts
// apart. Results: admin.eventvendora.com → A/B testing.

export const HOME_EXPERIMENT = "home_section_v1";
export const HOME_VARIANTS = ["a", "b", "c"] as const;
export type HomeVariant = (typeof HOME_VARIANTS)[number];

export type HomeEvent = "visit" | "view" | "click" | "select" | "signup_start";

const STORAGE_KEY = "vendora.home-test";
const COUNTED_KEY = "vendora.home-test.counted";
const CONSENT_KEY = "vendora.cookie-consent";

interface Assignment {
  variant: HomeVariant;
  visitorId: string;
}

const isVariant = (value: unknown): value is HomeVariant =>
  typeof value === "string" && (HOME_VARIANTS as readonly string[]).includes(value);

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Older browsers: a v4 UUID from getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storedAssignment(): Assignment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Assignment>;
    return isVariant(saved.variant) && typeof saved.visitorId === "string"
      ? { variant: saved.variant, visitorId: saved.visitorId }
      : null;
  } catch {
    return null;
  }
}

/** The visitor's version: the one from an earlier visit, or picked now
 *  (each a third of the time) and remembered. */
export function homeAssignment(): Assignment {
  const saved = storedAssignment();
  if (saved) return saved;
  const assignment: Assignment = {
    variant: HOME_VARIANTS[Math.floor(Math.random() * HOME_VARIANTS.length)],
    visitorId: randomId(),
  };
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...assignment, assignedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage blocked (private mode): this visit still gets a version.
  }
  return assignment;
}

/** ?home=a|b|c on the homepage: preview that version. */
export function previewVariant(search: string): HomeVariant | null {
  const value = new URLSearchParams(search).get("home");
  return isVariant(value) ? value : null;
}

/** Events are only sent for visitors who accepted analytics cookies
 *  ("Accept all" in the cookie banner). */
export function analyticsAllowed(): boolean {
  try {
    const consent = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as {
      choice?: string;
    } | null;
    return consent?.choice === "all";
  } catch {
    return false;
  }
}

function send(assignment: Assignment, event: HomeEvent, detail?: string): void {
  // The table isn't in the generated Supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (supabase as any)
    .from("home_experiment_events")
    .insert({
      experiment: HOME_EXPERIMENT,
      variant: assignment.variant,
      visitor_id: assignment.visitorId,
      event,
      detail: detail ? detail.slice(0, 80) : null,
      lang: (i18n.resolvedLanguage ?? i18n.language ?? "en").slice(0, 8),
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Records which version this visitor got, once per visitor, as soon as
 *  they have a version and analytics consent. */
export function recordHomeVisit(): void {
  const assignment = storedAssignment();
  if (!assignment || !analyticsAllowed()) return;
  try {
    if (localStorage.getItem(COUNTED_KEY) === assignment.visitorId) return;
    localStorage.setItem(COUNTED_KEY, assignment.visitorId);
  } catch {
    return;
  }
  send(assignment, "visit");
}

/** Records an event for the visitor's version. Fire-and-forget: does
 *  nothing without a version or without analytics consent, and never
 *  throws. */
export function logHomeEvent(event: Exclude<HomeEvent, "visit">, detail?: string): void {
  const assignment = storedAssignment();
  if (!assignment || !analyticsAllowed()) return;
  recordHomeVisit();
  send(assignment, event, detail);
}

/** Saved with a new account at sign-up (user metadata "home_test") so the
 *  account counts as a registration for this visitor's version. Null
 *  without a version or without analytics consent. */
export function homeTestForSignup(): {
  experiment: string;
  variant: HomeVariant;
  visitor_id: string;
} | null {
  const assignment = storedAssignment();
  if (!assignment || !analyticsAllowed()) return null;
  recordHomeVisit();
  return { experiment: HOME_EXPERIMENT, variant: assignment.variant, visitor_id: assignment.visitorId };
}

// Accepting analytics cookies on any page counts the version this visitor
// already got (the cookie banner announces the choice).
if (typeof window !== "undefined") {
  window.addEventListener("vendora:cookie-consent", () => recordHomeVisit());
}
