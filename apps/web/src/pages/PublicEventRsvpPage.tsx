// Public RSVP page. Anyone with the share token URL lands here, sees
// the event detail (title, date, time, location, notes), and submits
// a name + optional email + going/maybe/not-going. No auth required.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

// `locale` is undefined in English (the browser's default, as before)
// and "es-US" in Spanish.
function fmtDate(ymd: string, locale: string | undefined): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTimeRange(
  start: string | null,
  end: string | null,
  locale: string | undefined,
): string | null {
  if (!start && !end) return null;
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start ?? end!);
}

export default function PublicEventRsvpPage() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation("rsvp");
  const dateLocale = i18n.resolvedLanguage === "es" ? "es-US" : undefined;
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
      toast.error(t("errors.nameRequired"));
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
      // English shows the server's message as before; Spanish shows a
      // friendly line instead of the raw (English) database error.
      toast.error(t("errors.submit", { message: error.message }));
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
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
          }}
        >
          <p className="font-label text-muted-foreground mb-2">404</p>
          <h1 className="font-editorial text-3xl mb-2">{t("notFound.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("notFound.body")}
          </p>
        </div>
      </div>
    );
  }

  const timeLabel = fmtTimeRange(event.start_time, event.end_time, dateLocale);

  return (
    <div className="min-h-screen public-canvas">
      <div className="max-w-xl mx-auto px-5 py-10 md:py-16">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <CalendarIcon className="w-3.5 h-3.5" />
            {t("invited")}
          </span>
          <h1 className="font-editorial text-4xl md:text-5xl mt-2">
            {event.title}
          </h1>
        </div>

        <div
          className="rounded-2xl p-6 md:p-8 mb-6"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
          }}
        >
          <p className="font-editorial text-2xl">{fmtDate(event.event_date, dateLocale)}</p>
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
          <div className="mt-5 pt-5 border-t border-border flex items-center gap-6 text-sm">
            <div>
              <span className="font-editorial text-2xl tnum">
                {event.going_count}
              </span>
              <span className="ml-1.5 text-muted-foreground">
                {t("counts.going", { count: event.going_count })}
              </span>
            </div>
            {event.maybe_count > 0 ? (
              <div>
                <span className="font-editorial text-2xl tnum">
                  {event.maybe_count}
                </span>
                <span className="ml-1.5 text-muted-foreground">
                  {t("counts.maybe", { count: event.maybe_count })}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {submitted ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background: "rgba(0,0,0,0.08)",
              border: "0.5px solid rgba(0,0,0,0.32)",
            }}
          >
            <p className="font-editorial text-2xl">{t("thanks.title")}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("thanks.body")}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="rsvp-name"
                className="block text-[11px] uppercase tracking-[1.5px] mb-1.5 opacity-65 font-medium"
              >
                {t("form.name")}
              </label>
              <input
                id="rsvp-name"
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder={t("form.namePlaceholder")}
              />
            </div>
            <div>
              <label
                htmlFor="rsvp-email"
                className="block text-[11px] uppercase tracking-[1.5px] mb-1.5 opacity-65 font-medium"
              >
                {t("form.email")}
              </label>
              <input
                id="rsvp-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("form.emailPlaceholder")}
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[1.5px] mb-2 opacity-65 font-medium">
                {t("form.question")}
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
                        : "bg-white border border-border text-foreground hover:bg-muted"
                    }`}
                    style={
                      status === s
                        ? undefined
                        : { border: "0.5px solid rgba(0,0,0,0.15)" }
                    }
                  >
                    {t(`form.choices.${s}`)}
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
                  {t("form.sending")}
                </>
              ) : (
                t("form.submit")
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
