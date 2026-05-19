// Quoted reference to a parent message — used in two places:
//
// 1. Above the composer when the user has clicked "Reply" on a
//    bubble. Tone="composer" renders the X-to-cancel handle.
// 2. As a small header inside the bubble of a message that replied
//    to another. Tone="bubble" renders without the cancel handle,
//    and accepts `inverted` so the colors flip for dark/outgoing
//    bubbles (where the default dark text would be invisible).
//
// We truncate the body to two lines so a reply to a long message
// doesn't blow up the parent bubble height.

import { X } from "lucide-react";

interface Props {
  authorName: string;
  body: string;
  tone: "composer" | "bubble";
  /** Only used with tone="bubble". When true, the quote renders
   *  with cream-on-dark colors and a translucent overlay so it
   *  reads cleanly inside an outgoing (dark) bubble. */
  inverted?: boolean;
  onCancel?: () => void;
}

export function MessageReplyContext({
  authorName,
  body,
  tone,
  inverted,
  onCancel,
}: Props) {
  const isBubble = tone === "bubble";

  // Pick color tokens. The composer tone always uses the page's
  // canonical light palette. The bubble tone flips based on parent.
  const containerClasses = isBubble
    ? inverted
      ? "rounded-lg bg-background/15 backdrop-blur-sm px-2.5 py-1.5 mb-1.5 -mt-0.5"
      : "rounded-lg bg-foreground/5 px-2.5 py-1.5 mb-1.5 -mt-0.5"
    : "rounded-xl bg-secondary/70 border border-border px-3 py-2 mb-2";
  const barClasses =
    isBubble && inverted ? "bg-background/70" : "bg-accent";
  const authorClasses =
    isBubble && inverted ? "text-background/90" : "text-foreground/80";
  const bodyClasses =
    isBubble && inverted ? "text-background/70" : "text-foreground/65";

  return (
    <div className={`flex items-start gap-2 ${containerClasses}`}>
      <span
        aria-hidden
        className={`self-stretch w-0.5 rounded-full shrink-0 ${barClasses}`}
      />
      <div className="min-w-0 flex-1 text-xs">
        <p className={`font-medium truncate ${authorClasses}`}>{authorName}</p>
        <p
          className={`leading-snug overflow-hidden ${bodyClasses}`}
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {body || "Message deleted"}
        </p>
      </div>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel reply"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
