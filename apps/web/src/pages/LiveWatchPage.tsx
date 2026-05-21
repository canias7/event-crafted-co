import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import MuxPlayer from "@mux/mux-player-react";
import { Loader2, AlertCircle, Radio, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

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

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function LiveWatchPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState<StreamCtx | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useDocumentMeta({
    title: ctx ? `${ctx.event_title} — Live on Vendora` : "Live stream — Vendora",
    description: "Watch this event live on Vendora.",
    type: "website",
  });

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
    // Poll for status updates. 10s is plenty — the webhook flips the
    // DB within a couple seconds of Mux's signal. Realtime would be
    // cleaner but adds a websocket slot for what's a viewer surface.
    timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [token]);

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

  const isLive = ctx.status === "active" || ctx.status === "recording";
  const isReplay = ctx.status === "disconnected" && ctx.has_recording;
  const isEnded = ctx.status === "disconnected" && !ctx.has_recording;
  const isIdle = ctx.status === "idle";

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <p className="font-label text-accent mb-2 inline-flex items-center gap-1.5">
            {isLive ? (
              <>
                <Radio className="w-3 h-3 animate-pulse" />
                Live now
              </>
            ) : isReplay ? (
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
          <h1 className="font-editorial text-4xl mb-1">{ctx.event_title}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(ctx.event_date)}
            {ctx.event_start_time
              ? ` · ${ctx.event_start_time.slice(0, 5)}`
              : ""}
          </p>
        </div>

        {/* Player. We render it even when idle/ended so the layout
            doesn't jump; Mux's player shows a poster + state-aware
            messaging on its own when the stream isn't producing
            segments yet. */}
        <div className="rounded-sm overflow-hidden bg-black aspect-video">
          {isLive || isReplay ? (
            <MuxPlayer
              playbackId={ctx.mux_playback_id}
              streamType={isReplay ? "on-demand" : "live"}
              autoPlay={isLive ? "muted" : false}
              accentColor="#c4541e"
              metadata={{
                video_title: ctx.event_title,
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

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Powered by Vendora · Anyone with this link can watch
        </p>
      </main>
      <Footer />
    </div>
  );
}
