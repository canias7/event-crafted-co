// Render a message body as PLAIN TEXT — links are intentionally disabled.
//
// Messages used to linkify markdown links ([label](url)) and bare URLs into
// clickable anchors. Until link handling is properly vetted (safety/abuse),
// chats render everything inert: no anchors anywhere. Markdown links are
// flattened to "label (url)" so messages stay readable; bare URLs show as-is
// as text. To re-enable links later, restore the anchor rendering from git
// history (this file, pre-2026-06-10).

import { useMemo } from "react";

// Markdown link: [label](https://url) → flattened to "label (url)".
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Placeholder body used when a message has only attachments (the DB
// column is NOT NULL so we can't store an empty body). Render nothing
// for this sentinel — the attachment block below the body is enough.
const ATTACHMENT_PLACEHOLDER = "(attachment)";

export function MessageBody({ body }: { body: string }) {
  // Memoize: the parent re-renders on every realtime tick + typing
  // flip, and a thread can hold hundreds of bubbles.
  const text = useMemo(() => {
    if (!body || body === ATTACHMENT_PLACEHOLDER) return null;
    return body.replace(MD_LINK_RE, "$1 ($2)");
  }, [body]);

  if (text === null) return null;
  return <>{text}</>;
}
