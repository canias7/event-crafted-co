import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, MapPin, Loader2, Check, X, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import heroImg from "@/assets/vendora-hero-cinematic.jpg";

interface GuestInfo {
  id: string;
  name: string;
  plus_one_allowed: boolean;
  rsvp_status: "attending" | "declined" | "maybe" | null;
  rsvp_plus_one: boolean | null;
  rsvp_dietary: string | null;
  rsvp_message: string | null;
  host_name: string | null;
  event_type: string | null;
  event_date: string | null;
  event_location: string | null;
}

const eventTypeLabel: Record<string, string> = {
  wedding: "wedding",
  birthday: "birthday",
  holiday_dinner: "holiday dinner",
  other: "event",
};

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function RsvpPage() {
  const { token } = useParams();
  const [guest, setGuest] = useState<GuestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState<"attending" | "declined" | "maybe" | "">(
    "",
  );
  const [plusOne, setPlusOne] = useState(false);
  const [dietary, setDietary] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .rpc("get_guest_by_token", { p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        const rows = data as GuestInfo[] | null;
        if (error || !rows || rows.length === 0) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const g = rows[0];
        setGuest(g);
        setStatus(g.rsvp_status ?? "");
        setPlusOne(g.rsvp_plus_one ?? false);
        setDietary(g.rsvp_dietary ?? "");
        setMessage(g.rsvp_message ?? "");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!status) {
      toast.error("Please choose attending, declined, or maybe");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_rsvp", {
      p_token: token,
      p_status: status,
      p_plus_one: plusOne,
      p_dietary: dietary,
      p_message: message,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "Couldn't submit");
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Cinematic hero */}
      <section className="relative h-[44svh] min-h-[320px] w-full overflow-hidden">
        <img
          src={heroImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/45 to-background" />
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />
        <div className="relative z-10 h-full flex items-end pb-12 md:pb-16">
          <div className="container mx-auto px-6 md:px-8">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 }}
              className="font-label text-accent tracking-[0.4em] mb-5"
            >
              — YOU'RE INVITED
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.3, duration: 0.9 }}
              className="text-hero font-display text-background leading-[1.0] max-w-3xl"
            >
              {guest && !loading ? (
                <>
                  Hello,{" "}
                  <span className="italic font-light text-accent">
                    {guest.name}.
                  </span>
                </>
              ) : (
                "RSVP"
              )}
            </motion.h1>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          {loading ? (
            <div className="space-y-4">
              <div className="h-8 bg-muted rounded-sm animate-pulse" />
              <div className="h-32 bg-muted rounded-sm animate-pulse" />
            </div>
          ) : notFound ? (
            <div className="text-center py-16">
              <p className="font-display text-2xl mb-2">
                Invitation not found
              </p>
              <p className="text-sm text-muted-foreground">
                Double-check the link, or ask your host for a new one.
              </p>
            </div>
          ) : submitted ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 mx-auto rounded-full bg-accent text-accent-foreground flex items-center justify-center mb-5">
                <Check className="w-5 h-5" />
              </div>
              <p className="font-display text-2xl mb-2">Got it.</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Your response has been sent to{" "}
                {guest?.host_name ?? "your host"}. They'll be thrilled.
                You can come back to this link any time to update.
              </p>
            </div>
          ) : guest ? (
            <>
              {/* Event card */}
              <div className="bg-card border border-border rounded-sm p-6 mb-8">
                <p className="font-label text-accent mb-2">
                  {guest.host_name ?? "Your host"} invites you to a
                </p>
                <p className="font-display text-2xl mb-4 capitalize">
                  {eventTypeLabel[guest.event_type ?? "other"] ?? "event"}
                </p>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  {guest.event_date && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="tnum">
                        {new Date(guest.event_date).toLocaleDateString(undefined, {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  {guest.event_location && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      {guest.event_location}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <p className="font-display text-xl mb-3">Will you be there?</p>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {[
                      {
                        value: "attending" as const,
                        label: "Attending",
                        icon: Check,
                      },
                      {
                        value: "maybe" as const,
                        label: "Maybe",
                        icon: HelpCircle,
                      },
                      {
                        value: "declined" as const,
                        label: "Can't make it",
                        icon: X,
                      },
                    ].map((opt) => {
                      const selected = status === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setStatus(opt.value)}
                          className={`flex items-center justify-center gap-2 rounded-sm border p-4 transition-colors ${
                            selected
                              ? "border-foreground bg-foreground/5"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          <opt.icon className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {status === "attending" && guest.plus_one_allowed && (
                  <label className="flex items-center gap-3 p-4 rounded-sm border border-border cursor-pointer hover:border-foreground/30 transition-colors">
                    <Input
                      type="checkbox"
                      checked={plusOne}
                      onChange={(e) => setPlusOne(e.target.checked)}
                      className="w-4 h-4 mr-1"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        Bringing a plus-one
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Your host has reserved space for a +1.
                      </p>
                    </div>
                  </label>
                )}

                {status === "attending" && (
                  <div className="space-y-2">
                    <Label htmlFor="dietary">Dietary notes</Label>
                    <Input
                      id="dietary"
                      value={dietary}
                      onChange={(e) => setDietary(e.target.value)}
                      placeholder="Vegetarian, gluten-free, allergies, …"
                      className="h-11"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="message">Note for your host (optional)</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder="A song request, a favorite memory, anything you'd like to say…"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting || !status}
                  className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : guest.rsvp_status ? (
                    "Update response"
                  ) : (
                    "Send RSVP"
                  )}
                </Button>
              </form>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
