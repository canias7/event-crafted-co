import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, PlayCircle, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Archive of finalized recordings for a single host event live stream.
// Each row is one past broadcast. The "Watch" button opens the public
// watch page with `?replay=<recording_id>` so the viewer plays that
// specific asset; copy share link uses the same URL.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareToken: string | null;
  eventTitle: string;
}

interface Recording {
  id: string;
  mux_playback_id: string;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
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
  const target = iso ?? fallbackIso;
  return new Date(target).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LiveArchiveDialog({
  open,
  onOpenChange,
  shareToken,
  eventTitle,
}: Props) {
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !shareToken) {
      setRecordings(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("get_live_recordings_by_token", { p_token: shareToken })
      .then(({ data, error }: { data: Recording[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Couldn't load past broadcasts");
          setRecordings([]);
          return;
        }
        setRecordings(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [open, shareToken]);

  function replayUrl(recordingId: string): string {
    return `${window.location.origin}/live/${shareToken}?replay=${recordingId}`;
  }

  async function copyReplayLink(recordingId: string) {
    try {
      await navigator.clipboard.writeText(replayUrl(recordingId));
      setCopiedId(recordingId);
      toast.success("Replay link copied");
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl flex items-center gap-2">
            <Radio className="w-5 h-5 text-accent" />
            Past broadcasts
          </DialogTitle>
          <DialogDescription>
            Replays from {eventTitle}. Anyone with a replay link can watch.
          </DialogDescription>
        </DialogHeader>

        {recordings === null ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : recordings.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No past broadcasts yet. Once you end a live stream, the
            recording shows up here.
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {recordings.map((r) => (
              <div
                key={r.id}
                className="rounded-sm border border-border bg-card p-3 flex items-center gap-3"
              >
                <PlayCircle className="w-5 h-5 text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {fmtWhen(r.started_at, r.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDuration(r.duration_seconds)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyReplayLink(r.id)}
                  className="rounded-full shrink-0"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  {copiedId === r.id ? "Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => window.open(replayUrl(r.id), "_blank")}
                  className="rounded-full shrink-0 bg-foreground text-background hover:bg-foreground/90"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Watch
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
