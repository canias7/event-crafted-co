import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { useVendors } from "@/hooks/useVendors";
import { formatCents } from "@/lib/format";
import { VendorCard } from "@/components/shared/VendorCard";

// "Plan in 5 minutes" host wizard — 6-question single-page form,
// then a one-shot results page with starter checklist + vendor
// recommendations + rough budget. Conversion lever for first-time
// visitors: turns a cold landing into a personalized plan in under
// a minute, then funnels into signup with the context preserved.

const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "baby_shower", label: "Baby shower" },
  { value: "anniversary", label: "Anniversary" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "corporate", label: "Corporate event" },
  { value: "other", label: "Something else" },
];

// Per-event-type starter checklists. Kept short — wizard is meant
// to be *fast*, not exhaustive. Hosts get the full library after
// they create their event in the dashboard.
const STARTER_CHECKLIST: Record<string, string[]> = {
  wedding: [
    "Set a date and budget",
    "Book the venue",
    "Lock in photographer + videographer",
    "Catering tasting",
    "Send save-the-dates",
  ],
  birthday: [
    "Confirm guest count",
    "Book venue or finalize home setup",
    "Order cake",
    "Photographer (if milestone)",
    "Send invitations",
  ],
  baby_shower: [
    "Pick a date 4-6 weeks out",
    "Confirm theme + colors",
    "Book photographer",
    "Catering / dessert",
    "Send invitations",
  ],
  anniversary: [
    "Decide event style (dinner / party)",
    "Book venue or restaurant",
    "Photographer / florals",
    "Invitations",
  ],
  holiday_dinner: [
    "Plan menu + book caterer",
    "Décor + florals",
    "Confirm guest count",
    "Send invitations",
  ],
  corporate: [
    "Define audience + outcomes",
    "Book venue + AV",
    "Catering",
    "Photographer / videographer",
    "Logistics + invitations",
  ],
  other: [
    "Confirm date + guest count",
    "Book venue",
    "Catering / food",
    "Photography",
    "Invitations",
  ],
};

// Top vendor sub-categories to surface per event type. Used to filter
// the recommendations grid (matched against vendor_profiles.category,
// which now stores the sub name from categoryTaxonomy.ts).
const TOP_CATEGORIES: Record<string, string[]> = {
  wedding: ["Photography", "Florists", "Event Venues", "Catering", "DJs"],
  birthday: ["Photography", "Catering", "DJs", "Decor Rentals"],
  baby_shower: ["Photography", "Florists", "Catering"],
  anniversary: ["Photography", "Catering", "Florists"],
  holiday_dinner: ["Catering", "Florists", "Decor Rentals"],
  corporate: ["Corporate / Conference Spaces", "Catering", "Lighting & AV Equipment", "Photography"],
  other: ["Photography", "Catering", "Florists"],
};

interface FormState {
  eventType: string;
  eventDate: string;
  guests: string;
  location: string;
  vibe: string;
  budget: string;
}

export default function PlanInFivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { vendors } = useVendors();
  const [step, setStep] = useState<"form" | "result">("form");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    eventType: "wedding",
    eventDate: "",
    guests: "",
    location: "",
    vibe: "",
    budget: "",
  });

  useDocumentMeta({
    title: "Plan your event in 5 minutes — Vendora",
    description:
      "Answer 6 questions and get a personalized plan: vendor recommendations, a starter checklist, and a budget estimate.",
  });

  function patch<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // If signed in, persist as the active event so the dashboard
    // picks it up. Otherwise stash to localStorage for post-signup
    // hydration.
    if (user) {
      const guestCount = Number.parseInt(form.guests, 10) || null;
      const budget = Number.parseInt(form.budget, 10) || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("host_events")
        .insert({
          host_id: user.id,
          event_type: form.eventType,
          event_date: form.eventDate || null,
          event_location: form.location || null,
          guest_count: guestCount,
          budget_max_cents: budget ? budget * 100 : null,
          notes: form.vibe || null,
        })
        .select("id")
        .single();
    } else {
      try {
        localStorage.setItem("vendora.plan-in-5", JSON.stringify(form));
      } catch {
        // Storage blocked — quietly continue.
      }
    }
    setSubmitting(false);
    setStep("result");
  }

  const recommended = vendors
    .filter((v) => {
      const cats = TOP_CATEGORIES[form.eventType] ?? [];
      return cats.includes(v.category);
    })
    .slice(0, 6);

  const checklist = STARTER_CHECKLIST[form.eventType] ?? STARTER_CHECKLIST.other;

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="pt-32 pb-16 md:pt-36">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          {step === "form" ? (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <p className="font-label text-accent tracking-[0.4em]">
                  — PLAN IN 5
                </p>
              </div>
              <h1 className="font-display text-4xl md:text-5xl leading-tight mb-3">
                Six questions, one plan.
              </h1>
              <p className="text-base text-foreground/75 leading-relaxed mb-10">
                Tell us the basics. We'll match vendors, sketch a checklist,
                and estimate the budget.
              </p>

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label>What kind of event?</Label>
                  <div className="flex flex-wrap gap-2">
                    {EVENT_TYPES.map((e) => {
                      const active = form.eventType === e.value;
                      return (
                        <button
                          key={e.value}
                          type="button"
                          onClick={() => patch("eventType", e.value)}
                          className={`px-3 h-9 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "bg-foreground text-background border-foreground"
                              : "bg-background border-border hover:border-foreground/30"
                          }`}
                        >
                          {e.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-date">Date</Label>
                    <Input
                      id="p-date"
                      type="date"
                      value={form.eventDate}
                      onChange={(e) => patch("eventDate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-guests">Guests</Label>
                    <Input
                      id="p-guests"
                      type="number"
                      min={1}
                      placeholder="50"
                      value={form.guests}
                      onChange={(e) => patch("guests", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-loc">Location</Label>
                  <Input
                    id="p-loc"
                    placeholder="Austin, TX"
                    value={form.location}
                    onChange={(e) => patch("location", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-vibe">Vibe (one word)</Label>
                  <Input
                    id="p-vibe"
                    placeholder="modern · garden · intimate · festive"
                    value={form.vibe}
                    onChange={(e) => patch("vibe", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-budget">Total budget ($)</Label>
                  <Input
                    id="p-budget"
                    type="number"
                    min={0}
                    placeholder="15000"
                    value={form.budget}
                    onChange={(e) => patch("budget", e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 mt-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Show my plan
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="font-label text-accent tracking-[0.4em] mb-4">
                — YOUR PLAN
              </p>
              <h1 className="font-display text-4xl md:text-5xl leading-tight mb-3">
                Here's where to start.
              </h1>
              <p className="text-base text-foreground/75 leading-relaxed mb-10">
                {form.location ? `${form.location} · ` : ""}
                {form.guests ? `${form.guests} guests · ` : ""}
                {form.budget ? `${formatCents(Number(form.budget) * 100)} budget` : ""}
              </p>

              <div className="rounded-sm border border-border bg-card p-5 mb-6">
                <p className="font-label text-muted-foreground mb-3">
                  Starter checklist
                </p>
                <ol className="space-y-2 list-decimal list-inside marker:text-muted-foreground marker:tnum">
                  {checklist.map((item) => (
                    <li key={item} className="text-sm">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>

              {recommended.length > 0 && (
                <div className="mb-6">
                  <p className="font-label text-muted-foreground mb-3">
                    Vendors to consider
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {recommended.slice(0, 4).map((v) => (
                      <VendorCard key={v.id} vendor={v} />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {user ? (
                  <Link to="/customer/dashboard">
                    <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                      Open my dashboard
                      <ArrowRight className="w-3.5 h-3.5 ml-2" />
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link to="/signup?ref=plan-in-5">
                      <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                        Save my plan
                        <ArrowRight className="w-3.5 h-3.5 ml-2" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStep("form");
                        toast.info("Tweak and re-run");
                      }}
                      className="rounded-full"
                    >
                      Adjust answers
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
