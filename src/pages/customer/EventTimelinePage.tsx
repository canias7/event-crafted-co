import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Trash2,
  Loader2,
  Clock,
  Edit2,
  Download,
  CalendarPlus,
  MapPin,
  Printer,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { EVENT_HUB_TABS } from "@/data/hubTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customerNavItems as navItems } from "@/data/navItems";
import { downloadIcs, slugForFile } from "@/lib/ics";

interface TimelineItem {
  id: string;
  start_time: string;
  duration_minutes: number | null;
  title: string;
  owner_label: string | null;
  vendor_id: string | null;
  location: string | null;
  notes: string | null;
  display_order: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const itemsTable = () => (supabase as any).from("event_timeline_items");

function formatTime(t: string) {
  // t is "HH:MM:SS" or "HH:MM"
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function EventTimelinePage() {
  const { user, activeEvent } = useAuth();
  const eventId = activeEvent?.id ?? null;

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TimelineItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const query = itemsTable()
      .select(
        "id, start_time, duration_minutes, title, owner_label, vendor_id, location, notes, display_order",
      )
      .eq("host_id", user.id)
      .order("start_time", { ascending: true })
      .order("display_order", { ascending: true });

    const { data } = eventId
      ? await query.eq("event_id", eventId)
      : await query.is("event_id", null);

    setItems((data as TimelineItem[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, eventId]);

  async function deleteItem(id: string) {
    setDeletingId(id);
    const { error } = await itemsTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== id));
    toast.success("Item removed");
  }

  function exportTimelineIcs() {
    if (items.length === 0 || !activeEvent?.event_date) {
      toast.error(
        items.length === 0
          ? "Nothing to export yet"
          : "Set an event date first to export",
      );
      return;
    }
    const baseDate = activeEvent.event_date; // YYYY-MM-DD
    const events = items.map((it) => {
      const [h, m] = it.start_time.split(":").map(Number);
      const start = new Date(`${baseDate}T00:00:00`);
      start.setHours(h, m, 0, 0);
      return {
        uid: `timeline-${it.id}@vendora`,
        start,
        durationMinutes: it.duration_minutes ?? 30,
        summary: it.title,
        description:
          [it.owner_label, it.notes].filter(Boolean).join("\n\n") || null,
        location: it.location,
      };
    });
    downloadIcs(
      slugForFile(
        `vendora-event-day-${activeEvent.name ?? activeEvent.event_type ?? "schedule"}`,
      ),
      events,
    );
    toast.success("Timeline exported");
  }

  const totalDuration = useMemo(() => {
    if (items.length === 0) return null;
    const first = items[0].start_time;
    const last = items[items.length - 1];
    const lastMinutes = last.duration_minutes ?? 30;
    const [fh, fm] = first.split(":").map(Number);
    const [lh, lm] = last.start_time.split(":").map(Number);
    const startMin = fh * 60 + fm;
    const endMin = lh * 60 + lm + lastMinutes;
    const totalMin = endMin - startMin;
    if (totalMin <= 0) return null;
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, [items]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display text-xl">Event-day timeline</h1>
              <p className="text-sm text-muted-foreground">
                {items.length === 0
                  ? "Map out the run of show — vendor arrivals, ceremony, dinner, dance"
                  : `${items.length} ${items.length === 1 ? "item" : "items"}${totalDuration ? ` · ${totalDuration} total` : ""}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/customer/live">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={items.length === 0}
                  className="rounded-full print-hide"
                >
                  Live mode
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                disabled={items.length === 0}
                className="rounded-full print-hide"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportTimelineIcs}
                disabled={items.length === 0}
                className="rounded-full print-hide"
                title={
                  !activeEvent?.event_date
                    ? "Set an event date in Event Details first"
                    : undefined
                }
              >
                <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
                Add to calendar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New item
              </Button>
            </div>
          </div>
          <SubNavTabs tabs={EVENT_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">
                No timeline items yet
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Add the run of show — when vendors arrive, when the
                ceremony starts, dinner, dance, exit. Share it as a
                calendar feed your team can subscribe to.
              </p>
              <Button
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add the first item
              </Button>
            </div>
          ) : (
            <ol className="relative">
              <span
                className="absolute left-[68px] top-2 bottom-2 w-px bg-border"
                aria-hidden="true"
              />
              {items.map((it) => (
                <li key={it.id} className="relative pl-24 pb-6">
                  <span className="absolute left-0 top-2 w-[64px] text-xs tnum text-muted-foreground text-right font-medium">
                    {formatTime(it.start_time)}
                  </span>
                  <span
                    className="absolute left-[64px] top-3 w-2 h-2 rounded-full bg-accent ring-4 ring-background"
                    aria-hidden="true"
                  />
                  <div className="rounded-sm border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-display text-base">{it.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                          {it.duration_minutes != null && (
                            <span className="tnum">
                              {it.duration_minutes} min
                            </span>
                          )}
                          {it.owner_label && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {it.owner_label}
                            </span>
                          )}
                          {it.location && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <MapPin className="w-3 h-3" />
                              {it.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(it);
                            setEditorOpen(true);
                          }}
                          aria-label="Edit timeline item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={deletingId === it.id}
                          onClick={() => deleteItem(it.id)}
                          aria-label="Delete timeline item"
                        >
                          {deletingId === it.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {it.notes && (
                      <p className="text-sm text-foreground/80 leading-relaxed border-l-2 border-border pl-3 whitespace-pre-wrap">
                        {it.notes}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <ItemEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          hostId={user.id}
          eventId={eventId}
          editing={editing}
          nextOrder={
            items.reduce((m, p) => Math.max(m, p.display_order), -1) + 1
          }
          onSuccess={load}
        />
      )}
    </div>
  );
}

function ItemEditor({
  open,
  onOpenChange,
  hostId,
  eventId,
  editing,
  nextOrder,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  eventId: string | null;
  editing: TimelineItem | null;
  nextOrder: number;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [duration, setDuration] = useState("");
  const [owner, setOwner] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      // Trim to HH:MM for the input; DB stores HH:MM:SS.
      setStartTime(editing ? editing.start_time.slice(0, 5) : "17:00");
      setDuration(
        editing?.duration_minutes != null
          ? editing.duration_minutes.toString()
          : "",
      );
      setOwner(editing?.owner_label ?? "");
      setLocation(editing?.location ?? "");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startTime) return;
    setSubmitting(true);
    const payload = {
      title: title.trim(),
      start_time: startTime,
      duration_minutes: duration ? Number.parseInt(duration, 10) : null,
      owner_label: owner.trim() || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    };
    const { error } = editing
      ? await itemsTable().update(payload).eq("id", editing.id)
      : await itemsTable().insert({
          ...payload,
          host_id: hostId,
          event_id: eventId,
          display_order: nextOrder,
        });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Item updated" : "Item added");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit timeline item" : "New timeline item"}
          </DialogTitle>
          <DialogDescription>
            Time of day only — the date comes from your active event.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="ti-title">Title</Label>
            <Input
              id="ti-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Florals arrive · Ceremony · First dance"
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ti-time">Start</Label>
              <Input
                id="ti-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ti-dur">Duration (min)</Label>
              <Input
                id="ti-dur"
                type="number"
                min="0"
                step="5"
                placeholder="30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ti-owner">Owner (optional)</Label>
            <Input
              id="ti-owner"
              placeholder="Atelier 47, DJ Marco, Coordinator"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ti-loc">Location (optional)</Label>
            <Input
              id="ti-loc"
              placeholder="Garden, Reception room, Bridal suite"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ti-notes">Notes (optional)</Label>
            <Textarea
              id="ti-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
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
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
