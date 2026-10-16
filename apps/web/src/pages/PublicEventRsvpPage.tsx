// Public RSVP page. Anyone with the share token URL lands here, sees
// the event detail (title, date, time, location, notes) and replies.
// No sign-in. The host customizes it (owner's call, Oct 2026): one of
// three looks (classic ivory, evening dark, a full cover photo), a cover
// photo and welcome message, plus-ones, a meal choice, dietary needs, a
// song request, up to 5 questions of their own, a reply-by date, a guest
// limit and whether guests see the counts. The host also picks the
// colours, the lettering and the decoration (lib/inviteDesign.ts).

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { siteLocaleOr } from "@/lib/intlLocale";
import { Clock, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readInvitePayload, type PublicInvite } from "@/lib/invitations";
import { bodyStyle, designVars, headingStyle, loadInviteFonts, onAccent, readDesign } from "@/lib/inviteDesign";
import { InviteHeader } from "@/components/invite/InviteHeader";


// `locale` is undefined in English (the browser's default, as before),
// "es-US" in Spanish and "ru-RU" in Russian.
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
  const { t } = useTranslation("rsvp");
  const dateLocale = siteLocaleOr(undefined);
  const [event, setEvent] = useState<PublicInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"going" | "maybe" | "not_going">("going");
  const [plusOnes, setPlusOnes] = useState(0);
  const [meal, setMeal] = useState<string | null>(null);
  const [dietary, setDietary] = useState("");
  const [song, setSong] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function fetchInvite() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_event_by_share_token", {
      p_token: token,
    });
    return error ? null : readInvitePayload(data);
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const row = await fetchInvite();
      if (cancelled) return;
      if (!row) setNotFound(true);
      else {
        setEvent(row);
        loadInviteFonts([readDesign(row.invite_design, row.invite_style).font]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !event) return;
    if (!name.trim()) {
      toast.error(t("errors.nameRequired"));
      return;
    }
    const going = status === "going";
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("submit_event_rsvp", {
      p_token: token,
      p_name: name.trim(),
      p_email: email.trim() || null,
      p_status: status,
      p_plus_ones: going ? plusOnes : 0,
      p_meal_choice: going ? meal : null,
      p_dietary: going && event.ask_dietary ? dietary.trim() || null : null,
      p_song_request: going && event.ask_song ? song.trim() || null : null,
      p_answers: answers,
    });
    setSubmitting(false);
    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("rsvp_full")) toast.error(t("errors.full"));
      else if (msg.includes("rsvp_closed")) toast.error(t("errors.closed"));
      else toast.error(t("errors.submit", { message: msg }));
      return;
    }
    setSubmitted(true);
    const row = await fetchInvite();
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
        <div className="rounded-2xl p-10 text-center max-w-md w-full bg-card border border-border">
          <p className="font-label text-muted-foreground mb-2">404</p>
          <h1 className="font-editorial text-3xl mb-2">{t("notFound.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("notFound.body")}</p>
        </div>
      </div>
    );
  }

  const timeLabel = fmtTimeRange(event.start_time, event.end_time, dateLocale);
  // The host picks the look, so it doesn't follow the visitor's light/dark
  // switch: the design's colours are set as the page's own variables.
  const design = readDesign(event.invite_design, event.invite_style);
  const photoHero = event.invite_style === "photo" && !!event.invite_cover_url;
  const going = status === "going";
  const full = event.spots_left === 0;
  const labelCls = "block text-sm font-bold mb-1.5";
  const titleFont = headingStyle(design);

  return (
    <div className="min-h-screen text-foreground" style={{ ...designVars(design), ...bodyStyle(design) }}>
      {photoHero ? (
        <InviteHeader
          design={design}
          title={event.title}
          invitedLabel={t("invited")}
          coverUrl={event.invite_cover_url}
          photo
          message={event.invite_message}
        />
      ) : null}

      <div className="max-w-xl mx-auto px-5 py-10 md:py-16">
        {!photoHero ? (
          <div className="mb-8">
            <InviteHeader
              design={design}
              title={event.title}
              invitedLabel={t("invited")}
              coverUrl={event.invite_cover_url}
              photo={false}
              message={event.invite_message}
            />
          </div>
        ) : null}

        <div className="rounded-2xl p-6 md:p-8 mb-6 bg-card border border-border">
          <p className="text-2xl" style={titleFont}>{capFirstWord(fmtDate(event.event_date, dateLocale))}</p>
          {timeLabel ? <p className="mt-1 text-sm">{timeLabel}</p> : null}
          {event.location ? (
            <p className="mt-3 text-sm inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 shrink-0" />
              {event.location}
            </p>
          ) : null}
          {event.notes ? (
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">{event.notes}</p>
          ) : null}
          {event.show_counts && event.going_count != null ? (
            <div className="mt-5 pt-5 border-t border-border flex items-center gap-6 text-sm">
              <div>
                <span className="text-2xl tnum" style={titleFont}>{event.going_count}</span>
                <span className="ml-1.5">{t("counts.going", { count: event.going_count })}</span>
              </div>
              {(event.maybe_count ?? 0) > 0 ? (
                <div>
                  <span className="text-2xl tnum" style={titleFont}>{event.maybe_count}</span>
                  <span className="ml-1.5">{t("counts.maybe", { count: event.maybe_count ?? 0 })}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {event.rsvp_deadline && !event.closed ? (
            <p className="mt-4 text-sm font-bold text-accent inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {t("replyBy", { date: fmtDate(event.rsvp_deadline, dateLocale) })}
            </p>
          ) : null}
          {event.spots_left != null && event.spots_left > 0 && !event.closed ? (
            <p className="mt-2 text-sm">{t("spotsLeft", { count: event.spots_left })}</p>
          ) : null}
        </div>

        {submitted ? (
          <div className="rounded-2xl p-6 text-center bg-card border border-border">
            <p className="text-2xl" style={titleFont}>{t("thanks.title")}</p>
            <p className="mt-2 text-sm">{t("thanks.body")}</p>
          </div>
        ) : event.closed ? (
          <div className="rounded-2xl p-6 text-center bg-card border border-border">
            <p className="text-2xl" style={titleFont}>{t("closed.title")}</p>
            <p className="mt-2 text-sm">{t("closed.body")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="rsvp-name" className={labelCls}>{t("form.name")}</label>
              <Input
                id="rsvp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                placeholder={t("form.namePlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="rsvp-email" className={labelCls}>{t("form.email")}</label>
              <Input
                id="rsvp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("form.emailPlaceholder")}
              />
            </div>
            <div>
              <p className={labelCls}>{t("form.question")}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["going", "maybe", "not_going"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    aria-pressed={status === s}
                    className={`rounded-full min-h-11 px-2 py-2 text-sm font-bold transition ${
                      status === s
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border text-foreground hover:text-accent"
                    }`}
                  >
                    {t(`form.choices.${s}`)}
                  </button>
                ))}
              </div>
              {going && full ? (
                <p className="mt-2 text-sm text-destructive">{t("errors.full")}</p>
              ) : null}
            </div>

            {going && event.plus_ones_max > 0 ? (
              <div>
                <label htmlFor="rsvp-plus" className={labelCls}>{t("form.plusOnes")}</label>
                <select
                  id="rsvp-plus"
                  value={plusOnes}
                  onChange={(e) => setPlusOnes(Number(e.target.value))}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                >
                  {Array.from({ length: event.plus_ones_max + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n === 0 ? t("form.justMe") : t("form.plusN", { count: n })}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {going && event.meal_options.length > 0 ? (
              <div>
                <p className={labelCls}>{t("form.meal")}</p>
                <div className="flex flex-wrap gap-2">
                  {event.meal_options.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMeal(meal === m ? null : m)}
                      aria-pressed={meal === m}
                      className={`rounded-full h-9 px-4 text-sm font-bold transition ${
                        meal === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border text-foreground hover:text-accent"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {going && event.ask_dietary ? (
              <div>
                <label htmlFor="rsvp-diet" className={labelCls}>{t("form.dietary")}</label>
                <Input
                  id="rsvp-diet"
                  value={dietary}
                  maxLength={300}
                  onChange={(e) => setDietary(e.target.value)}
                  placeholder={t("form.dietaryPlaceholder")}
                />
              </div>
            ) : null}

            {going && event.ask_song ? (
              <div>
                <label htmlFor="rsvp-song" className={labelCls}>{t("form.song")}</label>
                <Input
                  id="rsvp-song"
                  value={song}
                  maxLength={200}
                  onChange={(e) => setSong(e.target.value)}
                  placeholder={t("form.songPlaceholder")}
                />
              </div>
            ) : null}

            {event.questions.map((q) => (
              <div key={q.id}>
                <label htmlFor={`rsvp-q-${q.id}`} className={labelCls}>{q.label}</label>
                <Textarea
                  id={`rsvp-q-${q.id}`}
                  rows={2}
                  maxLength={500}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={submitting || (going && full)}
              className="w-full h-[52px] rounded-full bg-gold font-bold hover:bg-gold-hover disabled:bg-gold-muted inline-flex items-center justify-center gap-2 transition-colors"
              style={{ color: onAccent(design) }}
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

// Spanish and Russian weekday names are lowercase; the date line starts
// with a capital.
function capFirstWord(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
