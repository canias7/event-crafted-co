import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

// The homepage A/B/C test: the section under the hero comes in three
// versions (A: category showcase, B: "What are you planning?",
// C: how it works). A visitor gets one at random on their first visit,
// about a third each, and keeps it on every return visit (localStorage).
//
// Preview any version with ?home=a, ?home=b or ?home=c on the homepage:
// that shows it without touching the visitor's own version and logs
// nothing. Results: the admin panel's "Homepage test" page.

export const HOME_EXPERIMENT = "home_section_v1";
export const HOME_VARIANTS = ["a", "b", "c"] as const;
export type HomeVariant = (typeof HOME_VARIANTS)[number];

/** view: saw the section · click: followed a link in it · select: picked
 *  an event type (B) · signup: created an account later. */
export type HomeEvent = "view" | "click" | "select" | "signup";

const STORAGE_KEY = "vendora.home-test";
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

/** Records an event for the visitor's version. Fire-and-forget: does
 *  nothing without a version or without analytics consent, and never
 *  throws. */
export function logHomeEvent(event: HomeEvent, detail?: string): void {
  const assignment = storedAssignment();
  if (!assignment || !analyticsAllowed()) return;
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
