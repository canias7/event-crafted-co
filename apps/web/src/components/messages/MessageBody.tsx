// Render a message body string with links converted to anchor tags.
// Supports two forms:
//   • markdown links  [label](https://url)  → anchor showing `label`
//   • bare URLs        https://url           → anchor showing the URL
// We don't parse the rest of markdown — just enough so a "Pay online"
// link reads cleanly instead of dumping a long raw URL into the bubble.

import { useMemo } from "react";

// Don't pull trailing punctuation into a bare-URL href: a URL at the
// end of a sentence like "see https://example.com." should not include
// the period. Same for closing brackets sentences wrap URLs in.
const URL_RE = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]}])/g;
// Markdown link: [label](https://url)
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Placeholder body used when a message has only attachments (the DB
// column is NOT NULL so we can't store an empty body). Render nothing
// for this sentinel — the attachment block below the body is enough.
const ATTACHMENT_PLACEHOLDER = "(attachment)";

const linkClass = "underline underline-offset-2 hover:opacity-90";

// Linkify bare URLs in a plain-text chunk (no markdown links here).
function renderBareUrls(text: string, keyPrefix: string) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={`${keyPrefix}-u${i}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {part}
      </a>
    ) : (
      <span key={`${keyPrefix}-t${i}`}>{part}</span>
    ),
  );
}

export function MessageBody({ body }: { body: string }) {
  // Memoize: the parent re-renders on every realtime tick + typing
  // flip, and a thread can hold hundreds of bubbles.
  const nodes = useMemo(() => {
    if (!body || body === ATTACHMENT_PLACEHOLDER) return null;
    const out: React.ReactNode[] = [];
    let last = 0;
    let seg = 0;
    let m: RegExpExecArray | null;
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(body)) !== null) {
      if (m.index > last) {
        out.push(...renderBareUrls(body.slice(last, m.index), `s${seg}`));
        seg++;
      }
      out.push(
        <a
          key={`md${m.index}`}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {m[1]}
        </a>,
      );
      last = m.index + m[0].length;
    }
    if (last < body.length) {
      out.push(...renderBareUrls(body.slice(last), `s${seg}`));
    }
    return out;
  }, [body]);

  if (!nodes) return null;
  return <>{nodes}</>;
}
