// Tiny mic button that records a voice clip via MediaRecorder and
// hands it back as a File the parent can queue into pendingFiles.
//
// While recording, swaps in a Stop button + live timer + a Cancel
// X. Caps at 30 seconds, then auto-stops. Picks the first MIME the
// browser will give us — webm/opus on Chrome/Firefox, mp4/aac on
// Safari.

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const MAX_SECONDS = 30;

const PREFERRED_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of PREFERRED_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // some implementations throw on unknown types
    }
  }
  return undefined;
}

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({
  disabled,
  onRecorded,
}: {
  disabled?: boolean;
  onRecorded: (file: File) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop any active stream so the mic LED
      // doesn't linger if the user navigates away mid-recording.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  async function start() {
    if (recording) return;
    const mime = pickMime();
    if (!mime) {
      toast.error("Voice recording isn't supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecording(false);
        setElapsed(0);
        if (cancelledRef.current) {
          chunksRef.current = [];
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        if (blob.size === 0) {
          toast.error("No audio captured");
          return;
        }
        const ts = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const file = new File([blob], `voice-${ts}.${extFor(mime)}`, {
          type: mime,
        });
        onRecorded(file);
      };
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed((s) => {
          const next = s + 1;
          if (next >= MAX_SECONDS) {
            // Hit the cap — stop, clamp, and kill the interval.
            // onstop usually fires fast enough to clear the timer
            // itself, but Safari has been observed delaying it,
            // letting the counter tick past MAX_SECONDS. Belt-and-
            // braces: clear here too.
            try {
              recorderRef.current?.stop();
            } catch {
              // already stopped
            }
            if (timerRef.current) {
              window.clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return MAX_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't access mic";
      toast.error(msg);
    }
  }

  function stop() {
    if (!recorderRef.current) return;
    cancelledRef.current = false;
    try {
      recorderRef.current.stop();
    } catch {
      // already stopped
    }
  }

  function cancel() {
    if (!recorderRef.current) return;
    cancelledRef.current = true;
    try {
      recorderRef.current.stop();
    } catch {
      // already stopped
    }
  }

  if (!recording) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={start}
        disabled={disabled}
        aria-label="Record voice message"
        className="h-9 w-9"
      >
        <Mic className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 h-9 rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
      <span
        aria-hidden
        className="w-2 h-2 rounded-full bg-destructive animate-pulse"
      />
      <span className="text-xs font-medium tnum">{fmt(elapsed)}</span>
      <button
        type="button"
        onClick={stop}
        aria-label="Stop recording"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-destructive-foreground hover:opacity-90"
      >
        <Square className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancel recording"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-destructive/20"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
