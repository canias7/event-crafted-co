// Public RSVP page. Anyone with the share token URL lands here, sees
// the event detail (title, date, time, location, notes), and submits
// a name + optional email + going/maybe/not-going. No auth required.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Calendar as CalendarIcon, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface EventDetail {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  going_count: number;
  maybe_count: number;
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTimeRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start ?? end!);
}

export default function PublicEventRsvpPage() {
  const { token } = useParams<{ token: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"going" | "maybe" | "not_going">("going");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "get_event_by_share_token",
        { p_token: token },
      );
      if (cancelled) return;
      const row = (data as EventDetail[] | null)?.[0] ?? null;
      if (error || !row) {
        setNotFound(true);
      } else {
        setEvent(row);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!name.trim()) {
      toast.error("Please add your name");
      return;
    }
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("submit_event_rsvp", {
      p_token: token,
      p_name: name.trim(),
      p_email: email.trim() || null,
      p_status: status,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmitted(true);
    // Refresh counts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("get_event_by_share_token", {
      p_token: token,
    });
    const row = (data as EventDetail[] | null)?.[0] ?? null;
    if (row) setEvent(row);
  }

  if (loading) {
    return (
      <div className="min-h-screen public-canvas flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen public-canvas flex items-center justify-center p-6">
        <div
          className="rounded-2xl p-10 text-center max-w-md w-full"
          style={{
            background: "rgba(255,253,250,0.7)",
            border: "0.5px solid rgba(255,138,76,0.2)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <p className="font-label text-muted-foreground mb-2">404</p>
          <h1 className="font-editorial text-3xl mb-2">Event not found</h1>
          <p className="text-sm text-muted-foreground">
            This invite link may have been removed or mistyped.
          </p>
        </div>
      </div>
    );
  }

  const timeLabel = fmtTimeRange(event.start_time, event.end_time);

  return (
    <div className="min-h-screen public-canvas">
      <div className="max-w-xl mx-auto px-5 py-10 md:py-16">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <CalendarIcon className="w-3.5 h-3.5" />
            You're invited
          </span>
          <h1 className="font-editorial text-4xl md:text-5xl mt-2">
            {event.title}
          </h1>
        </div>

        <div
          className="rounded-3xl p-6 md:p-8 mb-6"
          style={{
            background: "rgba(255,253,250,0.75)",
            border: "0.5px solid rgba(255,138,76,0.22)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <p className="font-editorial text-2xl">{fmtDate(event.event_date)}</p>
          {timeLabel ? (
            <p className="mt-1 text-sm text-muted-foreground">{timeLabel}</p>
          ) : null}
          {event.location ? (
            <p className="mt-3 text-sm inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              {event.location}
            </p>
          ) : null}
          {event.notes ? (
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">
              {event.notes}
            </p>
          ) : null}
          <div className="mt-5 pt-5 border-t border-foreground/10 flex items-center gap-6 text-sm">
            <div>
              <span className="font-editorial text-2xl tnum">
                {event.going_count}
              </span>
              <span className="ml-1.5 text-muted-foreground">going</span>
            </div>
            {event.maybe_count > 0 ? (
              <div>
                <span className="font-editorial text-2xl tnum">
                  {event.maybe_count}
                </span>
                <span className="ml-1.5 text-muted-foreground">maybe</span>
              </div>
            ) : null}
          </div>
        </div>

        {submitted ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background: "rgba(255,138,76,0.08)",
              border: "0.5px solid rgba(255,138,76,0.32)",
            }}
          >
            <p className="font-editorial italic text-2xl">Thanks for RSVPing.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The host will see your response on their events page.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="rsvp-name"
                className="block text-[11px] uppercase tracking-[1.5px] mb-1.5 opacity-65 font-medium"
              >
                Your name
              </label>
              <input
                id="rsvp-name"
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="First + last"
              />
            </div>
            <div>
              <label
                htmlFor="rsvp-email"
                className="block text-[11px] uppercase tracking-[1.5px] mb-1.5 opacity-65 font-medium"
              >
                Email (optional)
              </label>
              <input
                id="rsvp-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[1.5px] mb-2 opacity-65 font-medium">
                Are you going?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["going", "maybe", "not_going"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    aria-pressed={status === s}
                    className={`rounded-full py-2.5 text-sm font-medium transition ${
                      status === s
                        ? "bg-foreground text-background"
                        : "bg-white/60 text-foreground hover:bg-white/80"
                    }`}
                    style={
                      status === s
                        ? undefined
                        : { border: "0.5px solid rgba(0,0,0,0.15)" }
                    }
                  >
                    {s === "going" ? "Going" : s === "maybe" ? "Maybe" : "Can't make it"}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="auth-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send RSVP"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
