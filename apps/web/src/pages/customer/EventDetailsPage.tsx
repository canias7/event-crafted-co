import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  CalendarPlus,
  Clock,
  MapPin,
  Loader2,
  Sparkles,
  Plus,
  Archive,
  Star,
  Trash2,
} from "lucide-react";
import { downloadIcs, slugForFile } from "@/lib/ics";
import { formatDate } from "@/lib/format";
import { PublishRealEventCard } from "@/components/customer/PublishRealEventCard";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { EVENT_HUB_TABS } from "@/data/hubTabs";
import { customerNavItems as navItems } from "@/data/navItems";

const eventsTable = () => supabase.from("host_events");

type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

const eventTypes: Array<{ value: EventType; label: string }> = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "other", label: "Something else" },
];

const eventTypeLabel: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  holiday_dinner: "Holiday dinner",
  other: "Event",
};

interface EventRow {
  id: string;
  name: string | null;
  event_type: EventType;
  event_date: string | null;
  event_location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  event_notes: string | null;
  archived_at: string | null;
}

export default function EventDetailsPage() {
  const { user, profile, activeEvent, refreshProfile } = useAuth();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Editing the active event
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [eventNotes, setEventNotes] = useState("");

  // Versioned cancel guard — only the latest loadEvents() may setState.
  const loadVersion = useRef(0);

  async function loadEvents() {
    if (!user) return;
    const myVersion = ++loadVersion.current;
    setLoading(true);
    const { data } = await eventsTable()
      .select(
        "id, name, event_type, event_date, event_location, budget_min_cents, budget_max_cents, event_notes, archived_at",
      )
      .eq("host_id", user.id)
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false });
    if (myVersion !== loadVersion.current) return;
    setEvents((data as EventRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
    return () => {
      loadVersion.current = -1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // When the active event changes, sync the form
  useEffect(() => {
    if (!activeEvent) {
      setName("");
      setEventType("wedding");
      setEventDate("");
      setEventLocation("");
      setBudgetMin("");
      setBudgetMax("");
      setEventNotes("");
      return;
    }
    setName(activeEvent.name ?? "");
    setEventType(activeEvent.event_type);
    setEventDate(activeEvent.event_date ?? "");
    setEventLocation(activeEvent.event_location ?? "");
    setBudgetMin(
      activeEvent.budget_min_cents != null
        ? (activeEvent.budget_min_cents / 100).toString()
        : "",
    );
    setBudgetMax(
      activeEvent.budget_max_cents != null
        ? (activeEvent.budget_max_cents / 100).toString()
        : "",
    );
    setEventNotes(activeEvent.event_notes ?? "");
  }, [activeEvent]);

  const eventDateObj = eventDate ? new Date(eventDate) : null;
  const daysUntil = eventDateObj
    ? Math.ceil((eventDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeEvent) return;

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
      name: name.trim() || null,
      event_type: eventType,
      event_date: eventDate || null,
      event_location: eventLocation.trim() || null,
      budget_min_cents: minCents,
      budget_max_cents: maxCents,
      event_notes: eventNotes.trim() || null,
    };
    const { error } = await eventsTable()
      .update(payload)
      .eq("id", activeEvent.id);
    if (!error) {
      // Mirror to legacy profile fields so old code paths keep working.
      // Mirror failure is non-fatal: host_events is the source of truth.
      const { error: mirrorErr } = await supabase
        .from("profiles")
        .update(payload as never)
        .eq("id", user.id);
      if (mirrorErr) {
        console.error("[EventDetails] profile mirror failed", mirrorErr.message);
      }
    }
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event saved");
    await refreshProfile();
    loadEvents();
  }

  async function setActive(eventId: string) {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ active_event_id: eventId } as never)
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Active event switched");
  }

  async function archiveEvent(ev: EventRow) {
    const { error } = await eventsTable()
      .update({ archived_at: new Date().toISOString() })
      .eq("id", ev.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (activeEvent?.id === ev.id) {
      // Pick another non-archived event as active, or null
      const next = events.find((x) => x.id !== ev.id && !x.archived_at);
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ active_event_id: next?.id ?? null } as never)
        .eq("id", user!.id);
      if (profileErr) {
        console.error("[EventDetails] active_event_id swap failed", profileErr.message);
      }
    }
    await refreshProfile();
    loadEvents();
    toast.success("Event archived");
  }

  async function deleteEvent(ev: EventRow) {
    if (!confirm("Delete this event permanently? This can't be undone.")) return;
    const { error } = await eventsTable().delete().eq("id", ev.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (activeEvent?.id === ev.id) {
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ active_event_id: null } as never)
        .eq("id", user!.id);
      if (profileErr) {
        console.error("[EventDetails] active_event_id clear failed", profileErr.message);
      }
    }
    await refreshProfile();
    loadEvents();
    toast.success("Event deleted");
  }

  const showOnboardingPrompt = !loading && events.length === 0;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-editorial text-3xl">Event details</h1>
              <p className="text-sm text-muted-foreground">
                Edit the events you're planning
              </p>
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={!user}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New event
            </Button>
          </div>
          <SubNavTabs tabs={EVENT_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-8">
          {loading ? (
            <Skeleton className="h-96 w-full rounded-sm" />
          ) : showOnboardingPrompt ? (
            <div className="rounded-sm border border-accent/30 bg-accent/5 p-8 text-center">
              <Sparkles className="w-8 h-8 mx-auto text-accent mb-3" />
              <p className="font-editorial text-3xl mb-2">
                No events yet
              </p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">
                {profile?.onboarded_at
                  ? "Create your first event below."
                  : "Walk through onboarding to create your first event."}
              </p>
              {!profile?.onboarded_at && (
                <Button
                  asChild
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Link to="/customer/onboarding">Go to onboarding</Link>
                </Button>
              )}
              {profile?.onboarded_at && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create event
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Event list / switcher */}
              {events.length > 1 && (
                <div className="space-y-2">
                  <p className="font-label text-muted-foreground">
                    All events
                  </p>
                  <div className="space-y-2">
                    {events.map((ev) => {
                      const isActive = activeEvent?.id === ev.id;
                      return (
                        <div
                          key={ev.id}
                          className={`flex items-center gap-3 p-3 rounded-sm border ${
                            isActive
                              ? "border-foreground bg-foreground/5"
                              : "border-border bg-card"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">
                                {ev.name ?? eventTypeLabel[ev.event_type]}
                              </p>
                              {isActive && (
                                <Badge className="bg-accent text-accent-foreground border-accent">
                                  <Star className="w-3 h-3 mr-1 fill-current" />
                                  Active
                                </Badge>
                              )}
                              {ev.archived_at && (
                                <Badge
                                  variant="outline"
                                  className="text-muted-foreground"
                                >
                                  Archived
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground tnum mt-0.5">
                              {eventTypeLabel[ev.event_type]}
                              {ev.event_date && ` · ${ev.event_date}`}
                              {ev.event_location && ` · ${ev.event_location}`}
                            </p>
                          </div>
                          {!isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActive(ev.id)}
                              className="h-7 text-xs rounded-full"
                            >
                              Make active
                            </Button>
                          )}
                          {!ev.archived_at && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => archiveEvent(ev)}
                              aria-label="Archive event"
                              className="h-7 w-7 p-0"
                            >
                              <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteEvent(ev)}
                            aria-label="Delete event"
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeEvent ? (
                <>
                  {/* Summary tiles */}
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
                        {formatDate(eventDate, "short")}
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

                  {eventDate && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const summary =
                            (name?.trim() ||
                              `${eventTypeLabel[eventType]}`) +
                            (eventLocation
                              ? ` — ${eventLocation}`
                              : "");
                          downloadIcs(
                            slugForFile(`vendora-${summary || "event"}`),
                            [
                              {
                                uid: `event-${activeEvent?.id ?? "draft"}@vendora`,
                                start: new Date(`${eventDate}T00:00:00Z`),
                                allDay: true,
                                summary,
                                description:
                                  activeEvent?.event_notes ?? null,
                                location: eventLocation || null,
                              },
                            ],
                          );
                        }}
                        className="rounded-full h-8 text-xs"
                      >
                        <CalendarPlus className="w-3 h-3 mr-1.5" />
                        Add to calendar
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handleSave} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="event-name">
                        Event name (optional)
                      </Label>
                      <Input
                        id="event-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Sarah & James, 40th in Brooklyn, …"
                        className="h-11"
                      />
                    </div>

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
                            onChange={(e) =>
                              setEventLocation(e.target.value)
                            }
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
                        placeholder="Vibe, color palette, must-haves, dealbreakers."
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

                  {/* Publish your event as a real-event SEO page. */}
                  <div className="mt-8">
                    <PublishRealEventCard
                      event={{
                        id: activeEvent.id,
                        name: activeEvent.name,
                        event_type: activeEvent.event_type,
                        event_date: activeEvent.event_date,
                        event_location: activeEvent.event_location,
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="card-soft p-8 text-center">
                  <p className="font-editorial text-3xl mb-2">
                    No active event
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Pick one from the list above or create a new one.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <CreateEventDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          hostId={user.id}
          onSuccess={async () => {
            await refreshProfile();
            loadEvents();
          }}
        />
      )}
    </div>
  );
}

function CreateEventDialog({
  open,
  onOpenChange,
  hostId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  onSuccess: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [eventDate, setEventDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data, error } = await eventsTable()
      .insert({
        host_id: hostId,
        name: name.trim() || null,
        event_type: eventType,
        event_date: eventDate || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setSubmitting(false);
      toast.error(error?.message ?? "Couldn't create");
      return;
    }
    // Make it the active event. Mirror failure is non-fatal — host can
    // pick it from the picker; we just won't auto-select it.
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ active_event_id: data.id } as never)
      .eq("id", hostId);
    if (profileErr) {
      console.error("[CreateEvent] active_event_id set failed", profileErr.message);
    }
    setSubmitting(false);
    setName("");
    setEventDate("");
    setEventType("wedding");
    toast.success("Event created");
    onOpenChange(false);
    await onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            New event
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="new-name">Event name (optional)</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My second wedding 😬"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-type">
              Event type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={eventType}
              onValueChange={(v) => setEventType(v as EventType)}
            >
              <SelectTrigger id="new-type" className="h-10">
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
          <div className="space-y-2">
            <Label htmlFor="new-date">Event date</Label>
            <Input
              id="new-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="h-10"
            />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
