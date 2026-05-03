import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Heart,
  Cake,
  UtensilsCrossed,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

const eventTypeOptions: Array<{
  value: EventType;
  label: string;
  description: string;
  Icon: typeof Heart;
}> = [
  {
    value: "wedding",
    label: "Wedding",
    description: "Ceremony, reception, or both.",
    Icon: Heart,
  },
  {
    value: "birthday",
    label: "Birthday",
    description: "Milestone, kid's, or celebration party.",
    Icon: Cake,
  },
  {
    value: "holiday_dinner",
    label: "Holiday dinner",
    description: "Thanksgiving, Christmas, Hanukkah, NYE.",
    Icon: UtensilsCrossed,
  },
  {
    value: "other",
    label: "Something else",
    description: "Engagement, gala, baby shower, anniversary…",
    Icon: Sparkles,
  },
];

const spring = { type: "spring" as const, duration: 0.5, bounce: 0 };

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const [eventType, setEventType] = useState<EventType | "">("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [eventNotes, setEventNotes] = useState("");

  // Bounce non-hosts and unauthenticated users
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (profile && profile.role !== "host") {
      navigate("/", { replace: true });
    }
  }, [authLoading, user, profile, navigate]);

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!eventType) {
      toast.error("Please pick an event type");
      setStep(1);
      return;
    }

    const minCents = budgetMin
      ? Math.round(Number.parseFloat(budgetMin) * 100)
      : null;
    const maxCents = budgetMax
      ? Math.round(Number.parseFloat(budgetMax) * 100)
      : null;
    if (minCents != null && maxCents != null && minCents > maxCents) {
      toast.error("Budget min must be less than max");
      return;
    }

    setSubmitting(true);

    // Create the host_events row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ev, error: evErr } = await (supabase as any)
      .from("host_events")
      .insert({
        host_id: user.id,
        event_type: eventType,
        event_date: eventDate || null,
        event_location: eventLocation.trim() || null,
        budget_min_cents: minCents,
        budget_max_cents: maxCents,
        event_notes: eventNotes.trim() || null,
      })
      .select("id")
      .single();
    if (evErr || !ev) {
      setSubmitting(false);
      toast.error(`Couldn't save: ${evErr?.message ?? "unknown"}`);
      return;
    }

    // Point active_event_id at the new row, mark onboarded, and mirror the
    // event_* fields for backward-compat code paths still reading from
    // profiles directly.
    const profilePayload = {
      active_event_id: ev.id,
      event_type: eventType,
      event_date: eventDate || null,
      event_location: eventLocation.trim() || null,
      budget_min_cents: minCents,
      budget_max_cents: maxCents,
      event_notes: eventNotes.trim() || null,
      onboarded_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("profiles")
      .update(profilePayload as never)
      .eq("id", user.id);

    setSubmitting(false);

    if (error) {
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }

    toast.success("All set — let's plan your event.");
    navigate("/customer/dashboard");
  }

  async function handleSkip() {
    if (!user) return;
    setSkipping(true);
    await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() } as never)
      .eq("id", user.id);
    setSkipping(false);
    navigate("/customer/dashboard");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="px-6 md:px-8 py-5 flex items-center justify-between">
        <Link to="/" className="font-display text-xl">
          Vendora
        </Link>
        <button
          onClick={handleSkip}
          disabled={skipping}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {skipping ? "…" : "Skip for now"}
        </button>
      </header>

      <main className="flex-1 flex items-start justify-center pt-8 md:pt-16 pb-16 px-6">
        <div className="w-full max-w-2xl">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-12">
            <Dot active={step >= 1} done={step > 1} />
            <span className="flex-1 h-px bg-border" />
            <Dot active={step >= 2} done={false} />
          </div>

          <form onSubmit={handleFinish} className="space-y-8">
            {step === 1 ? (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={spring}
                className="space-y-6"
              >
                <div>
                  <p className="font-label text-accent mb-3">Step 1 of 2</p>
                  <h1 className="font-display text-3xl md:text-4xl mb-3 leading-tight">
                    What are you planning?
                  </h1>
                  <p className="text-muted-foreground leading-relaxed">
                    We'll tailor recommendations and your dashboard around it.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {eventTypeOptions.map((opt) => {
                    const selected = eventType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEventType(opt.value)}
                        className={`text-left rounded-sm border p-5 transition-all ${
                          selected
                            ? "border-foreground bg-foreground/5"
                            : "border-border hover:border-foreground/30"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 transition-colors ${
                            selected
                              ? "bg-accent text-accent-foreground"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          <opt.Icon className="w-4 h-4" />
                        </div>
                        <p className="font-display text-base mb-1">{opt.label}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    onClick={() => {
                      if (!eventType) {
                        toast.error("Pick one to continue");
                        return;
                      }
                      setStep(2);
                    }}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={spring}
                className="space-y-6"
              >
                <div>
                  <p className="font-label text-accent mb-3">Step 2 of 2</p>
                  <h1 className="font-display text-3xl md:text-4xl mb-3 leading-tight">
                    A few details
                  </h1>
                  <p className="text-muted-foreground leading-relaxed">
                    All optional — fill in what you know. You can always update later.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="event-date">Event date</Label>
                    <Input
                      id="event-date"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event-location">Location</Label>
                    <Input
                      id="event-location"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="City or venue"
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Budget range</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="500"
                        value={budgetMin}
                        onChange={(e) => setBudgetMin(e.target.value)}
                        placeholder="Min"
                        className="h-11 pl-7"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="500"
                        value={budgetMax}
                        onChange={(e) => setBudgetMax(e.target.value)}
                        placeholder="Max"
                        className="h-11 pl-7"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-notes">Anything we should know?</Label>
                  <Textarea
                    id="event-notes"
                    value={eventNotes}
                    onChange={(e) => setEventNotes(e.target.value)}
                    rows={4}
                    placeholder="Vibe, color palette, must-haves, dealbreakers — anything that helps vendors understand your event."
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(1)}
                    disabled={submitting}
                    className="rounded-full"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        Finish
                        <Check className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}

function Dot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium tnum transition-colors ${
        done
          ? "bg-accent text-accent-foreground"
          : active
            ? "bg-foreground text-background"
            : "bg-secondary text-muted-foreground"
      }`}
    >
      {done ? "✓" : ""}
    </div>
  );
}
