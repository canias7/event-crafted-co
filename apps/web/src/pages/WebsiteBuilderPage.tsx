import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

// AI Website Builder. Chat on the left, live HTML preview on the
// right. The edge function returns text/event-stream — each token
// arrives as a `data: {"type":"chunk","text":"..."}` SSE event and
// gets written straight into the iframe's contentDocument via
// document.open()/write()/close(). The browser progressively renders
// as bytes arrive, which is why this feels instant compared to the
// usual "wait then srcDoc swap" pattern.
//
// Sandbox: allow-same-origin (no allow-scripts). That lets the parent
// page access contentDocument to stream into it, while still
// preventing any JS in the generated HTML from running.

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const EXAMPLE_PROMPTS = [
  "Make me a wedding website for Sarah & James in Tulum, Oct 14 2026, beachy boho vibe",
  "1st birthday party site for baby Mila — pastel pink, butterflies, cute",
  "Engagement party invite, dusty blue + gold, formal, downtown loft venue",
  "Backyard BBQ for July 4th — red white blue, casual, fun copy",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function WebsiteBuilderPage() {
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Hold the in-flight reader so a rapid resubmit can cancel cleanly.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const publicUrl =
    slug && typeof window !== "undefined"
      ? `${window.location.origin}/s/${slug}`
      : null;

  function resetIframe(): Document | null {
    const iframe = iframeRef.current;
    if (!iframe) return null;
    const doc = iframe.contentDocument;
    if (!doc) return null;
    doc.open();
    return doc;
  }

  async function submit(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    // Cancel any prior stream before starting a new one.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setError(null);
    setLoading(true);
    setSlug(null);
    setTitle(null);

    const prevConv = conversation;
    const nextConv: ChatMessage[] = [
      ...prevConv,
      { role: "user", content: trimmed },
    ];
    setConversation(nextConv);
    setInput("");

    // Open a fresh iframe document — clears whatever was there.
    const doc = resetIframe();
    if (!doc) {
      setLoading(false);
      setError("Couldn't access preview frame");
      return;
    }
    setHasContent(true);

    let receivedChunk = false;
    let buf = "";

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          prompt: trimmed,
          conversation: prevConv,
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`http_${res.status}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          for (const line of evt.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            let data: { type: string; text?: string; slug?: string; title?: string; message?: string };
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (data.type === "chunk" && data.text) {
              // First chunk often contains the title comment + <!DOCTYPE>.
              // We strip the comment client-side so it doesn't render visibly.
              const text = receivedChunk
                ? data.text
                : data.text.replace(/<!--\s*TITLE:[^>]*-->\s*/i, "");
              receivedChunk = true;
              doc.write(text);
              // Auto-scroll iframe to bottom as content arrives so the
              // user always sees the newest section.
              try {
                const win = iframeRef.current?.contentWindow;
                win?.scrollTo(0, win.document.body?.scrollHeight ?? 0);
              } catch {
                // sandboxed cases — ignore
              }
            } else if (data.type === "done") {
              doc.close();
              setSlug(data.slug ?? null);
              setTitle(data.title ?? null);
              setConversation([
                ...nextConv,
                {
                  role: "assistant",
                  content: `Built "${data.title ?? "your site"}". Tell me what to change, or copy the URL to share it.`,
                },
              ]);
            } else if (data.type === "error") {
              throw new Error(data.message ?? "generation_failed");
            }
          }
        }
      }
      // Ensure the document is closed if the stream ended without a done event.
      try {
        doc.close();
      } catch {
        // already closed
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      try {
        doc.close();
      } catch {
        // ignore
      }
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setConversation(prevConv);
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
      }
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  async function copyUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      // older browsers — fall through silently; the URL is on screen.
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0b] text-white">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
        <Link to="/" className="flex items-center gap-3">
          <VendoraLogo size="sm" color="#fff" />
          <span className="text-[12px] uppercase tracking-[2px] text-white/50">
            Website builder
          </span>
        </Link>
        {publicUrl && (
          <div className="flex items-center gap-3">
            <code className="text-[12px] text-white/70 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              {publicUrl}
            </code>
            <button
              onClick={copyUrl}
              className="text-[12px] bg-white text-black px-4 py-1.5 rounded-full hover:bg-white/90 transition-colors"
            >
              Copy link
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[12px] border border-white/20 px-4 py-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              Open
            </a>
          </div>
        )}
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Chat pane */}
        <aside className="w-full md:w-[400px] md:min-w-[360px] border-r border-white/10 flex flex-col bg-[#0c0c0e]">
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
            {conversation.length === 0 && !loading && (
              <div className="space-y-5">
                <div>
                  <div className="text-[20px] font-medium leading-tight">
                    Hey, I'm your site designer.
                  </div>
                  <div className="text-[14px] text-white/60 mt-2 leading-relaxed">
                    Tell me what kind of event site you want. I'll make
                    it pretty. Then tell me what to tweak.
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-[2px] text-white/40">
                    Try
                  </div>
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => submit(p)}
                      className="block w-full text-left text-[13px] leading-relaxed text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl px-4 py-3 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {conversation.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-white text-black rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed"
                    : "mr-auto max-w-[85%] bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-2.5 text-[14px] leading-relaxed text-white/90"
                }
              >
                {m.content}
              </div>
            ))}

            {loading && (
              <div className="mr-auto max-w-[85%] bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 text-[14px] text-white/60 inline-flex items-center gap-2">
                <span className="builder-dot" />
                <span className="builder-dot" />
                <span className="builder-dot" />
                <span className="ml-2">Designing your site…</span>
              </div>
            )}

            {error && (
              <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 p-3 bg-[#0a0a0b]">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                rows={2}
                placeholder={
                  conversation.length === 0
                    ? "Describe your event…"
                    : "Tweak it — change colors, add a section, fix the date…"
                }
                className="w-full resize-none bg-white/5 border border-white/10 rounded-2xl px-4 py-3 pr-12 text-[14px] text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 disabled:opacity-50"
              />
              <button
                onClick={() => submit(input)}
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:bg-white/90 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 19V5M5 12l7-7 7 7"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* Preview pane */}
        <main className="flex-1 bg-[#1a1a1c] flex items-center justify-center p-5 min-h-[60vh] relative">
          {/* Iframe is always mounted so contentDocument is ready to
              write into the moment a stream starts. Visibility toggled
              by overlay so we don't lose the doc across submits. */}
          <iframe
            ref={iframeRef}
            title={title ?? "Site preview"}
            sandbox="allow-same-origin"
            className="w-full h-full max-w-[1400px] rounded-xl shadow-2xl bg-white"
            style={{
              minHeight: "70vh",
              visibility: hasContent ? "visible" : "hidden",
            }}
          />
          {!hasContent && (
            <div className="absolute inset-0 flex items-center justify-center text-center text-white/40 max-w-md mx-auto px-6 pointer-events-none">
              <div>
                <div className="text-[14px] uppercase tracking-[2px] mb-3">
                  Preview
                </div>
                <div className="text-[15px] leading-relaxed">
                  Your site will appear here once you describe it.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .builder-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.6);
          display: inline-block;
          animation: builderPulse 1.2s ease-in-out infinite;
        }
        .builder-dot:nth-child(2) { animation-delay: 0.2s; }
        .builder-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes builderPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
