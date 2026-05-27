import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import MuxPlayer from "@mux/mux-player-react";
import {
  Loader2,
  AlertCircle,
  Radio,
  CalendarDays,
  Users,
  PlayCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { useLiveViewerCount } from "@/hooks/useLiveViewerCount";

// Public watch page for a host event's live stream. The URL token is
// the only gate — anyone with the link can watch. State transitions
// driven by Mux webhooks: idle → active/recording → disconnected.
// When disconnected with a finalized recording asset, we keep
// playing from the same playback_id (Mux merges the recording onto
// the live URL automatically). Polled every 10s so the page flips
// from "starts soon" to "live now" without the viewer reloading.

interface StreamCtx {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  event_start_time: string | null;
  mux_playback_id: string;
  status: "idle" | "active" | "recording" | "disconnected" | "disabled";
  started_at: string | null;
  ended_at: string | null;
  has_recording: boolean;
}

interface Recording {
  id: string;
  mux_playback_id: string;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface ReplayCtx {
  id: string;
  event_title: string;
  event_date: string;
  mux_playback_id: string;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}:${String(r).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtWhen(iso: string | null, fallbackIso: string): string {
  return new Date(iso ?? fallbackIso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LiveWatchPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const replayId = searchParams.get("replay");

  const [ctx, setCtx] = useState<StreamCtx | null>(null);
  const [replayCtx, setReplayCtx] = useState<ReplayCtx | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Title prefers the replay's event title when watching a past
  // broadcast, otherwise the live stream's title.
  const headerTitle = replayCtx?.event_title ?? ctx?.event_title;
  useDocumentMeta({
    title: headerTitle ? `${headerTitle} — Live on Vendora` : "Live stream — Vendora",
    description: "Watch this event live on Vendora.",
    type: "website",
  });

  // Fetch the live stream context (always — even when watching a
  // replay, we still need the share_token mapping and to render the
  // "Past broadcasts" list).
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "get_live_stream_by_token",
        { p_token: token },
      );
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCtx(row as StreamCtx);
      setLoading(false);
    }

    load();
    // Poll the live status when there's no specific replay being
    // watched — viewers wait on idle → live transitions. When a
    // replay is selected the asset is immutable so polling adds
    // nothing.
    if (!replayId) {
      timer = setInterval(load, 10_000);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [token, replayId]);

  // Load the specific recording when ?replay=<id> is present.
  useEffect(() => {
    if (!token || !replayId) {
      setReplayCtx(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("get_recording_by_token_and_id", {
        p_token: token,
        p_id: replayId,
      })
      .then(({ data, error }: { data: ReplayCtx[] | null; error: unknown }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) {
          // Bad replay id — fall back to live view. We don't 404 the
          // whole page because the live stream itself is still valid.
          setReplayCtx(null);
          return;
        }
        setReplayCtx(row as ReplayCtx);
      });
    return () => {
      cancelled = true;
    };
  }, [token, replayId]);

  // Past broadcasts list. Refreshes when the live status flips —
  // after a stream ends, Mux finalizes a new asset and a new row
  // shows up in the archive.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("get_live_recordings_by_token", { p_token: token })
      .then(({ data, error }: { data: Recording[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) {
          setRecordings([]);
          return;
        }
        setRecordings(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [token, ctx?.status]);

  // Realtime viewer count — viewer role so the host doesn't see
  // themselves in their own audience. Only meaningful for the live
  // path; we still enable it on replays so a host's own browser tab
  // counts as a viewer when previewing a past stream.
  const viewerCount = useLiveViewerCount(token ?? null, "viewer", true);

  const isReplay = replayCtx !== null;
  const isLiveStatus =
    ctx?.status === "active" || ctx?.status === "recording";
  const isIdle = ctx?.status === "idle";
  const isEnded = ctx?.status === "disconnected" && !ctx.has_recording;
  // Auto-play the latest recording when the live stream has ended
  // and a recording exists, unless the user is explicitly viewing
  // an older replay.
  const showLatestReplay =
    !isReplay && ctx?.status === "disconnected" && ctx.has_recording;

  const otherRecordings = useMemo(
    () =>
      isReplay
        ? recordings.filter((r) => r.id !== replayId)
        : recordings,
    [recordings, replayId, isReplay],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !ctx) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
        <h1 className="font-editorial text-3xl mb-2">Live link not found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This live stream link is invalid or has been removed. Check
          with the host for an updated link.
        </p>
        <Button asChild className="mt-6 rounded-full" variant="outline">
          <Link to="/">Back to Vendora</Link>
        </Button>
      </div>
    );
  }

  const playerSrc = isReplay
    ? replayCtx!.mux_playback_id
    : ctx.mux_playback_id;
  const playerStreamType =
    isReplay || showLatestReplay ? "on-demand" : "live";
  const showPlayer = isLiveStatus || showLatestReplay || isReplay;

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-label text-accent mb-2 inline-flex items-center gap-1.5">
              {isReplay ? (
                <>
                  <Radio className="w-3 h-3" />
                  Replay
                </>
              ) : isLiveStatus ? (
                <>
                  <Radio className="w-3 h-3 animate-pulse" />
                  Live now
                </>
              ) : showLatestReplay ? (
                <>
                  <Radio className="w-3 h-3" />
                  Replay
                </>
              ) : isIdle ? (
                <>
                  <CalendarDays className="w-3 h-3" />
                  Starts soon
                </>
              ) : (
                <>
                  <Radio className="w-3 h-3" />
                  Stream ended
                </>
              )}
            </p>
            <h1 className="font-editorial text-4xl mb-1">
              {headerTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isReplay ? (
                <>
                  Recorded {fmtWhen(replayCtx!.started_at, replayCtx!.ended_at ?? new Date().toISOString())}
                  {replayCtx!.duration_seconds != null
                    ? ` · ${fmtDuration(replayCtx!.duration_seconds)}`
                    : ""}
                </>
              ) : (
                <>
                  {fmtDate(ctx.event_date)}
                  {ctx.event_start_time
                    ? ` · ${ctx.event_start_time.slice(0, 5)}`
                    : ""}
                </>
              )}
            </p>
          </div>
          {/* Viewer count. Suppress on replays — counting viewers of a
              static recording is noise. */}
          {!isReplay && (isLiveStatus || isIdle) ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
              <Users className="w-3.5 h-3.5" />
              {viewerCount === 1 ? "1 watching" : `${viewerCount} watching`}
            </span>
          ) : null}
        </div>

        {/* Player. We render it even when idle/ended so the layout
            doesn't jump; Mux's player shows a poster + state-aware
            messaging on its own when the stream isn't producing
            segments yet. */}
        <div className="rounded-sm overflow-hidden bg-black aspect-video">
          {showPlayer ? (
            <MuxPlayer
              key={playerSrc}
              playbackId={playerSrc}
              streamType={playerStreamType}
              autoPlay={isLiveStatus ? "muted" : false}
              accentColor="#c4541e"
              metadata={{
                video_title: headerTitle ?? "Vendora",
                viewer_user_id: "anon",
              }}
              style={{ width: "100%", height: "100%", aspectRatio: "16 / 9" }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-background/85">
              {isEnded ? (
                <>
                  <p className="font-label uppercase tracking-wider text-xs mb-2">
                    Stream ended
                  </p>
                  <p className="text-sm text-background/60 max-w-xs text-center">
                    This event isn't broadcasting anymore. The host
                    didn't enable a recording.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-label uppercase tracking-wider text-xs mb-2">
                    Waiting for stream
                  </p>
                  <p className="text-sm text-background/60 max-w-xs text-center">
                    The host hasn't started broadcasting yet. This page
                    will switch over automatically when they go live.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Archive of past broadcasts. Always visible if any exist —
            new viewers can catch up on prior live sessions for the
            same event, and a current-replay viewer can hop between
            them. */}
        {otherRecordings.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-editorial text-2xl mb-3">
              {isReplay || showLatestReplay
                ? "Other broadcasts"
                : "Past broadcasts"}
            </h2>
            <div className="space-y-2">
              {otherRecordings.map((r) => (
                <Link
                  key={r.id}
                  to={`/live/${token}?replay=${r.id}`}
                  className="block rounded-sm border border-border bg-card p-3 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PlayCircle className="w-5 h-5 text-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {fmtWhen(r.started_at, r.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDuration(r.duration_seconds)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground mt-8 text-center">
          Powered by Vendora · Anyone with this link can watch
        </p>
      </main>
      <Footer />
    </div>
  );
}
