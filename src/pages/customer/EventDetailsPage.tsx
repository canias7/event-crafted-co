import { useEffect, useState } from "react";
import { Calendar, Clock, MapPin, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { customerNavItems as navItems } from "@/data/navItems";

type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

const eventTypes: Array<{ value: EventType; label: string }> = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "other", label: "Something else" },
];

const eventTypeLabel: Record<string, string> = {
  wedding: "wedding",
  birthday: "birthday",
  holiday_dinner: "holiday dinner",
  other: "event",
};

export default function EventDetailsPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [eventType, setEventType] = useState<EventType>("wedding");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [eventNotes, setEventNotes] = useState("");

  useEffect(() => {
    if (!profile) return;
    setEventType((profile.event_type ?? "wedding") as EventType);
    setEventDate(profile.event_date ?? "");
    setEventLocation(profile.event_location ?? "");
    setBudgetMin(
      profile.budget_min_cents != null
        ? (profile.budget_min_cents / 100).toString()
        : "",
    );
    setBudgetMax(
      profile.budget_max_cents != null
        ? (profile.budget_max_cents / 100).toString()
        : "",
    );
    setEventNotes(profile.event_notes ?? "");
    setLoading(false);
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

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

    setSaving(true);
    const payload = {
      event_type: eventType,
      event_date: eventDate || null,
      event_location: eventLocation.trim() || null,
      budget_min_cents: minCents,
      budget_max_cents: maxCents,
      event_notes: eventNotes.trim() || null,
      onboarded_at:
        profile?.onboarded_at ?? new Date().toISOString(),
    };

    const { error } = await supabase
      .from("profiles")
      // Generated types don't yet include host event columns from earlier
      // migrations.
      .update(payload as never)
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event details saved");
  }

  const eventDateObj = eventDate ? new Date(eventDate) : null;
  const daysUntil = eventDateObj
    ? Math.ceil((eventDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Event details</h1>
          <p className="text-sm text-muted-foreground">
            Edit the event you're planning
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-6">
          {loading ? (
            <Skeleton className="h-96 w-full rounded-sm" />
          ) : (
            <>
              {/* Event summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border border-border rounded-sm p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    <p className="font-label">Type</p>
                  </div>
                  <p className="font-display text-lg capitalize">
                    {eventTypeLabel[eventType]}
                  </p>
                </div>
                <div className="bg-card border border-border rounded-sm p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <p className="font-label">Date</p>
                  </div>
                  <p className="font-display text-lg tnum">
                    {eventDate
                      ? new Date(eventDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
                <div className="bg-card border border-border rounded-sm p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    <p className="font-label">Days out</p>
                  </div>
                  <p className="font-display text-lg tnum">
                    {daysUntil != null && daysUntil >= 0 ? daysUntil : "—"}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="event-type">
                    Event type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={eventType}
                    onValueChange={(v) => setEventType(v as EventType)}
                  >
                    <SelectTrigger id="event-type" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        id="event-location"
                        value={eventLocation}
                        onChange={(e) => setEventLocation(e.target.value)}
                        placeholder="City, neighborhood, or venue"
                        className="h-11 pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Budget range</Label>
                  <div className="grid grid-cols-2 gap-3">
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
                  <Label htmlFor="event-notes">Notes</Label>
                  <Textarea
                    id="event-notes"
                    value={eventNotes}
                    onChange={(e) => setEventNotes(e.target.value)}
                    rows={5}
                    placeholder="Vibe, color palette, must-haves, dealbreakers — anything that helps vendors understand your event."
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    {saving && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save changes
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
