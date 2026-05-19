// Chip row rendered under a message bubble: one chip per distinct
// emoji with a count badge. The chip lights up amber when the current
// user has reacted with that emoji — tapping toggles their own
// reaction off via the parent's onToggle callback.

export interface MessageReaction {
  user_id: string;
  emoji: string;
}

interface Props {
  reactions: MessageReaction[];
  currentUserId: string | null;
  align?: "left" | "right";
  onToggle?: (emoji: string) => void;
}

export function MessageReactions({
  reactions,
  currentUserId,
  align = "left",
  onToggle,
}: Props) {
  if (reactions.length === 0) return null;
  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const e = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    e.count += 1;
    if (r.user_id === currentUserId) e.mine = true;
    byEmoji.set(r.emoji, e);
  }
  const entries = Array.from(byEmoji.entries()).sort((a, b) => b[1].count - a[1].count);
  return (
    <div
      className={`flex flex-wrap gap-1 mt-1 ${align === "right" ? "justify-end" : ""}`}
    >
      {entries.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle?.(emoji)}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${
            mine
              ? "bg-accent/15 border border-accent/40 text-accent"
              : "bg-secondary/70 border border-border hover:bg-secondary"
          }`}
        >
          <span>{emoji}</span>
          {count > 1 ? (
            <span className="font-medium tnum">{count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
