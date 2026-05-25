// My Space chat — single conversational surface that subsumes what
// HILUX and AXION used to be separate cards for.
//
// One textbox routes intent on the server: image-style asks ("draw…",
// "make a picture of…") go to OpenAI gpt-image-1; everything else goes
// to Claude Sonnet. The vendor doesn't pick a "mode" — they just type.
//
// Conversation is in-memory only (no persistence yet). Vendors who
// reload the page start fresh.

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TextMessage {
  role: "user" | "assistant";
  type: "text";
  content: string;
}
interface ImageMessage {
  role: "assistant";
  type: "image";
  imageUrl: string;
  prompt: string;
}
type ChatMessage = TextMessage | ImageMessage;

const QUICK_PROMPTS = [
  "Draft a reply to a host asking if I'm available June 14",
  "Write a polite decline for a budget that's too low",
  "Generate a moody product shot of a cake on a marble counter",
  "Suggest 3 upsell add-ons I could offer wedding clients",
] as const;

export function MySpaceChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: TextMessage = { role: "user", type: "text", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      // The edge function returns either {type:'text', text} or
      // {type:'image', imageUrl, prompt}. We send the full transcript
      // so the assistant has conversation context.
      const transcript = [...messages, userMsg]
        .filter((m): m is TextMessage => m.type === "text")
        .map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke(
        "my-space-chat",
        { body: { messages: transcript } },
      );
      if (error) throw error;
      const reply = data as
        | { type: "text"; text: string }
        | { type: "image"; imageUrl: string; prompt: string };
      if (reply.type === "image") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            type: "image",
            imageUrl: reply.imageUrl,
            prompt: reply.prompt,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "text", content: reply.text },
        ]);
      }
    } catch (err) {
      console.error("[MySpaceChat] send failed", err);
      toast.error("Couldn't get a reply. Try again.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden h-[calc(100vh-180px)] min-h-[480px]"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* Empty state OR message list */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
          <div
            className="w-14 h-14 rounded-full inline-flex items-center justify-center mb-5"
            style={{
              background: "rgba(255,138,76,0.18)",
              color: "#c4541e",
            }}
          >
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="font-editorial italic text-3xl mb-2">
            What can I help with?
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
            Ask for a draft reply, brainstorm packages, or generate a
            product image. One assistant, both kinds of work.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={sending}
                className="text-left text-sm rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
                style={{
                  background: "rgba(255,253,250,0.5)",
                  border: "0.5px solid rgba(255,138,76,0.18)",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4"
        >
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {sending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Thinking…
            </div>
          ) : null}
        </div>
      )}

      {/* Composer */}
      <div
        className="border-t px-3 md:px-4 py-3"
        style={{ borderColor: "rgba(255,138,76,0.18)" }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask My Space anything — or describe an image to generate"
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none max-h-40 py-2 px-2"
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || sending}
            className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center bg-foreground text-background disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 px-2">
          Text uses Claude Sonnet · Images use OpenAI gpt-image-1
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-foreground text-background"
            : "bg-white/70 text-foreground"
        }`}
        style={
          isUser
            ? undefined
            : { border: "0.5px solid rgba(255,138,76,0.18)" }
        }
      >
        {message.type === "text" ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div>
            <div className="rounded-xl overflow-hidden mb-2">
              <img
                src={message.imageUrl}
                alt={message.prompt}
                className="block w-full h-auto"
              />
            </div>
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              {message.prompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
