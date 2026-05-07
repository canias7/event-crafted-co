import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarDays,
  MapPin,
  Gift,
  Sparkles,
  ExternalLink,
  Heart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { transformedImageUrl } from "@/lib/storage";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { MicrositeRsvpForm } from "@/components/microsite/MicrositeRsvpForm";
import { ReportButton } from "@/components/trust/ReportButton";
import { Skeleton } from "@/components/ui/skeleton";

interface MicrositeData {
  event: {
    id: string;
    name: string | null;
    event_type: string;
    event_date: string | null;
    event_location: string | null;
    microsite_title: string | null;
    microsite_subtitle: string | null;
    microsite_story: string | null;
    microsite_cover_path: string | null;
    microsite_theme: string;
    microsite_show_rsvp: boolean;
    host_name: string;
  };
  schedule: Array<{
    id: string;
    title: string;
    notes: string | null;
    start_time: string;
    duration_minutes: number | null;
    location: string | null;
  }>;
  registry: Array<{
    id: string;
    label: string;
    provider: string;
    url: string;
    description: string | null;
  }>;
  gifts: Array<{
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    target_cents: number | null;
    share_token: string;
    pledged_cents: number;
  }>;
  photos: Array<{
    id: string;
    storage_path: string;
    caption: string | null;
  }>;
}

const BUCKET = "event-microsites";

const EVENT_DEFAULTS: Record<string, { title: string; subtitle: string }> = {
  wedding: { title: "Our wedding", subtitle: "is almost here" },
  birthday: { title: "A milestone birthday", subtitle: "is coming up" },
  holiday_dinner: { title: "Our holiday gathering", subtitle: "is around the corner" },
  other: { title: "Our event", subtitle: "is almost here" },
};

// Theme palettes — applied as CSS variables on the page root. Each is
// HSL components (hue saturation% lightness%) so we compose with hsl()
// at consume time. Adding a new theme here also needs a row in the
// THEMES picker in MicrositeEditorPage.tsx.
//
// Dark themes (midnight, starlit, evergreen at twilight) flip the
// `isDarkTheme` branch below so the OS color-scheme follows.
const THEMES: Record<
  string,
  { bg: string; surface: string; accent: string; muted: string; ink: string }
> = {
  // — Romantic / wedding-leaning —
  classic: {
    bg: "0 0% 99%",
    surface: "30 10% 97%",
    accent: "30 35% 45%",
    muted: "30 10% 88%",
    ink: "20 10% 12%",
  },
  rose: {
    bg: "350 30% 98%",
    surface: "350 25% 96%",
    accent: "350 50% 50%",
    muted: "350 15% 88%",
    ink: "350 30% 18%",
  },
  ivory: {
    bg: "35 60% 98%",
    surface: "350 30% 96%",
    accent: "20 60% 55%",
    muted: "30 25% 90%",
    ink: "20 25% 22%",
  },
  garden: {
    bg: "100 30% 98%",
    surface: "120 20% 96%",
    accent: "140 40% 35%",
    muted: "120 15% 88%",
    ink: "140 30% 18%",
  },
  sage: {
    bg: "140 18% 97%",
    surface: "140 15% 95%",
    accent: "150 30% 38%",
    muted: "140 10% 88%",
    ink: "150 25% 15%",
  },
  champagne: {
    bg: "40 35% 97%",
    surface: "40 25% 94%",
    accent: "35 55% 50%",
    muted: "40 15% 88%",
    ink: "30 30% 18%",
  },
  // — Evening / formal —
  dusk: {
    bg: "260 20% 98%",
    surface: "260 18% 96%",
    accent: "270 40% 50%",
    muted: "260 15% 88%",
    ink: "260 30% 18%",
  },
  midnight: {
    bg: "220 15% 8%",
    surface: "220 15% 12%",
    accent: "215 70% 60%",
    muted: "220 12% 22%",
    ink: "220 15% 92%",
  },
  starlit: {
    bg: "230 30% 6%",
    surface: "230 25% 12%",
    accent: "40 75% 60%",
    muted: "230 20% 22%",
    ink: "40 25% 92%",
  },
  // — Festive / birthday / casual —
  confetti: {
    bg: "330 50% 98%",
    surface: "320 40% 96%",
    accent: "320 70% 55%",
    muted: "300 25% 90%",
    ink: "310 40% 22%",
  },
  sunset: {
    bg: "30 50% 98%",
    surface: "20 40% 95%",
    accent: "15 75% 55%",
    muted: "20 25% 90%",
    ink: "15 40% 22%",
  },
  // — Holiday / winter —
  evergreen: {
    bg: "150 25% 96%",
    surface: "150 20% 92%",
    accent: "0 60% 35%",
    muted: "150 15% 86%",
    ink: "150 35% 14%",
  },
  // — Baby shower / soft pastels —
  powder: {
    bg: "210 50% 98%",
    surface: "210 35% 96%",
    accent: "200 50% 55%",
    muted: "210 25% 90%",
    ink: "210 35% 25%",
  },
  // — Corporate / minimal —
  monochrome: {
    bg: "0 0% 100%",
    surface: "0 0% 96%",
    accent: "0 0% 12%",
    muted: "0 0% 88%",
    ink: "0 0% 8%",
  },
};

function publicUrl(
  path: string,
  opts?: { width?: number; quality?: number },
) {
  return transformedImageUrl(BUCKET, path, opts);
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

function fmtTime(t: string | null | undefined) {
  // t is like "14:30:00"; render as 2:30 PM. Supabase may return null
  // for an unset start_time, so guard before splitting.
  if (!t) return "";
  const parts = t.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventMicrositePage() {
  const { token } = useParams();
  const [data, setData] = useState<MicrositeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "get_microsite_by_token",
        { p_token: token },
      );
      if (cancelled) return;
      if (error || !result) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(result as MicrositeData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Tick once a minute so the countdown stays accurate.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = useMemo(() => {
    const dateStr = data?.event.event_date;
    if (!dateStr) return null;
    const target = new Date(`${dateStr}T00:00:00`).getTime();
    const diff = target - now;
    if (diff <= 0) return null;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return { days, hours };
  }, [data, now]);

  useDocumentMeta({
    title: data
      ? `${data.event.microsite_title ?? data.event.host_name}'s event`
      : "Event microsite — Vendora",
    description:
      data?.event.microsite_story?.slice(0, 160) ??
      "An event hosted on Vendora.",
    image: data?.event.microsite_cover_path
      ? publicUrl(data.event.microsite_cover_path, { width: 1200 })
      : undefined,
    type: "article",
  });

  if (notFound) return <Navigate to="/" replace />;

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-background">
        <section className="h-[60vh]">
          <Skeleton className="w-full h-full rounded-none" />
        </section>
        <div className="container mx-auto px-6 py-12 max-w-3xl space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const ev = data.event;
  const defaults = EVENT_DEFAULTS[ev.event_type] ?? EVENT_DEFAULTS.other;
  const title = ev.microsite_title ?? defaults.title;
  const subtitle = ev.microsite_subtitle ?? defaults.subtitle;
  const theme = THEMES[ev.microsite_theme] ?? THEMES.classic;
  const isDarkTheme =
    ev.microsite_theme === "midnight" || ev.microsite_theme === "starlit";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={
        {
          // Theme-scoped CSS variables. Don't leak into the rest of the
          // shell (Footer respects its own tokens).
          "--ms-bg": theme.bg,
          "--ms-surface": theme.surface,
          "--ms-accent": theme.accent,
          "--ms-muted": theme.muted,
          "--ms-ink": theme.ink,
          backgroundColor: `hsl(${theme.bg})`,
          color: `hsl(${theme.ink})`,
        } as React.CSSProperties
      }
    >
      {/* Hero */}
      <section className="relative h-[80svh] min-h-[560px] w-full overflow-hidden">
        {ev.microsite_cover_path ? (
          <img
            src={publicUrl(ev.microsite_cover_path, { width: 1600 })}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(160deg, hsl(${theme.accent} / 0.5), hsl(${theme.ink} / 0.85))`,
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, hsl(${theme.ink} / 0.45), hsl(${theme.ink} / 0.2), hsl(${theme.bg}))`,
          }}
        />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-xs uppercase tracking-[0.4em] mb-5"
            style={{ color: `hsl(${theme.bg})` }}
          >
            {ev.event_date
              ? new Date(`${ev.event_date}T00:00:00`).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" },
                )
              : "Save the date"}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-display text-5xl md:text-7xl leading-[1.0] mb-4"
            style={{ color: `hsl(${theme.bg})` }}
          >
            {title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg md:text-2xl italic font-light max-w-2xl"
            style={{ color: `hsl(${theme.bg} / 0.85)` }}
          >
            {subtitle}
          </motion.p>
          {countdown && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 inline-flex items-baseline gap-3 text-sm uppercase tracking-[0.3em]"
              style={{ color: `hsl(${theme.bg} / 0.85)` }}
            >
              <span className="font-display text-4xl tnum">
                {countdown.days}
              </span>
              <span>days</span>
              <span className="font-display text-4xl tnum ml-3">
                {countdown.hours}
              </span>
              <span>hours</span>
            </motion.div>
          )}
        </div>
      </section>

      {/* Story */}
      {ev.microsite_story && (
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-6 max-w-2xl text-center">
            <p
              className="text-xs uppercase tracking-[0.4em] mb-5"
              style={{ color: `hsl(${theme.accent})` }}
            >
              — The story
            </p>
            <div
              className="text-base md:text-lg leading-relaxed whitespace-pre-line"
              style={{ color: `hsl(${theme.ink} / 0.85)` }}
            >
              {ev.microsite_story}
            </div>
          </div>
        </section>
      )}

      {/* Schedule */}
      {data.schedule.length > 0 && (
        <Section
          eyebrow="Schedule"
          title="Run of show"
          theme={theme}
        >
          <ol className="space-y-4 max-w-xl mx-auto">
            {data.schedule.map((s) => (
              <li
                key={s.id}
                className="rounded-sm p-5 flex items-start gap-4"
                style={{
                  backgroundColor: `hsl(${theme.surface})`,
                  border: `1px solid hsl(${theme.muted})`,
                }}
              >
                <div className="shrink-0 w-20">
                  <p className="font-display text-lg tnum">
                    {fmtTime(s.start_time)}
                  </p>
                  {s.duration_minutes && (
                    <p
                      className="text-[10px] uppercase tracking-wide tnum"
                      style={{ color: `hsl(${theme.ink} / 0.55)` }}
                    >
                      {s.duration_minutes} min
                    </p>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg leading-tight">
                    {s.title}
                  </p>
                  {s.location && (
                    <p
                      className="text-xs flex items-center gap-1 mt-1"
                      style={{ color: `hsl(${theme.ink} / 0.65)` }}
                    >
                      <MapPin className="w-3 h-3" />
                      {s.location}
                    </p>
                  )}
                  {s.notes && (
                    <p
                      className="text-sm leading-relaxed mt-2"
                      style={{ color: `hsl(${theme.ink} / 0.75)` }}
                    >
                      {s.notes}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* RSVP form */}
      {ev.microsite_show_rsvp && token && (
        <Section
          eyebrow="RSVP"
          title="We'd love to know"
          theme={theme}
        >
          <MicrositeRsvpForm
            token={token}
            hostName={ev.host_name}
            theme={theme}
          />
        </Section>
      )}

      {/* Group gifts */}
      {data.gifts.length > 0 && (
        <Section
          eyebrow="Gifts"
          title="Pool together"
          theme={theme}
        >
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {data.gifts.map((g) => {
              const target = g.target_cents ?? 0;
              const pct = target > 0 ? Math.min(100, (g.pledged_cents / target) * 100) : 0;
              return (
                <a
                  key={g.id}
                  href={`/gift/${g.share_token}`}
                  className="rounded-sm p-5 hover:shadow-md transition-shadow group"
                  style={{
                    backgroundColor: `hsl(${theme.surface})`,
                    border: `1px solid hsl(${theme.muted})`,
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    {g.image_url ? (
                      <img
                        src={g.image_url}
                        alt=""
                        className="w-14 h-14 rounded-sm object-cover bg-muted shrink-0"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-sm flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `hsl(${theme.muted})` }}
                      >
                        <Sparkles className="w-5 h-5" style={{ color: `hsl(${theme.accent})` }} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-display text-base leading-tight">{g.title}</p>
                      {g.description && (
                        <p
                          className="text-xs leading-relaxed mt-1 line-clamp-2"
                          style={{ color: `hsl(${theme.ink} / 0.7)` }}
                        >
                          {g.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {target > 0 ? (
                    <>
                      <div
                        className="h-1 rounded-full overflow-hidden mb-2"
                        style={{ backgroundColor: `hsl(${theme.muted})` }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: `hsl(${theme.accent})`,
                          }}
                        />
                      </div>
                      <p
                        className="text-xs tnum flex items-center justify-between"
                        style={{ color: `hsl(${theme.ink} / 0.7)` }}
                      >
                        <span>
                          {fmtMoney(g.pledged_cents)} of {fmtMoney(target)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide flex items-center gap-1 group-hover:underline">
                          Contribute
                          <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      </p>
                    </>
                  ) : (
                    <p
                      className="text-xs flex items-center justify-between"
                      style={{ color: `hsl(${theme.ink} / 0.7)` }}
                    >
                      <span>Open contribution</span>
                      <span className="text-[10px] uppercase tracking-wide flex items-center gap-1 group-hover:underline">
                        Contribute
                        <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </p>
                  )}
                </a>
              );
            })}
          </div>
        </Section>
      )}

      {/* Registry */}
      {data.registry.length > 0 && (
        <Section
          eyebrow="Registry"
          title="Wishlist"
          theme={theme}
        >
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {data.registry.map((r) => (
              <a
                key={r.id}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm p-4 hover:shadow-md transition-shadow group flex items-start gap-3"
                style={{
                  backgroundColor: `hsl(${theme.surface})`,
                  border: `1px solid hsl(${theme.muted})`,
                }}
              >
                <Gift
                  className="w-4 h-4 mt-1 shrink-0"
                  style={{ color: `hsl(${theme.accent})` }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base group-hover:underline">
                    {r.label}
                  </p>
                  <p
                    className="text-xs uppercase tracking-wide mt-0.5"
                    style={{ color: `hsl(${theme.ink} / 0.55)` }}
                  >
                    {r.provider}
                  </p>
                  {r.description && (
                    <p
                      className="text-xs leading-relaxed mt-1.5 line-clamp-2"
                      style={{ color: `hsl(${theme.ink} / 0.75)` }}
                    >
                      {r.description}
                    </p>
                  )}
                </div>
                <ExternalLink
                  className="w-3 h-3 mt-1.5 shrink-0 opacity-50 group-hover:opacity-100"
                  style={{ color: `hsl(${theme.ink})` }}
                />
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Photo gallery */}
      {data.photos.length > 0 && (
        <Section
          eyebrow="Gallery"
          title="A few moments"
          theme={theme}
          wide
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.photos.map((p, i) => (
              <div
                key={p.id}
                className={`overflow-hidden rounded-sm ${
                  i % 7 === 0 ? "col-span-2 row-span-2 aspect-[4/3]" : "aspect-square"
                }`}
                style={{ backgroundColor: `hsl(${theme.muted})` }}
              >
                <img
                  src={publicUrl(p.storage_path, { width: 800 })}
                  alt={p.caption ?? ""}
                  loading={i < 4 ? "eager" : "lazy"}
                  className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700"
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Event details footer card */}
      <section className="py-12 md:py-16">
        <div
          className="container mx-auto px-6 max-w-xl rounded-sm p-8 text-center"
          style={{
            backgroundColor: `hsl(${theme.surface})`,
            border: `1px solid hsl(${theme.muted})`,
          }}
        >
          {ev.event_date && (
            <p className="flex items-center justify-center gap-2 mb-2 text-sm">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>
                {new Date(`${ev.event_date}T00:00:00`).toLocaleDateString(
                  undefined,
                  { weekday: "long", month: "long", day: "numeric", year: "numeric" },
                )}
              </span>
            </p>
          )}
          {ev.event_location && (
            <p className="flex items-center justify-center gap-2 text-sm">
              <MapPin className="w-3.5 h-3.5" />
              <span>{ev.event_location}</span>
            </p>
          )}
        </div>
      </section>

      {/* Footer "powered by" */}
      <footer
        className="py-8 text-center text-xs"
        style={{ color: `hsl(${theme.ink} / 0.5)` }}
      >
        <p className="flex items-center justify-center gap-1.5">
          Made with
          <Heart
            className="w-3 h-3 fill-current"
            style={{ color: `hsl(${theme.accent})` }}
          />
          on
          <a
            href="/"
            className="font-display hover:underline"
            style={{ color: `hsl(${theme.ink} / 0.85)` }}
          >
            Vendora
          </a>
        </p>
        <div className="mt-3">
          <ReportButton
            contentType="microsite"
            contentId={ev.id}
            variant="link"
            size="sm"
          />
        </div>
      </footer>

      {/* Reset to default theme for the Footer (if we ever decide to render it). */}
      {isDarkTheme && (
        <style
          dangerouslySetInnerHTML={{
            __html: ":root { color-scheme: light; }",
          }}
        />
      )}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  theme,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  theme: (typeof THEMES)[string];
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className="py-16 md:py-20">
      <div className={`container mx-auto px-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="text-center mb-10">
          <p
            className="text-xs uppercase tracking-[0.4em] mb-4"
            style={{ color: `hsl(${theme.accent})` }}
          >
            — {eyebrow}
          </p>
          <h2 className="font-display text-3xl md:text-4xl">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}
