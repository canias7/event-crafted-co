// Shared helpers for iMessage-style thread rendering. Used by
// MessagesPage, VendorMessagesPage, VendorPartnersPage, and the two
// inquiry detail pages (host + vendor).
//
//   - isSameDay: calendar-day equality
//   - daySeparator: "Today" / "Yesterday" / "Monday, Mar 5"
//   - groupMessages: produces a render-ready list interleaved with
//     "sep" rows between days and per-message `firstInGroup`/`showTail`
//     so consecutive same-sender messages collapse to tight spacing
//     and only the last bubble per group keeps the asymmetric tail
//     corner.

export const QUICK_EMOJIS = [
  "👍",
  "❤️",
  "🎉",
  "🙏",
  "😂",
  "🔥",
  "😍",
  "😅",
  "👋",
  "🤝",
  "✨",
  "💯",
];

export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function daySeparator(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
    return "Today";
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
    return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export type GroupedItem<M> =
  | { kind: "sep"; label: string; key: string }
  | {
      kind: "msg";
      message: M;
      isMe: boolean;
      showTail: boolean;
      firstInGroup: boolean;
    };

interface GroupOpts<M> {
  isMe: (m: M) => boolean;
  senderKey: (m: M) => string;
  createdAt: (m: M) => string;
  id: (m: M) => string;
}

export function groupMessages<M>(
  messages: M[],
  opts: GroupOpts<M>,
): GroupedItem<M>[] {
  const items: GroupedItem<M>[] = [];
  let lastIso: string | null = null;
  let lastSender: string | null = null;
  messages.forEach((m, i) => {
    const created = opts.createdAt(m);
    if (!lastIso || !isSameDay(lastIso, created)) {
      items.push({
        kind: "sep",
        label: daySeparator(created),
        key: `sep-${opts.id(m)}`,
      });
      lastSender = null;
    }
    const next = messages[i + 1];
    const sameSenderNext =
      next &&
      opts.senderKey(next) === opts.senderKey(m) &&
      isSameDay(created, opts.createdAt(next));
    items.push({
      kind: "msg",
      message: m,
      isMe: opts.isMe(m),
      showTail: !sameSenderNext,
      firstInGroup: lastSender !== opts.senderKey(m),
    });
    lastIso = created;
    lastSender = opts.senderKey(m);
  });
  return items;
}
