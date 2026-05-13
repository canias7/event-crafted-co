import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Send, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

// Email scraping — chat-driven tool for finding outreach leads.
// You message: "find 10 photographers in Charlotte and email them",
// the assistant finds them + sends emails + writes the leads into
// email_leads. Today this page hosts the chat UI and persistence;
// the actual Anthropic API + tool-use plumbing is a follow-up
// (lives in a Supabase Edge Function once wired up).

type Role = "user" | "assistant" | "system";

type Message = {
  id: string;
  role: Role;
  content: string;
  created_at: string;
};

export function EmailScrapingPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("email_scraping_messages")
      .select("id, role, content, created_at")
      .order("created_at", { ascending: true })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMessages((data ?? []) as Message[]);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Stick to bottom when messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send() {
    const content = draft.trim();
    if (!content || !user || sending) return;
    setSending(true);

    // Optimistic append of the user's message.
    const optimisticId = `tmp-${Date.now()}`;
    const userMsg: Message = {
      id: optimisticId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, userMsg]);
    setDraft("");

    // Call the chat-email-scraping Edge Function. It inserts the user
    // message + the assistant reply on the server side (running the
    // Anthropic API tool-use loop), and returns both rows so we can
    // swap the optimistic one and append the assistant reply.
    const { data, error: fnErr } = await supabase.functions.invoke(
      "chat-email-scraping",
      { body: { message: content } },
    );
    if (fnErr || !data?.assistant_message) {
      toast.error(fnErr?.message ?? "Chat failed");
      setMessages((p) => p.filter((m) => m.id !== optimisticId));
      setSending(false);
      return;
    }
    const { user_message, assistant_message, leads_added } = data as {
      user_message: Message;
      assistant_message: Message;
      leads_added?: number;
    };
    setMessages((p) => {
      const next = p.filter((m) => m.id !== optimisticId);
      next.push(user_message);
      next.push(assistant_message);
      return next;
    });
    if (typeof leads_added === "number" && leads_added > 0) {
      toast.success(`${leads_added} lead${leads_added === 1 ? "" : "s"} added`);
    }
    setSending(false);
  }

  return (
    <div className="flex h-screen flex-col bg-bone">
      <div className="border-b border-ink/10 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <Link
            to="/workspace"
            className="flex items-center gap-1 rounded p-1 text-sm text-ink/60 hover:bg-ink/5"
          >
            <ChevronLeft className="h-4 w-4" />
            Workspace
          </Link>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-ink/70" />
          <h1 className="text-2xl font-semibold">Email scraping</h1>
        </div>
        <p className="mt-1 text-sm text-ink/60">
          Chat with the assistant. Ask it to find contacts, send emails, and
          write the results to the Email leads tab.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 py-6"
      >
        {loading ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {sending ? (
              <li className="flex items-center gap-2 text-sm text-ink/50">
                <span className="h-2 w-2 animate-pulse rounded-full bg-ink/30" />
                Thinking…
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="border-t border-ink/10 bg-white px-8 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto flex max-w-3xl items-end gap-3"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
            rows={2}
            placeholder="Find 10 photographers in Charlotte and email them…"
            className="flex-1 resize-none rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-ink/40"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="flex h-[50px] w-[50px] items-center justify-center rounded-lg bg-ink text-bone transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-[11px] text-ink/40">
          Enter to send · Shift+Enter for newline · Replies are saved to your
          history.
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink/5">
        <Sparkles className="h-6 w-6 text-ink/60" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Tell me who to find</h2>
      <p className="mt-2 text-sm text-ink/60">
        Examples you can try:
      </p>
      <ul className="mt-3 space-y-2 text-sm text-ink/70">
        <li className="rounded-lg border border-ink/10 bg-white px-4 py-2">
          Find 10 photographers in Charlotte and email them.
        </li>
        <li className="rounded-lg border border-ink/10 bg-white px-4 py-2">
          Get 5 wedding florists in Brooklyn — drop them into leads, don&apos;t
          email yet.
        </li>
        <li className="rounded-lg border border-ink/10 bg-white px-4 py-2">
          Show me leads that haven&apos;t replied in 7 days.
        </li>
      </ul>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? "bg-ink text-bone"
            : "border border-ink/10 bg-white text-ink"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        <div
          className={`mt-1 text-[10px] ${
            isUser ? "text-bone/60" : "text-ink/40"
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </div>
    </li>
  );
}
