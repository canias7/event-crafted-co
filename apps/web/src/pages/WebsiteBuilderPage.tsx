import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

// AI Website Builder. Chat on the left, live HTML preview on the
// right (iframe sandboxed with allow-same-origin off — keeps any
// shenanigans in the generated doc isolated from the parent page).
//
// Anonymous flow: type prompt → call ai-site-generate edge function →
// preview the HTML → "Publish" reveals the public /s/<slug> URL.

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

export default function WebsiteBuilderPage() {
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const publicUrl = slug ? `${window.location.origin}/s/${slug}` : null;

  async function submit(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);
    const nextConv: ChatMessage[] = [
      ...conversation,
      { role: "user", content: trimmed },
    ];
    setConversation(nextConv);
    setInput("");

    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "ai-site-generate",
        { body: { prompt: trimmed, conversation } },
      );
      if (fnErr) throw fnErr;
      const body = data as { slug?: string; title?: string; html?: string; error?: string };
      if (!body?.slug || !body?.html) {
        throw new Error(body?.error ?? "generation_failed");
      }
      setHtml(body.html);
      setSlug(body.slug);
      setTitle(body.title ?? "Untitled");
      setConversation([
        ...nextConv,
        {
          role: "assistant",
          content: `Built "${body.title ?? "your site"}". Tell me what to change, or copy the URL to share it.`,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setConversation(nextConv);
    } finally {
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
        <main className="flex-1 bg-[#1a1a1c] flex items-center justify-center p-5 min-h-[60vh]">
          {html ? (
            <iframe
              key={slug ?? "preview"}
              title={title ?? "Site preview"}
              srcDoc={html}
              sandbox=""
              className="w-full h-full max-w-[1400px] rounded-xl shadow-2xl bg-white"
              style={{ minHeight: "70vh" }}
            />
          ) : (
            <div className="text-center text-white/40 max-w-md">
              <div className="text-[14px] uppercase tracking-[2px] mb-3">
                Preview
              </div>
              <div className="text-[15px] leading-relaxed">
                Your site will appear here once you describe it.
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
