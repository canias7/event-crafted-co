// Quoted reference to a parent message — used in two places:
//
// 1. Above the composer when the user has clicked "Reply" on a
//    bubble. Tone="composer" renders the X-to-cancel handle.
// 2. As a small header inside the bubble of a message that replied
//    to another. Tone="bubble" renders without the cancel handle.
//
// We truncate the body to two lines so a reply to a long message
// doesn't blow up the parent bubble height.

import { X } from "lucide-react";

interface Props {
  authorName: string;
  body: string;
  tone: "composer" | "bubble";
  onCancel?: () => void;
}

export function MessageReplyContext({
  authorName,
  body,
  tone,
  onCancel,
}: Props) {
  const isBubble = tone === "bubble";
  return (
    <div
      className={`flex items-start gap-2 ${
        isBubble
          ? "rounded-lg bg-foreground/5 px-2.5 py-1.5 mb-1.5 -mt-0.5"
          : "rounded-xl bg-secondary/70 border border-border px-3 py-2 mb-2"
      }`}
    >
      <span
        aria-hidden
        className="self-stretch w-0.5 rounded-full bg-accent shrink-0"
      />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium text-foreground/80 truncate">{authorName}</p>
        <p
          className="text-foreground/65 leading-snug overflow-hidden"
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
