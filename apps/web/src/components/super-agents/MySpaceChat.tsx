// My Space chat — vendor-side conversational AI on /vendor/ai-superagents.
//
// What's on screen:
//   • Left rail: list of persisted threads (most-recent first). Click
//     to load. "New chat" button up top creates a fresh thread on the
//     server when the vendor sends the first message.
//   • Right side: message list + composer. Image asks ("draw…",
//     "generate…") still route to gpt-image-2 server-side; text asks
//     go to Claude Sonnet with vendor context + tools for deep lookups
//     (inquiries, calendar). One assistant, both kinds of work.
//
// Persistence: messages + threads live in my_space_threads /
// my_space_messages with owner-only RLS, so the frontend reads them
// directly via supabase-js and the edge function writes via service
// role.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ImageIcon,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TextMessage {
  id?: string;
  role: "user" | "assistant";
  type: "text";
  content: string;
  created_at?: string;
}
interface ImageMessage {
  id?: string;
  role: "assistant";
  type: "image";
  image_url: string;
  image_prompt: string;
  created_at?: string;
}
type ChatMessage = TextMessage | ImageMessage;

interface ThreadRow {
  id: string;
  title: string | null;
  updated_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string;

const QUICK_PROMPTS = [
  "What hot leads do I have right now?",
  "Draft a reply to my newest inquiry",
  "Am I free on July 14?",
  "Generate a moody product shot of a cake on a marble counter",
] as const;

export function MySpaceChat() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  // Name of the tool currently being executed by the AI, if any. Used
  // to swap the "Thinking…" indicator for something more specific.
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Load threads on mount; pick the most recent as the default.
  const loadThreads = useCallback(async (): Promise<ThreadRow[]> => {
    if (!user?.id) return [];
    const { data, error } = await supabase
      .from("my_space_threads")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[MySpaceChat] loadThreads failed", error);
      return [];
    }
    return (data ?? []) as ThreadRow[];
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setThreadsLoading(true);
      const rows = await loadThreads();
      if (cancelled) return;
      setThreads(rows);
      setCurrentThreadId((prev) => prev ?? rows[0]?.id ?? null);
      setThreadsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadThreads]);

  // ── Load messages whenever the current thread changes.
  useEffect(() => {
    let cancelled = false;
    if (!currentThreadId) {
      setMessages([]);
      return;
    }
    (async () => {
      setMessagesLoading(true);
      const { data, error } = await supabase
        .from("my_space_messages")
        .select("id, role, type, content, image_url, image_prompt, created_at")
        .eq("thread_id", currentThreadId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error("[MySpaceChat] loadMessages failed", error);
        setMessages([]);
      } else {
        const rows = (data ?? []) as Array<any>;
        setMessages(
          rows.map((r) =>
            r.type === "image"
              ? ({
                id: r.id,
                role: "assistant",
                type: "image",
                image_url: r.image_url,
                image_prompt: r.image_prompt,
                created_at: r.created_at,
              } as ImageMessage)
              : ({
                id: r.id,
                role: r.role,
                type: "text",
                content: r.content,
                created_at: r.created_at,
              } as TextMessage)
          ),
        );
      }
      setMessagesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentThreadId]);

  // ── Auto-scroll on new message.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // ── Send message → SSE stream from edge function → live-update bubble.
  async function send(promptText?: string) {
    const text = (promptText ?? input).trim();
    if (!text || sending) return;
    setInput("");

    // Optimistic user bubble + a placeholder assistant bubble that
    // gets filled in by `delta` events as Claude streams text. Using
    // sentinel objects so we can find them via reference equality.
    const userOptimistic: TextMessage = {
      role: "user",
      type: "text",
      content: text,
    };
    const assistantPlaceholder: TextMessage = {
      role: "assistant",
      type: "text",
      content: "",
    };
    setMessages((prev) => [...prev, userOptimistic, assistantPlaceholder]);
    setSending(true);
    setActiveTool(null);

    // Track per-stream state in closure variables; we apply them to
    // React state via functional updaters so concurrent deltas don't
    // race.
    let receivedThreadId: string | null = null;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("not_signed_in");

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/my-space-chat`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
            accept: "text/event-stream",
          },
          body: JSON.stringify({ text, thread_id: currentThreadId }),
        },
      );
      if (!res.ok || !res.body) {
        let detail = "";
        try {
          detail = await res.text();
        } catch {
          // ignore
        }
        throw new Error(`${res.status}: ${detail.slice(0, 240)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawError = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          let ev: any;
          try {
            ev = JSON.parse(data);
          } catch {
            continue;
          }
          if (ev.type === "thread") {
            receivedThreadId = ev.thread_id;
            if (ev.thread_is_new || ev.thread_id !== currentThreadId) {
              setCurrentThreadId(ev.thread_id);
            }
          } else if (ev.type === "user_message") {
            // Swap the optimistic user bubble with the persisted one.
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((m) => m === userOptimistic);
              if (idx >= 0) {
                next[idx] = {
                  id: ev.id,
                  role: "user",
                  type: "text",
                  content: ev.content,
                  created_at: ev.created_at,
                } as TextMessage;
              }
              return next;
            });
          } else if (ev.type === "delta") {
            const chunk = String(ev.text ?? "");
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((m) => m === assistantPlaceholder);
              if (idx >= 0 && next[idx].type === "text") {
                (next[idx] as TextMessage).content =
                  ((next[idx] as TextMessage).content ?? "") + chunk;
              }
              return next;
            });
          } else if (ev.type === "tool_start") {
            setActiveTool(String(ev.name ?? ""));
          } else if (ev.type === "tool_done") {
            setActiveTool(null);
          } else if (ev.type === "image_pending") {
            setActiveTool("generating image");
          } else if (ev.type === "done") {
            const a = ev.assistant_message ?? {};
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((m) => m === assistantPlaceholder);
              if (idx >= 0) {
                next[idx] = a.type === "image"
                  ? ({
                    id: a.id,
                    role: "assistant",
                    type: "image",
                    image_url: a.image_url,
                    image_prompt: a.image_prompt,
                    created_at: a.created_at,
                  } as ImageMessage)
                  : ({
                    id: a.id,
                    role: "assistant",
                    type: "text",
                    content: a.content,
                    created_at: a.created_at,
                  } as TextMessage);
              }
              return next;
            });
            setActiveTool(null);
          } else if (ev.type === "error") {
            sawError = true;
            toast.error(`Couldn't get a reply: ${ev.message}`);
            // Roll back both placeholders.
            setMessages((prev) =>
              prev.filter(
                (m) => m !== userOptimistic && m !== assistantPlaceholder,
              )
            );
            setActiveTool(null);
          }
        }
      }

      if (!sawError) {
        // Refresh thread list so the new/updated thread sorts to the top.
        const refreshed = await loadThreads();
        setThreads(refreshed);
      }
    } catch (err) {
      console.error("[MySpaceChat] send failed", err);
      toast.error("Couldn't get a reply. Try again.");
      setMessages((prev) =>
        prev.filter((m) => m !== userOptimistic && m !== assistantPlaceholder)
      );
    } finally {
      setSending(false);
      setActiveTool(null);
      inputRef.current?.focus();
    }
    // Silence unused warning if no events arrived.
    void receivedThreadId;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function startNewChat() {
    setCurrentThreadId(null);
    setMessages([]);
    inputRef.current?.focus();
  }

  async function deleteThread(threadId: string) {
    if (!confirm("Delete this chat? This can't be undone.")) return;
    setDeletingThreadId(threadId);
    const { error } = await supabase
      .from("my_space_threads")
      .delete()
      .eq("id", threadId);
    setDeletingThreadId(null);
    if (error) {
      toast.error("Couldn't delete chat.");
      return;
    }
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (threadId === currentThreadId) {
      setCurrentThreadId(null);
      setMessages([]);
    }
  }

  const showEmptyState = !currentThreadId && messages.length === 0 &&
    !messagesLoading;

  return (
    <div
      className="flex rounded-2xl overflow-hidden h-[calc(100vh-180px)] min-h-[480px]"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* Thread rail */}
      <aside
        className="hidden md:flex w-64 shrink-0 flex-col border-r"
        style={{ borderColor: "rgba(255,138,76,0.18)" }}
      >
        <div
          className="px-3 py-3 border-b"
          style={{ borderColor: "rgba(255,138,76,0.18)" }}
        >
          <button
            type="button"
            onClick={startNewChat}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium rounded-xl px-3 py-2 transition-colors"
            style={{
              background: "rgba(255,138,76,0.18)",
              color: "#c4541e",
            }}
          >
            <MessageSquarePlus className="w-4 h-4" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {threadsLoading ? (
            <div className="text-xs text-muted-foreground p-3 inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading…
            </div>
          ) : threads.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 leading-relaxed">
              No chats yet. Send your first message to start one.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <ThreadListItem
                  key={t.id}
                  thread={t}
                  active={t.id === currentThreadId}
                  onClick={() => setCurrentThreadId(t.id)}
                  onDelete={() => deleteThread(t.id)}
                  deleting={deletingThreadId === t.id}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Conversation column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile-only new-chat strip */}
        <div
          className="md:hidden flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: "rgba(255,138,76,0.18)" }}
        >
          <select
            value={currentThreadId ?? ""}
            onChange={(e) =>
              setCurrentThreadId(e.target.value === "" ? null : e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none mr-2"
          >
            <option value="">New chat</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || "Untitled chat"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={startNewChat}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5"
            style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        {showEmptyState ? (
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
              I know your packages, calendar, and active inquiries. Ask
              about leads, draft replies, or describe an image to generate.
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
            {messagesLoading && messages.length === 0
              ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading…
                </div>
              )
              : messages.map((m, i) => (
                <MessageBubble key={m.id ?? `idx-${i}`} message={m} />
              ))}
            {sending && activeTool
              ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {formatToolLabel(activeTool)}
                </div>
              )
              : null}
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
              {sending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-2">
            Text uses Claude Sonnet · Images use OpenAI gpt-image-2
          </p>
        </div>
      </div>
    </div>
  );
}

function ThreadListItem({
  thread,
  active,
  onClick,
  onDelete,
  deleting,
}: {
  thread: ThreadRow;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const title = thread.title || "Untitled chat";
  const when = useMemo(() => formatThreadTime(thread.updated_at), [
    thread.updated_at,
  ]);
  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
          active
            ? "bg-secondary/70"
            : "hover:bg-secondary/40"
        }`}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm text-foreground truncate leading-tight">
            {title}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{when}</p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground hover:text-foreground transition-opacity"
          aria-label="Delete chat"
          title="Delete chat"
        >
          {deleting
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Trash2 className="w-3 h-3" />}
        </button>
      </div>
    </li>
  );
}

// Map raw tool names to friendly status labels that flash next to the
// loading spinner while the AI executes a tool call.
const TOOL_LABELS: Record<string, string> = {
  search_inquiries: "Searching inquiries…",
  get_inquiry: "Reading inquiry…",
  check_availability: "Checking availability…",
  list_faqs: "Reading FAQs…",
  list_portfolio_images: "Reading portfolio…",
  list_appointments: "Checking appointments…",
  list_recent_notifications: "Reading notifications…",
  search_messages: "Searching messages…",
  send_host_reply: "Sending reply…",
  create_appointment: "Creating appointment…",
  update_inquiry_status: "Updating inquiry…",
  block_calendar_date: "Blocking date…",
  unblock_calendar_date: "Unblocking date…",
  mark_notifications_read: "Marking read…",
  create_payment_link: "Creating payment link…",
};

function formatToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ") + "…";
}

function formatThreadTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser ? "bg-foreground text-background" : "bg-white/70 text-foreground"
        }`}
        style={isUser
          ? undefined
          : { border: "0.5px solid rgba(255,138,76,0.18)" }}
      >
        {message.type === "text"
          ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          )
          : (
            <div>
              <div className="rounded-xl overflow-hidden mb-2">
                <img
                  src={message.image_url}
                  alt={message.image_prompt}
                  className="block w-full h-auto"
                />
              </div>
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                {message.image_prompt}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
