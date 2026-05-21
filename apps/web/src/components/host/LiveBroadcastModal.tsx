import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Radio,
  Copy,
  Check,
  Video,
  VideoOff,
  Mic,
  MicOff,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
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

// Browser-based live broadcaster for a host event. Two paths:
//
//   1. In-browser WHIP push — captures the host's camera+mic and
//      pushes WebRTC to Mux's WHIP endpoint. One click, no install.
//      Works in Chrome, Edge, Safari (16+), Firefox.
//
//   2. External encoder — host runs OBS / Larix / Streamlabs on the
//      side. We show the RTMP URL + stream_key and they paste them
//      in. Better quality, more control, but more setup.
//
// Both push to the same Mux Live Stream resource. Viewers see the
// share URL with the unguessable token. After the host ends the
// broadcast, Mux's webhook flips the row to disconnected and the
// recording asset gets attached for replay.
//
// Mux WHIP endpoint (per Mux docs):
//   POST https://global-live.mux.com/whip
//   Authorization: Bearer <stream_key>
//   Content-Type: application/sdp
//   Body: <SDP offer>
//
// Response: 201 with SDP answer + Location header to DELETE on stop.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
}

interface StreamCreds {
  stream_id: string;
  stream_key: string;
  playback_id: string;
  share_token: string;
  share_url: string;
  ingest_url: string;
  status: string;
}

const WHIP_ENDPOINT = "https://global-live.mux.com/whip";

export function LiveBroadcastModal({
  open,
  onOpenChange,
  eventId,
  eventTitle,
}: Props) {
  const [creds, setCreds] = useState<StreamCreds | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"setup" | "connecting" | "live" | "ended">(
    "setup",
  );
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [streamKeyVisible, setStreamKeyVisible] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  // refs so the cleanup callback sees current values without a re-
  // render dependency loop.
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resourceUrlRef = useRef<string | null>(null);

  // Provision stream credentials when the modal opens. Idempotent on
  // the backend — calling twice for the same event_id returns the
  // existing stream.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.functions
      .invoke("mux-create-live-stream", { body: { event_id: eventId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setError(error.message ?? "Couldn't create live stream");
          return;
        }
        setCreds(data as StreamCreds);
      });
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  // Clean up the RTCPeerConnection + camera/mic + Mux resource when
  // the modal closes or the component unmounts.
  const cleanup = useCallback(async () => {
    if (resourceUrlRef.current) {
      try {
        await fetch(resourceUrlRef.current, { method: "DELETE" });
      } catch {
        // Best-effort. Mux will eventually clean up the session via
        // the reconnect window if the DELETE fails.
      }
      resourceUrlRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase("setup");
      setCreds(null);
      setError(null);
    }
    return () => {
      cleanup();
    };
  }, [open, cleanup]);

  async function goLive() {
    if (!creds || phase !== "setup") return;
    setPhase("connecting");
    setError(null);

    try {
      // 1. Capture camera + mic. Prefer 720p; users on weaker
      //    hardware fall back to the browser's default constraints.
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });
      streamRef.current = media;
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }

      // 2. Negotiate WHIP with Mux.
      const pc = new RTCPeerConnection({
        // Stun is fine for the encoder side; Mux handles TURN.
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      // Add tracks BEFORE creating the offer so the SDP advertises
      // the right transceivers. Sets sendonly direction explicitly.
      for (const track of media.getTracks()) {
        pc.addTransceiver(track, { direction: "sendonly", streams: [media] });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering so the offer SDP carries candidates.
      // Mux's WHIP path expects a complete SDP; trickle ICE isn't
      // supported on most WHIP servers yet.
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
        // Hard timeout — some networks never reach "complete" because
        // no STUN reply comes back. After 3s we send what we have.
        setTimeout(() => {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }, 3000);
      });

      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("Failed to assemble SDP offer");

      const res = await fetch(WHIP_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Authorization: `Bearer ${creds.stream_key}`,
        },
        body: sdp,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Mux WHIP rejected (${res.status}): ${errText}`);
      }

      // The Location header points at this session's resource URL —
      // we DELETE it on stop.
      const location = res.headers.get("Location");
      if (location) {
        // Mux returns a relative URL; resolve against the WHIP host.
        resourceUrlRef.current = new URL(location, WHIP_ENDPOINT).toString();
      }
      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setPhase("live");
    } catch (err) {
      console.error("[LiveBroadcastModal] goLive failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes("Permission")
          ? "Camera and microphone permission was denied. Allow access and try again."
          : msg,
      );
      setPhase("setup");
      cleanup();
    }
  }

  async function stopLive() {
    await cleanup();
    setPhase("ended");
  }

  function toggleMute() {
    const audio = streamRef.current?.getAudioTracks()[0];
    if (!audio) return;
    audio.enabled = !audio.enabled;
    setMuted(!audio.enabled);
  }
  function toggleVideo() {
    const video = streamRef.current?.getVideoTracks()[0];
    if (!video) return;
    video.enabled = !video.enabled;
    setVideoOff(!video.enabled);
  }

  async function copyShareUrl() {
    if (!creds) return;
    await navigator.clipboard.writeText(creds.share_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Share link copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl flex items-center gap-2">
            <Radio
              className={`w-5 h-5 ${phase === "live" ? "text-destructive animate-pulse" : "text-accent"}`}
            />
            {phase === "live" ? "You're live" : "Go live"}
          </DialogTitle>
          <DialogDescription>
            Broadcast {eventTitle} to anyone with the share link. The
            recording will be saved automatically for replay.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && creds && (
          <div className="space-y-4">
            {/* Local video preview. Shows once getUserMedia has fired
                — before that, the <video> element has nothing to
                paint. We render it always so the layout doesn't shift
                between setup and live phases. */}
            <div className="rounded-sm overflow-hidden bg-black aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
            </div>

            {phase === "live" && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleMute}
                  className="rounded-full"
                >
                  {muted ? (
                    <>
                      <MicOff className="w-3.5 h-3.5 mr-1.5" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 mr-1.5" />
                      Mute
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleVideo}
                  className="rounded-full"
                >
                  {videoOff ? (
                    <>
                      <VideoOff className="w-3.5 h-3.5 mr-1.5" />
                      Camera on
                    </>
                  ) : (
                    <>
                      <Video className="w-3.5 h-3.5 mr-1.5" />
                      Camera off
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={stopLive}
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  End stream
                </Button>
              </div>
            )}

            {/* Share URL — visible in every phase except "ended" so
                hosts can copy it before going live (to text friends
                during setup) and during the broadcast (for late
                arrivals). */}
            {phase !== "ended" && (
              <div className="rounded-sm border border-border bg-card p-3">
                <p className="font-label text-muted-foreground text-xs mb-1.5">
                  Share this link with anyone you want to watch
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-secondary/40 rounded px-2 py-1.5 flex-1 truncate">
                    {creds.share_url}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyShareUrl}
                    className="rounded-full shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/20 rounded-sm p-2.5 text-destructive/85">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {phase === "setup" && (
              <>
                <Button
                  type="button"
                  onClick={goLive}
                  className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Radio className="w-4 h-4 mr-2" />
                  Start broadcasting
                </Button>

                {/* Power-user path: external encoders (OBS, Larix).
                    Hidden behind a toggle so the default flow stays
                    one click. */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAdvanced ? "Hide" : "Use OBS / Larix instead"}
                </button>

                {showAdvanced && (
                  <div className="rounded-sm border border-border bg-secondary/30 p-3 space-y-2">
                    <p className="font-label text-muted-foreground text-xs">
                      RTMP credentials
                    </p>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        Server URL
                      </p>
                      <code className="text-xs font-mono bg-background rounded px-2 py-1 block break-all">
                        {creds.ingest_url}
                      </code>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        Stream key
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-background rounded px-2 py-1 flex-1 break-all">
                          {streamKeyVisible
                            ? creds.stream_key
                            : "•".repeat(Math.min(creds.stream_key.length, 32))}
                        </code>
                        <button
                          type="button"
                          onClick={() => setStreamKeyVisible((v) => !v)}
                          className="text-[10px] text-accent hover:underline shrink-0"
                        >
                          {streamKeyVisible ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                      Paste both into your encoder. Anyone with this
                      stream key can broadcast to your event — don't
                      share it like you'd share the watch link.
                    </p>
                  </div>
                )}
              </>
            )}

            {phase === "connecting" && (
              <div className="text-center py-2">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground inline mr-2" />
                <span className="text-sm text-muted-foreground">
                  Connecting to Mux…
                </span>
              </div>
            )}

            {phase === "ended" && (
              <div className="space-y-3">
                <div className="rounded-sm border border-border bg-card p-4 text-center">
                  <p className="font-medium mb-1">Stream ended</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your recording is being processed. It'll be available
                    at the share link within a minute or two.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(creds.share_url, "_blank")}
                    className="rounded-full"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    View watch page
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
