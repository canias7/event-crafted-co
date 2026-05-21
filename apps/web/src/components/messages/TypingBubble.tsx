// Three-dot animated typing indicator. Shared between the vendor
// and host inquiry detail pages — both had near-identical copies
// before. The cream/hairline palette matches the new incoming-
// bubble styling on both sides.

interface Props {
  /** Render a 24px-wide spacer on the left so the bubble lines up
   *  with the incoming-avatar column on pages that show one (host
   *  side). Vendor side leaves the spacer off and the bubble
   *  starts at the gutter. */
  withAvatarSpacer?: boolean;
  /** Optional caption above the dots (e.g., "HILUX is typing").
   *  Omitted = plain three-dot bubble. */
  label?: string;
}

export function TypingBubble({ withAvatarSpacer, label }: Props) {
  return (
    <div className="flex items-end gap-2 mt-2">
      {withAvatarSpacer ? <span className="shrink-0 w-6" aria-hidden /> : null}
      <div className="flex flex-col items-start gap-0.5">
        {label ? (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 px-1">
            {label}
          </span>
        ) : null}
        <div
          className="bg-background/95 border border-border/40 shadow-sm px-3.5 py-2.5 rounded-2xl rounded-bl-sm inline-flex items-end gap-1"
          aria-label={label ?? "Typing"}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse"
            style={{ animationDelay: "0s" }}
          />
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse"
            style={{ animationDelay: "0.2s" }}
          />
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse"
            style={{ animationDelay: "0.4s" }}
          />
        </div>
      </div>
    </div>
  );
}
