// Render a message body string with bare URLs converted to anchor
// tags. We don't try to parse markdown — just http(s) URLs so the
// pin-location message (and any pasted link) is tappable.
//
// String.prototype.split with a capturing-group regex yields
// alternating chunks: text, url, text, url… so we can rely on the
// index parity instead of re-testing each part.

import { useMemo } from "react";

// Don't pull trailing punctuation into the href: a URL at the end
// of a sentence like "see https://example.com." should not include
// the period. Same for closing brackets `)`, `]`, `}` that sentences
// often wrap URLs in. The character class excludes those at the
// very end via a negative lookbehind-friendly trailing class.
const URL_RE = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]}])/g;

export function MessageBody({ body }: { body: string }) {
  // Memoize the split: the parent re-renders on every realtime
  // tick + every typing-indicator flip, and a thread can hold
  // hundreds of bubbles. Avoid re-splitting unchanged bodies.
  const parts = useMemo(() => (body ? body.split(URL_RE) : []), [body]);
  if (!body) return null;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-90"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
