import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  ArrowLeft,
  ChevronRight,
  MapPin,
  User,
  Pause,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

interface TimelineItem {
  id: string;
  title: string;
  start_time: string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  owner_label: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const itemsTable = () => (supabase as any).from("event_timeline_items");

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function LiveDayPage() {
  const { user, activeEvent } = useAuth();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!user) return;
    const eventId = activeEvent?.id ?? null;
    let cancelled = false;
    setLoading(true);
    const query = itemsTable()
      .select(
        "id, title, start_time, duration_minutes, location, notes, owner_label",
      )
      .eq("host_id", user.id)
      .order("start_time", { ascending: true });
    (eventId ? query.eq("event_id", eventId) : query.is("event_id", null))
      .then(({ data }: { data: TimelineItem[] | null }) => {
        if (cancelled) return;
        setItems(data ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeEvent?.id]);

  // Tick every 30s. Paused mode freezes for screenshot / pre-event review.
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [paused]);

  const { current, next, upcoming } = useMemo(() => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let current: TimelineItem | null = null;
    let next: TimelineItem | null = null;
    const upcoming: TimelineItem[] = [];
    for (const it of items) {
      const startMin = timeToMinutes(it.start_time);
      const endMin = startMin + (it.duration_minutes ?? 30);
      if (nowMin >= startMin && nowMin < endMin) {
        current = it;
      } else if (nowMin < startMin) {
        if (!next) next = it;
        upcoming.push(it);
      }
    }
    return { current, next, upcoming: upcoming.slice(0, 5) };
  }, [items, now]);

  const minutesUntilNext = useMemo(() => {
    if (!next) return null;
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const startMin = timeToMinutes(next.start_time);
    return Math.max(0, startMin - nowMin);
  }, [next, now]);

  return (
    <div className="min-h-screen bg-foreground text-background flex flex-col">
      <div className="px-4 md:px-8 py-4 flex items-center justify-between border-b border-background/10">
        <Link
          to="/customer/timeline"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-background/70 hover:text-background"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Exit live mode
        </Link>
        <p className="text-xs uppercase tracking-[0.3em] text-background/70">
          {now.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
          {" · "}Live
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPaused((p) => !p)}
          className="text-background/70 hover:text-background hover:bg-background/10"
        >
          {paused ? (
            <>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Resume
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 mr-1.5" />
              Pause clock
            </>
          )}
        </Button>
      </div>

      <main className="flex-1 flex items-center justify-center p-6 md:p-12">
        {loading ? (
          <p className="text-background/50">Loading timeline…</p>
        ) : items.length === 0 ? (
          <div className="text-center max-w-md">
            <Clock className="w-12 h-12 mx-auto text-background/30 mb-4" />
            <p className="font-display text-2xl mb-3">No timeline yet</p>
            <p className="text-sm text-background/70 mb-6 leading-relaxed">
              Build your day-of timeline first — Live mode pulls from there.
            </p>
            <Link to="/customer/timeline">
              <Button className="rounded-full bg-background text-foreground hover:bg-background/90">
                Open timeline
              </Button>
            </Link>
          </div>
        ) : current ? (
          <div className="text-center max-w-3xl">
            <p className="font-label text-accent tracking-[0.4em] mb-6">
              — HAPPENING NOW
            </p>
            <h1 className="font-display text-5xl md:text-7xl leading-[1.0] mb-6">
              {current.title}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-background/70 mb-10">
              <span className="tnum">
                {formatTime(current.start_time)}
                {current.duration_minutes
                  ? ` · ${current.duration_minutes} min`
                  : ""}
              </span>
              {current.owner_label && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  {current.owner_label}
                </span>
              )}
              {current.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {current.location}
                </span>
              )}
            </div>
            {current.notes && (
              <p className="text-background/80 max-w-2xl mx-auto leading-relaxed border-l-2 border-accent pl-4 text-left">
                {current.notes}
              </p>
            )}
            {next && (
              <div className="mt-12 pt-8 border-t border-background/10 max-w-md mx-auto">
                <p className="font-label text-background/50 mb-2">Up next</p>
                <p className="font-display text-2xl mb-1">{next.title}</p>
                <p className="text-sm text-background/60 tnum">
                  {formatTime(next.start_time)}
                  {minutesUntilNext != null
                    ? ` · in ${Math.round(minutesUntilNext)} min`
                    : ""}
                </p>
              </div>
            )}
          </div>
        ) : next ? (
          <div className="text-center max-w-3xl">
            <p className="font-label text-accent tracking-[0.4em] mb-6">
              — UP NEXT
            </p>
            <h1 className="font-display text-5xl md:text-7xl leading-[1.0] mb-6">
              {next.title}
            </h1>
            <p className="font-display text-3xl md:text-4xl text-background/70 tnum mb-3">
              in {Math.round(minutesUntilNext ?? 0)} min
            </p>
            <p className="text-background/60 tnum">
              {formatTime(next.start_time)}
              {next.location ? ` · ${next.location}` : ""}
            </p>
          </div>
        ) : (
          <div className="text-center max-w-md">
            <p className="font-label text-accent tracking-[0.4em] mb-4">
              — DAY COMPLETE
            </p>
            <p className="font-display text-3xl md:text-4xl mb-3">
              That's a wrap
            </p>
            <p className="text-sm text-background/70">
              Last item ended. Hope it was a great event.
            </p>
          </div>
        )}
      </main>

      {upcoming.length > 0 && (
        <aside className="border-t border-background/10 px-4 md:px-8 py-4 bg-background/5 backdrop-blur-sm">
          <p className="font-label text-background/50 mb-3 tracking-[0.25em]">
            UPCOMING
          </p>
          <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {upcoming.map((it) => (
              <div
                key={it.id}
                className="shrink-0 min-w-[200px] rounded-sm border border-background/10 px-4 py-3"
              >
                <p className="text-xs text-background/50 tnum mb-1">
                  {formatTime(it.start_time)}
                </p>
                <p className="text-sm font-medium truncate">{it.title}</p>
                {it.location && (
                  <p className="text-xs text-background/60 truncate flex items-center gap-1 mt-0.5">
                    <ChevronRight className="w-3 h-3" />
                    {it.location}
                  </p>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
