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

  // Bubble tone: integrated quote header. Tight left-accent strip, no
  // boxy background — reads as a header inside the same bubble, not
  // a separate card. Composer tone: standalone card above the input
  // since it isn't anchored to any bubble.
  const containerClasses = isBubble
    ? "flex items-start gap-2.5 pl-2 mb-1.5 -mt-0.5"
    : "flex items-start gap-2.5 rounded-2xl px-3 py-2 mb-2 bg-white/55 backdrop-blur-md border border-white/65";
  const barClasses = isBubble
    ? inverted
      ? "bg-background/80"
      : "bg-accent"
    : "bg-accent";
  const authorClasses =
    isBubble && inverted
      ? "text-background"
      : "text-accent-foreground";
  const bodyClasses =
    isBubble && inverted
      ? "text-background/75"
      : "text-foreground/70";

  // For the bubble tone, use a stronger accent color on the author
  // line. The previous foreground/80 read as "muted gray" — felt
  // disconnected from the actual message body it's introducing.
  const accentColor =
    !isBubble || !inverted
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ color: "hsl(var(--accent-foreground))" } as React.CSSProperties)
      : undefined;

  return (
    <div className={containerClasses}>
      <span
        aria-hidden
        className={`self-stretch w-[3px] rounded-full shrink-0 ${barClasses}`}
      />
      <div className="min-w-0 flex-1 text-xs">
        <p
          className={`font-semibold truncate ${authorClasses}`}
          style={accentColor}
        >
          {authorName}
        </p>
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
          className="shrink-0 text-muted-foreground hover:text-foreground self-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
