import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

interface Props {
  src: string;
  filename: string;
}

// Decorative bar pattern. Real waveform analysis via Web Audio API +
// AnalyserNode is overkill for a chat bubble — the cue users actually
// read is the progress fill, not the audio's true amplitude. 28 bars
// at hand-picked heights give the WhatsApp/Signal look without
// downloading the full file just to compute peaks.
const BAR_HEIGHTS = [
  0.4, 0.7, 0.5, 0.9, 0.3, 0.6, 0.8, 0.4, 0.7, 0.5, 0.9, 0.6, 0.3, 0.8,
  0.5, 0.7, 0.4, 0.6, 0.9, 0.5, 0.3, 0.7, 0.8, 0.4, 0.6, 0.9, 0.5, 0.7,
];

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioBubble({ src, filename }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const isUsableDuration = (d: number) =>
      Number.isFinite(d) && d > 0;
    const onTime = () => {
      setCurrentTime(el.currentTime);
      setProgress(isUsableDuration(el.duration) ? el.currentTime / el.duration : 0);
    };
    const onDur = () => {
      // MediaRecorder webm/opus blobs ship without a duration header
      // — el.duration reports Infinity until the playhead reaches the
      // end. Force the browser to compute it by seeking to a huge
      // time; the seek clamps to the real end and a durationchange
      // event fires with the actual length. Then we seek back to 0.
      if (!isUsableDuration(el.duration)) {
        const onProbeDur = () => {
          if (isUsableDuration(el.duration)) {
            setDuration(el.duration);
            el.removeEventListener("durationchange", onProbeDur);
            try { el.currentTime = 0; } catch { /* ignore */ }
          }
        };
        el.addEventListener("durationchange", onProbeDur);
        try {
          el.currentTime = 1e101;
        } catch {
          // some browsers throw on out-of-range seeks; ignore — the
          // probe is best-effort. The seek bar may still show 0% but
          // playback still works.
        }
      } else {
        setDuration(el.duration);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onDur);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onDur);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !el.duration || !Number.isFinite(el.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width),
    );
    el.currentTime = pct * el.duration;
  }

  // Arrow keys jump 5s left/right, Home/End to ends. Native sliders
  // give this for free; we're rolling our own so we have to wire it.
  function onSliderKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !el.duration || !Number.isFinite(el.duration)) return;
    const STEP = 5;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(el.duration, el.currentTime + STEP);
    else if (e.key === "ArrowLeft") next = Math.max(0, el.currentTime - STEP);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = el.duration;
    if (next !== null) {
      e.preventDefault();
      el.currentTime = next;
    }
  }

  // Show elapsed while playing or after first interaction; otherwise
  // show total duration so the user knows how long the clip is before
  // hitting play.
  const shownTime = playing || currentTime > 0 ? currentTime : duration;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-full bg-white/55 backdrop-blur-md border border-white/65 shadow-sm w-[280px] max-w-full">
      <audio ref={audioRef} src={src} preload="metadata" aria-label={filename} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-colors"
      >
        {playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" aria-hidden />
        )}
      </button>
      <div
        role="slider"
        aria-label="Seek audio"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        onClick={seek}
        onKeyDown={onSliderKey}
        className="flex items-center gap-[2px] h-7 flex-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 rounded-full"
      >
        {BAR_HEIGHTS.map((h, i) => {
          const barProgress = i / BAR_HEIGHTS.length;
          const active = barProgress < progress;
          return (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${
                active ? "bg-foreground" : "bg-foreground/25"
              }`}
              style={{ height: `${Math.round(h * 24)}px` }}
              aria-hidden
            />
          );
        })}
      </div>
      <span className="text-[11px] tnum text-muted-foreground shrink-0 min-w-[34px] text-right">
        {fmtTime(shownTime)}
      </span>
    </div>
  );
}
