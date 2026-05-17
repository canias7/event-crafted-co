// Live AXION demo embedded in the left column of the AXION agent
// section on /super-agents.
//
// Three-panel storyboard mirroring the standalone HTML mockup the
// user shared (vendora_storyboard.html): ORIGINAL → AI PROMPT →
// AI ENHANCED. Sequence auto-plays on a loop — types the prompt
// character by character, runs through three "Analyzing / Restoring /
// Sharpening" status states, then unlocks the enhanced panel with a
// shimmer. Glassy translucent panels with amber corner brackets so
// the demo blends into the cream + amber wash of /super-agents.
//
// Layout is vertical (single column) because the agent card's left
// column is ~460 px wide — a horizontal three-panel row wouldn't
// breathe. Arrows between panels point down to keep the narrative
// flow obvious.

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";

const PROMPT_TEXT =
  "Enhance this low-quality pixelated image into a realistic 4K photo of the same golden retriever. Keep the same angle and outdoor setting, but restore natural fur detail, realistic lighting, and sharp focus. The dog should have its mouth open with a happy expression. Professional DSLR photo quality, cinematic depth of field, ultra detailed, realistic textures.";

type Stage =
  | "idle"
  | "typing"
  | "ready"
  | "analyzing"
  | "restoring"
  | "sharpening"
  | "revealing"
  | "done";

const STATUS_COPY: Record<Stage, string> = {
  idle: "Ready",
  typing: "Composing prompt…",
  ready: "Prompt ready · 387 chars",
  analyzing: "Analyzing source image…",
  restoring: "Restoring detail…",
  sharpening: "Sharpening edges…",
  revealing: "Finalizing…",
  done: "Enhancement complete · 2.4s",
};

export function AxionStoryboardDemo() {
  const [stage, setStage] = useState<Stage>("idle");
  const [typedPrompt, setTypedPrompt] = useState("");
  const [runId, setRunId] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let timeouts: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms);
        timeouts.push(t);
      });

    (async () => {
      // Reset
      setTypedPrompt("");
      setStage("idle");
      await wait(700);
      if (cancelRef.current) return;

      // Type the prompt char by char with humanlike pacing
      setStage("typing");
      for (let i = 0; i < PROMPT_TEXT.length; i++) {
        if (cancelRef.current) return;
        const ch = PROMPT_TEXT[i];
        // Smaller pause on letters, longer on punctuation
        const base =
          ch === "." || ch === "," ? 55 : ch === " " ? 14 : 16;
        await wait(base + Math.random() * 12);
        setTypedPrompt((prev) => prev + ch);
      }
      await wait(450);
      if (cancelRef.current) return;

      setStage("ready");
      await wait(600);
      if (cancelRef.current) return;

      // Run through the processing states
      setStage("analyzing");
      await wait(950);
      if (cancelRef.current) return;
      setStage("restoring");
      await wait(800);
      if (cancelRef.current) return;
      setStage("sharpening");
      await wait(700);
      if (cancelRef.current) return;

      // Reveal
      setStage("revealing");
      await wait(700);
      if (cancelRef.current) return;
      setStage("done");

      // Hold the finished state, then auto-replay
      await wait(4200);
      if (cancelRef.current) return;
      setRunId((r) => r + 1);
    })();

    return () => {
      cancelRef.current = true;
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [runId]);

  const isProcessing =
    stage === "analyzing" ||
    stage === "restoring" ||
    stage === "sharpening" ||
    stage === "revealing";
  const isDone = stage === "done";
  const showResult = stage === "revealing" || stage === "done";

  return (
    <div className="mx-auto flex flex-col gap-4" style={{ maxWidth: 480 }}>
      {/* PANEL 1 — ORIGINAL */}
      <StoryboardPanel
        num="01"
        label="Original"
        badge="UPLOADED"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#f5f3ef]">
          <img
            src="/agents/axion/original.png"
            alt="Original blurry photo"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        </div>
        <PanelMeta name="dog_blurry.png" stat="98 KB · 320 × 240" />
      </StoryboardPanel>

      <DownArrow />

      {/* PANEL 2 — PROMPT */}
      <StoryboardPanel
        num="02"
        label="AI Prompt"
        badge="AXION"
        active={stage !== "idle"}
      >
        <div
          className="relative font-mono text-[12.5px] leading-[1.55] text-foreground/85 rounded-xl p-4 min-h-[150px] max-h-[160px] overflow-y-auto"
          style={{
            background: "rgba(255,255,255,0.35)",
            border: "0.5px solid rgba(255,138,76,0.18)",
            backdropFilter: "blur(6px)",
          }}
        >
          {typedPrompt}
          {stage === "typing" && (
            <span
              className="inline-block w-[7px] h-[14px] align-text-bottom ml-0.5"
              style={{
                background: "#c4541e",
                animation: "axionCaret 0.9s steps(2) infinite",
              }}
            />
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="rounded-full"
              style={{
                width: 6,
                height: 6,
                background:
                  stage === "idle" ? "rgba(0,0,0,0.3)" : "#ff8a4c",
                boxShadow:
                  stage === "idle" ? undefined : "0 0 6px #ff8a4c",
              }}
            />
            {STATUS_COPY[stage]}
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: isProcessing
                ? "rgba(255,138,76,0.2)"
                : "rgba(255,138,76,0.95)",
              color: isProcessing ? "#c4541e" : "#fff",
              border: "0.5px solid rgba(255,138,76,0.35)",
              transition: "background 0.3s",
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Enhancing…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Enhance with AI
              </>
            )}
          </span>
        </div>
      </StoryboardPanel>

      <DownArrow />

      {/* PANEL 3 — ENHANCED */}
      <StoryboardPanel
        num="03"
        label="AI Enhanced"
        badge={isDone ? "HD READY" : isProcessing ? "PROCESSING" : "PENDING"}
        accentBadge={isDone || isProcessing}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#f5f3ef]">
          <img
            src="/agents/axion/enhanced.png"
            alt="Enhanced AI-generated photo"
            className="absolute inset-0 h-full w-full object-cover transition-all duration-700"
            style={{
              opacity: showResult ? 1 : 0.18,
              filter: showResult ? "blur(0px)" : "blur(18px)",
              transform: showResult ? "scale(1)" : "scale(1.04)",
            }}
            draggable={false}
          />
          {/* Locked state — wand overlay before the reveal */}
          {!showResult && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <div
                className="rounded-full w-12 h-12 flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  border: "0.5px solid rgba(255,138,76,0.35)",
                }}
              >
                <Wand2 className="h-5 w-5 text-[#c4541e]" />
              </div>
              <p className="text-[12px] italic">
                Waiting for prompt to generate
              </p>
            </div>
          )}
          {/* Scan line during processing */}
          {isProcessing && (
            <div
              aria-hidden
              className="absolute inset-x-0 h-[14%] pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(255,138,76,0.55) 50%, transparent 100%)",
                mixBlendMode: "screen",
                animation: "axionScan 1.4s linear infinite",
              }}
            />
          )}
        </div>
        <PanelMeta
          name="dog_enhanced.png"
          stat={isDone ? "2.4 MB · 1408 × 1056" : "— · 4× upscale"}
        />
      </StoryboardPanel>

      {/* Replay control — only after the demo finishes */}
      {isDone && (
        <button
          type="button"
          onClick={() => setRunId((r) => r + 1)}
          className="self-end inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-[#c4541e] hover:text-[#a4441a] transition-colors"
          style={{
            background: "rgba(255,255,255,0.6)",
            border: "0.5px solid rgba(255,138,76,0.28)",
            backdropFilter: "blur(6px)",
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Replay
        </button>
      )}

      <style>{`
        @keyframes axionCaret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes axionScan {
          0% { transform: translateY(-30%); }
          100% { transform: translateY(640%); }
        }
      `}</style>
    </div>
  );
}

function StoryboardPanel({
  num,
  label,
  badge,
  active,
  accentBadge,
  children,
}: {
  num: string;
  label: string;
  badge: string;
  active?: boolean;
  accentBadge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-2xl p-4"
      style={{
        background: "rgba(255,255,255,0.32)",
        border: "0.5px solid rgba(255,138,76,0.18)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 8px 28px rgba(255,138,76,0.08)",
      }}
    >
      {/* corner brackets */}
      <span
        aria-hidden
        className="absolute top-1.5 left-1.5 w-3 h-3 rounded-tl-[3px] opacity-50"
        style={{
          borderTop: "0.5px solid #c4541e",
          borderLeft: "0.5px solid #c4541e",
        }}
      />
      <span
        aria-hidden
        className="absolute bottom-1.5 right-1.5 w-3 h-3 rounded-br-[3px] opacity-50"
        style={{
          borderBottom: "0.5px solid #c4541e",
          borderRight: "0.5px solid #c4541e",
        }}
      />

      <div
        className="flex items-center justify-between pb-3 mb-3"
        style={{ borderBottom: "0.5px solid rgba(255,138,76,0.14)" }}
      >
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-medium text-foreground/75">
          <span
            className="font-mono text-[9px]"
            style={{ color: "#c4541e", opacity: 0.85 }}
          >
            {num}
          </span>
          {label}
        </div>
        <span
          className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.1em] text-[9px] px-2 py-1 rounded"
          style={{
            background: accentBadge
              ? "rgba(255,138,76,0.16)"
              : "rgba(0,0,0,0.04)",
            color: accentBadge ? "#c4541e" : "rgba(26,22,18,0.55)",
            border: accentBadge
              ? "0.5px solid rgba(255,138,76,0.32)"
              : "0.5px solid rgba(0,0,0,0.06)",
          }}
        >
          <span
            className="rounded-full"
            style={{
              width: 5,
              height: 5,
              background: accentBadge ? "#ff8a4c" : "rgba(0,0,0,0.3)",
              boxShadow: accentBadge ? "0 0 6px #ff8a4c" : undefined,
            }}
          />
          {badge}
        </span>
      </div>
      {children}
      {/* Subtle active-state amber rim */}
      {active && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            boxShadow: "inset 0 0 0 0.5px rgba(255,138,76,0.35)",
          }}
        />
      )}
    </div>
  );
}

function PanelMeta({ name, stat }: { name: string; stat: string }) {
  return (
    <div className="flex items-center justify-between mt-3 text-[11px]">
      <span className="text-muted-foreground font-mono">{name}</span>
      <span className="font-mono text-[#c4541e] font-medium">{stat}</span>
    </div>
  );
}

function DownArrow() {
  return (
    <div className="flex justify-center -my-1">
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-full"
        style={{
          background: "rgba(255,138,76,0.16)",
          border: "0.5px solid rgba(255,138,76,0.3)",
        }}
      >
        <ArrowDown className="h-3.5 w-3.5 text-[#c4541e]" />
      </span>
    </div>
  );
}
