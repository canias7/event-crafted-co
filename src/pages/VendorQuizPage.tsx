import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Calendar,
  Camera,
  Flower2,
  Music,
  UtensilsCrossed,
  Cake,
  MapPin,
  Brush,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

const EVENT_TYPES: Array<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "wedding", label: "Wedding", hint: "Ceremony + reception" },
  { value: "engagement", label: "Engagement", hint: "Cocktail party · 30–100 guests" },
  { value: "birthday", label: "Milestone birthday", hint: "30th, 40th, 50th, 60th…" },
  { value: "anniversary", label: "Anniversary", hint: "Intimate dinner · 10–40 guests" },
  { value: "baby_shower", label: "Baby shower", hint: "Daytime · 20–50 guests" },
  { value: "holiday_dinner", label: "Holiday dinner", hint: "Family-hosted, served + styled" },
  { value: "other", label: "Something else", hint: "" },
];

const VENDOR_CATEGORIES: Array<{
  value: string;
  label: string;
  Icon: typeof Camera;
}> = [
  { value: "Photographer", label: "Photographer", Icon: Camera },
  { value: "Florist", label: "Florist", Icon: Flower2 },
  { value: "Catering", label: "Catering", Icon: UtensilsCrossed },
  { value: "DJ", label: "DJ / Music", Icon: Music },
  { value: "Venue", label: "Venue", Icon: MapPin },
  { value: "Baker", label: "Baker", Icon: Cake },
  { value: "Makeup Artist", label: "Hair + Makeup", Icon: Brush },
  { value: "Decorator", label: "Decor + Styling", Icon: Palette },
];

const BUDGETS: Array<{ value: string; label: string; max: number | null }> = [
  { value: "under-2k", label: "Under $2k", max: 2000 },
  { value: "2-5k", label: "$2k – $5k", max: 5000 },
  { value: "5-10k", label: "$5k – $10k", max: 10000 },
  { value: "10-25k", label: "$10k – $25k", max: 25000 },
  { value: "25k-plus", label: "$25k+", max: null },
  { value: "unsure", label: "Not sure yet", max: null },
];

export default function VendorQuizPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  useDocumentMeta({
    title: "Find your vendors — Vendora",
    description:
      "Take a 60-second quiz and we'll match you with the right vendors for your event.",
  });

  // Make sure browser back button doesn't trap mid-quiz.
  useEffect(() => {
    if (step !== 1) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const TOTAL_STEPS = 5;

  function next() {
    if (step < TOTAL_STEPS) setStep(step + 1);
  }
  function back() {
    if (step > 1) setStep(step - 1);
  }

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function finish() {
    // Single-category filter on /vendors (the page only supports one
    // category at a time today). If they picked multiple, take the first
    // and persist the rest in sessionStorage so we can light up the chip
    // row pre-checked once multi-category lands.
    const params = new URLSearchParams();
    if (categories[0]) params.set("category", categories[0]);
    if (location.trim()) params.set("location", location.trim());

    if (categories.length > 1 || eventDate || budget || eventType) {
      sessionStorage.setItem(
        "vendora-quiz-answers",
        JSON.stringify({
          eventType,
          eventDate,
          budget,
          location: location.trim(),
          categories,
        }),
      );
    }

    const qs = params.toString();
    navigate(qs ? `/vendors?${qs}` : "/vendors");
  }

  function canAdvance() {
    if (step === 1) return !!eventType;
    if (step === 2) return true; // date is optional
    if (step === 3) return !!budget;
    if (step === 4) return categories.length > 0;
    if (step === 5) return true; // location is optional
    return false;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-8">
            <Sparkles className="w-4 h-4 text-accent" />
            <p className="font-label text-accent tracking-[0.3em]">
              — VENDOR MATCH
            </p>
            <span className="ml-auto text-xs text-muted-foreground tnum">
              Step {step} of {TOTAL_STEPS}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-secondary rounded-full mb-10 overflow-hidden">
            <motion.div
              className="h-full bg-foreground"
              initial={false}
              animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              transition={spring}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={spring}
            >
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
                      What are you planning?
                    </h1>
                    <p className="text-muted-foreground">
                      Pick the closest match — we'll tailor the directory
                      based on your answer.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {EVENT_TYPES.map((t) => {
                      const active = eventType === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setEventType(t.value)}
                          className={`text-left p-4 rounded-sm border transition-colors ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card hover:border-foreground/30"
                          }`}
                        >
                          <p className="font-display text-base mb-1">
                            {t.label}
                          </p>
                          {t.hint && (
                            <p
                              className={`text-xs leading-relaxed ${
                                active
                                  ? "text-background/70"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {t.hint}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
                      When's the event?
                    </h1>
                    <p className="text-muted-foreground">
                      Optional — helps us hide vendors who are already booked
                      that day.
                    </p>
                  </div>
                  <div className="space-y-2 max-w-xs">
                    <Label htmlFor="quiz-date">Event date</Label>
                    <Input
                      id="quiz-date"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEventDate("");
                      next();
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Skip — I don't have a date yet
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
                      What's your budget range?
                    </h1>
                    <p className="text-muted-foreground">
                      Total spend across all vendors. We'll filter pricing
                      packages to match.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {BUDGETS.map((b) => {
                      const active = budget === b.value;
                      return (
                        <button
                          key={b.value}
                          type="button"
                          onClick={() => setBudget(b.value)}
                          className={`p-4 rounded-sm border transition-colors text-left ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card hover:border-foreground/30"
                          }`}
                        >
                          <p className="font-display text-base">{b.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
                      Who do you need?
                    </h1>
                    <p className="text-muted-foreground">
                      Pick everything you're shopping for. We'll start you on
                      the first one.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {VENDOR_CATEGORIES.map((c) => {
                      const active = categories.includes(c.value);
                      const Icon = c.Icon;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => toggleCategory(c.value)}
                          className={`relative flex flex-col items-center gap-2 p-4 rounded-sm border transition-colors ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card hover:border-foreground/30"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs font-medium text-center">
                            {c.label}
                          </span>
                          {active && (
                            <Check className="absolute top-2 right-2 w-3 h-3" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {categories.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {categories.length} selected · we'll start with{" "}
                      <strong>{categories[0]}</strong>
                    </p>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
                      Where's the event?
                    </h1>
                    <p className="text-muted-foreground">
                      Optional — narrows the directory to vendors in your
                      area. Leave blank to see everyone.
                    </p>
                  </div>
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="quiz-loc">City</Label>
                    <Input
                      id="quiz-loc"
                      placeholder="Brooklyn, NY"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div className="rounded-sm bg-secondary/50 p-4 text-sm">
                    <p className="font-medium mb-2">Your match:</p>
                    <ul className="space-y-1 text-muted-foreground text-xs">
                      <li>
                        <span className="text-foreground">Event:</span>{" "}
                        {EVENT_TYPES.find((t) => t.value === eventType)
                          ?.label ?? "—"}
                      </li>
                      <li>
                        <span className="text-foreground">Date:</span>{" "}
                        {eventDate
                          ? new Date(eventDate).toLocaleDateString()
                          : "Not set"}
                      </li>
                      <li>
                        <span className="text-foreground">Budget:</span>{" "}
                        {BUDGETS.find((b) => b.value === budget)?.label ?? "—"}
                      </li>
                      <li>
                        <span className="text-foreground">Looking for:</span>{" "}
                        {categories.length > 0 ? categories.join(", ") : "—"}
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Nav */}
          <div className="flex items-center justify-between mt-10">
            {step > 1 ? (
              <Button
                variant="ghost"
                onClick={back}
                className="rounded-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            ) : (
              <Link
                to="/vendors"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Skip the quiz
              </Link>
            )}

            {step < TOTAL_STEPS ? (
              <Button
                onClick={next}
                disabled={!canAdvance()}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={finish}
                disabled={!canAdvance()}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                Show my vendors
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
