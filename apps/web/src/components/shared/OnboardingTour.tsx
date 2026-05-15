import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";

// Lightweight first-run tour. Renders a fixed-position card in the
// bottom-right with N steps; user can prev/next or dismiss. Dismissal
// writes profiles.tour_dismissed_at so it never shows again.
//
// Per-role copy (host / vendor) — kept short by request.

interface Step {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}

const HOST_STEPS: Step[] = [
  {
    title: "Welcome to Vendora",
    body: "Quick 30-second tour of how this works. You can dismiss anytime — everything's discoverable from the sidebar.",
  },
  {
    title: "Find vendors",
    body: "Browse the curated directory by category, location, or save a search to get notified as new ones join.",
    ctaLabel: "Browse vendors",
    ctaHref: "/vendors",
  },
  {
    title: "Send inquiries",
    body: "When you find a vendor you like, send a single inquiry — or a multi-vendor blast to compare quotes side by side.",
    ctaLabel: "Open inquiries",
    ctaHref: "/customer/inquiries",
  },
  {
    title: "One link for guests",
    body: "Build a branded event microsite — countdown, schedule, RSVP, registry, group gifts — and share one URL.",
    ctaLabel: "Set up microsite",
    ctaHref: "/customer/microsite",
  },
];

const VENDOR_STEPS: Step[] = [
  {
    title: "Welcome, vendor",
    body: "Your inbox is where every host inquiry lands. Quick reply times convert dramatically better — under 3 hours is the platform target.",
  },
  {
    title: "Build out your profile",
    body: "5+ portfolio photos, 2+ priced packages, and at least one verification badge unlock the bulk of your match score.",
    ctaLabel: "Edit profile",
    ctaHref: "/vendor/profile",
  },
  {
    title: "Track conversion",
    body: "Analytics shows how you compare to other vendors in your category — reply time, booking rate, weekly inquiries.",
    ctaLabel: "View analytics",
    ctaHref: "/vendor/analytics",
  },
  {
    title: "After the event",
    body: "Publish a real-event gallery + deliver an HD album to the host. Both surface as social proof on your profile.",
    ctaLabel: "Open inbox",
    ctaHref: "/vendor/inbox",
  },
];

export function OnboardingTour() {
  const { user, profile, isApprovedVendor, refreshProfile } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [closed, setClosed] = useState(false);

  // Multi-role: pick the vendor tour for approved vendors and the host
  // tour for everyone else who isn't admin.
  const role = profile?.role;
  const tourDismissed = (profile as { tour_dismissed_at?: string | null } | null)
    ?.tour_dismissed_at;
  const eligible =
    !!user && !!profile && role !== "admin" && !tourDismissed && !closed;

  // Reset step when shown.
  useEffect(() => {
    if (eligible) setStepIndex(0);
  }, [eligible]);

  if (!eligible) return null;

  const steps = isApprovedVendor ? VENDOR_STEPS : HOST_STEPS;
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  async function dismiss() {
    setClosed(true);
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("profiles")
      .update({ tour_dismissed_at: new Date().toISOString() })
      .eq("id", user.id);
    if (refreshProfile) await refreshProfile();
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] card-soft shadow-lg p-5 animate-in fade-in slide-in-from-bottom-2"
      role="dialog"
      aria-label="Onboarding tour"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-1.5">
            Step {stepIndex + 1} of {steps.length}
          </p>
          <h2 className="font-display text-lg leading-tight">{step.title}</h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1"
          aria-label="Dismiss tour"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-foreground/80 leading-relaxed mb-4">
        {step.body}
      </p>

      {step.ctaHref && step.ctaLabel && (
        <Link
          to={step.ctaHref}
          onClick={dismiss}
          className="text-xs text-accent hover:underline inline-block mb-4"
        >
          {step.ctaLabel} →
        </Link>
      )}

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === stepIndex ? "w-6 bg-foreground" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>
        <div className="flex gap-1">
          {stepIndex > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setStepIndex((i) => i - 1)}
              className="rounded-full h-7 w-7 p-0"
              aria-label="Previous"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
          )}
          {!isLast ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setStepIndex((i) => i + 1)}
              className="rounded-full h-7 px-3 text-xs bg-foreground text-background hover:bg-foreground/90"
            >
              Next
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={dismiss}
              className="rounded-full h-7 px-3 text-xs bg-foreground text-background hover:bg-foreground/90"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
