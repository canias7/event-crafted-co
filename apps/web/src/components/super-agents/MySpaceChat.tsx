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
  Check,
  Copy,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  Paperclip,
  Pencil,
  RotateCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
  BookOpen,
  Menu,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MySpaceKnowledgePanel } from "@/components/super-agents/MySpaceKnowledgePanel";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Attachment {
  url: string;
  mime: string;
  name: string;
  size?: number;
}

interface TextMessage {
  id?: string;
  role: "user" | "assistant";
  type: "text";
  content: string;
  attachments?: Attachment[] | null;
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
  // Mobile-only side-drawer state. Desktop renders the sidebar inline
  // in an <aside>, so these are only consulted on small screens.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileKbOpen, setMobileKbOpen] = useState(false);
  // Name of the tool currently being executed by the AI, if any. Used
  // to swap the "Thinking…" indicator for something more specific.
  const [activeTool, setActiveTool] = useState<string | null>(null);
  // Files staged for the NEXT send. Cleared after send or via the X.
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>(
    [],
  );
  const [uploadingCount, setUploadingCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Voice input via the Web Speech API. Set while a recognition
  // session is active. Browsers that don't support it just don't show
  // the mic button.
  const [voiceRecording, setVoiceRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  // Text-to-speech: when true, each new assistant message gets spoken
  // aloud via SpeechSynthesis. State persists across renders but is
  // not saved across reloads.
  const [readAloud, setReadAloud] = useState(false);
  // Thread search input — both title and message-content match.
  const [threadSearch, setThreadSearch] = useState("");
  const [searchHits, setSearchHits] = useState<Set<string> | null>(null);
  // AbortController for the in-flight stream so we can cancel it.
  const abortRef = useRef<AbortController | null>(null);

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
        .select(
          "id, role, type, content, image_url, image_prompt, attachments, created_at",
        )
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
                attachments: (r.attachments as Attachment[] | null) ?? null,
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

  // ── Realtime: toast when a new inquiry arrives for this vendor, so
  // the AI's snapshot doesn't go stale mid-chat without the vendor
  // noticing. Subscribes via supabase channels filtered to vendor_id.
  useEffect(() => {
    if (!user?.id) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      // Resolve the vendor_id for the current user; same lookup the
      // edge function does (team membership first, then owner).
      const { data: team } = await supabase
        .from("vendor_team_members")
        .select("vendor_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let vendorId = (team as any)?.vendor_id as string | undefined;
      if (!vendorId) {
        const { data: owned } = await supabase
          .from("vendor_profiles")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        vendorId = (owned as any)?.id as string | undefined;
      }
      if (!vendorId || cancelled) return;
      channel = supabase
        .channel(`my-space-inquiries-${vendorId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "inquiries",
            filter: `vendor_id=eq.${vendorId}`,
          },
          (payload) => {
            const row = (payload.new ?? {}) as any;
            const summary = [row.event_type, row.event_date]
              .filter(Boolean)
              .join(" · ");
            toast.info(
              summary
                ? `New inquiry: ${summary}`
                : "New inquiry just arrived",
              { duration: 8000 },
            );
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ── Upload files (images / PDFs) to message-attachments bucket.
  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0 || !user?.id) return;
    const remaining = 5 - pendingAttachments.length;
    if (remaining <= 0) {
      toast.error("Up to 5 files per message.");
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingCount((c) => c + toUpload.length);
    for (const file of toUpload) {
      try {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is over 10MB`);
          continue;
        }
        if (
          !file.type.startsWith("image/") &&
          file.type !== "application/pdf" &&
          !file.type.startsWith("text/")
        ) {
          toast.error(`${file.name}: unsupported type`);
          continue;
        }
        const ext = file.name.split(".").pop() || "bin";
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(
          0,
          60,
        );
        const path = `${user.id}/${
          currentThreadId ?? "new"
        }/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("message-attachments")
          .upload(path, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) {
          toast.error(`Upload failed: ${file.name}`);
          continue;
        }
        const { data: pub } = supabase.storage
          .from("message-attachments")
          .getPublicUrl(path);
        setPendingAttachments((prev) => [
          ...prev,
          {
            url: pub.publicUrl,
            mime: file.type,
            name: file.name,
            size: file.size,
          },
        ]);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  }

  // ── Send message → SSE stream from edge function → live-update bubble.
  async function send(
    promptText?: string,
    opts?: { regenerate?: boolean; replaceMessageId?: string },
  ) {
    const regenerate = opts?.regenerate === true;
    const replaceMessageId = opts?.replaceMessageId ?? null;
    const text = regenerate ? "" : (promptText ?? input).trim();
    const attachments = regenerate ? [] : pendingAttachments;
    if (!regenerate && (!text && attachments.length === 0)) return;
    if (sending) return;
    if ((regenerate || replaceMessageId) && !currentThreadId) return;
    if (!regenerate && !replaceMessageId) {
      setInput("");
      setPendingAttachments([]);
    }
    // For edit-and-resend, optimistically remove the edited message
    // and everything after it from the visible list before we start
    // streaming the new reply.
    if (replaceMessageId) {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === replaceMessageId);
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });
    }

    // Optimistic user bubble + a placeholder assistant bubble that
    // gets filled in by `delta` events as Claude streams text. Using
    // sentinel objects so we can find them via reference equality.
    // For regenerate, we pop the last assistant message off and only
    // add the placeholder.
    const userOptimistic: TextMessage | null = regenerate ? null : {
      role: "user",
      type: "text",
      content: text,
      attachments: attachments.length > 0 ? attachments : null,
    };
    const assistantPlaceholder: TextMessage = {
      role: "assistant",
      type: "text",
      content: "",
    };
    setMessages((prev) => {
      if (regenerate) {
        // Drop the trailing assistant message; the server will delete
        // its persisted row.
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "assistant") {
            next.splice(i, 1);
            break;
          }
        }
        return [...next, assistantPlaceholder];
      }
      return [...prev, userOptimistic!, assistantPlaceholder];
    });
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

      const ac = new AbortController();
      abortRef.current = ac;
      const browserTz = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        } catch {
          return "";
        }
      })();
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/my-space-chat`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
            accept: "text/event-stream",
            ...(browserTz ? { "x-vendor-timezone": browserTz } : {}),
          },
          signal: ac.signal,
          body: JSON.stringify(
            regenerate
              ? { regenerate: true, thread_id: currentThreadId }
              : {
                text,
                thread_id: currentThreadId,
                attachments:
                  attachments.length > 0 ? attachments : undefined,
                replace_message_id: replaceMessageId ?? undefined,
              },
          ),
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
          } else if (ev.type === "user_message" && userOptimistic) {
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
                  attachments:
                    (ev.attachments as Attachment[] | null) ?? null,
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
          } else if (ev.type === "iteration_cap_reached") {
            // Server burned all MAX_TOOL_ITERATIONS without finishing.
            // Surface as a non-blocking toast — the assistant message
            // itself will explain the limit was hit.
            toast.warning(
              `The AI hit its ${ev.iterations ?? "tool-call"} step limit. Try a smaller, more specific ask.`,
              { duration: 6000 },
            );
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
            // Roll back the placeholders we added.
            setMessages((prev) =>
              prev.filter(
                (m) =>
                  m !== assistantPlaceholder &&
                  (!userOptimistic || m !== userOptimistic),
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
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (aborted) {
        // User hit Stop. Keep whatever text streamed so far inside the
        // assistant placeholder; demote it to a non-placeholder by
        // tagging an id="stopped". Persistence side: the server
        // continues and a real row will exist next page load, so on
        // next thread load this stopped bubble gets replaced.
        const placeholderHasText = (assistantPlaceholder.content ?? "")
          .length > 0;
        if (!placeholderHasText) {
          setMessages((prev) =>
            prev.filter((m) => m !== assistantPlaceholder)
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m === assistantPlaceholder ? { ...m, id: "stopped" } : m
            )
          );
        }
        toast.info("Stopped.");
      } else {
        console.error("[MySpaceChat] send failed", err);
        // Soft stream resume: the server may have completed even
        // though the client dropped. Pull the latest persisted
        // messages for this thread and splice in any newer
        // assistant row that wasn't visible yet.
        let recovered = false;
        const threadIdForRecovery = (receivedThreadId ?? currentThreadId);
        if (threadIdForRecovery) {
          try {
            const { data: latest } = await supabase
              .from("my_space_messages")
              .select(
                "id, role, type, content, image_url, image_prompt, attachments, created_at",
              )
              .eq("thread_id", threadIdForRecovery)
              .order("created_at", { ascending: true })
              .limit(200);
            const rows = (latest ?? []) as Array<any>;
            const lastRow = rows[rows.length - 1];
            if (lastRow && lastRow.role === "assistant" && lastRow.id) {
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
                      attachments:
                        (r.attachments as Attachment[] | null) ?? null,
                      created_at: r.created_at,
                    } as TextMessage)
                ),
              );
              recovered = true;
            }
          } catch {
            // ignore — fall through to the rollback toast
          }
        }
        if (!recovered) {
          toast.error("Connection dropped. Try regenerate.");
          setMessages((prev) =>
            prev.filter(
              (m) =>
                m !== assistantPlaceholder &&
                (!userOptimistic || m !== userOptimistic),
            )
          );
        }
      }
    } finally {
      abortRef.current = null;
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

  // ── Voice input via the Web Speech API. Append transcripts to the
  // composer; toggling stops the session. Chrome / Safari supported.
  const speechSupported = typeof window !== "undefined" &&
    (("SpeechRecognition" in window) ||
      ("webkitSpeechRecognition" in window));

  function startVoice() {
    if (!speechSupported) {
      toast.error("Voice input isn't supported in this browser.");
      return;
    }
    const Ctor = (window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) {
        setInput((cur) => (cur ? `${cur} ${final}` : final).trim());
      }
    };
    rec.onerror = (e: any) => {
      console.warn("[MySpaceChat] speech error", e);
      setVoiceRecording(false);
    };
    rec.onend = () => {
      setVoiceRecording(false);
      recognitionRef.current = null;
    };
    rec.start();
    recognitionRef.current = rec;
    setVoiceRecording(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setVoiceRecording(false);
  }

  function regenerate() {
    void send(undefined, { regenerate: true });
  }

  // ── Inline thread-title editing.
  async function renameThread(threadId: string, newTitle: string) {
    const cleaned = newTitle.trim().slice(0, 80);
    if (!cleaned) return;
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: cleaned } : t))
    );
    const { error } = await supabase
      .from("my_space_threads")
      .update({ title: cleaned })
      .eq("id", threadId);
    if (error) {
      toast.error("Couldn't rename chat.");
      // Best-effort revert; user can refresh.
    }
  }

  // ── Thread search: title match + ILIKE on persisted message content.
  // Debounced so we don't hammer the DB on every keystroke.
  useEffect(() => {
    if (!user?.id) return;
    const q = threadSearch.trim();
    if (q.length < 2) {
      setSearchHits(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("my_space_messages")
        .select("thread_id")
        .eq("user_id", user.id)
        .ilike("content", `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`)
        .limit(200);
      if (error) {
        console.error("[MySpaceChat] thread search failed", error);
        setSearchHits(null);
        return;
      }
      setSearchHits(new Set(((data ?? []) as Array<any>).map((r) => r.thread_id)));
    }, 250);
    return () => clearTimeout(t);
  }, [threadSearch, user?.id]);

  // ── Voice output (TTS) for assistant messages. Watches the latest
  // assistant message; when it finishes (has an id) and readAloud is
  // on, speak it once.
  const lastSpokenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!readAloud) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const last = [...messages].reverse().find(
      (m) => m.role === "assistant" && m.type === "text" && m.id,
    ) as TextMessage | undefined;
    if (!last || last.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = last.id ?? null;
    const u = new SpeechSynthesisUtterance(last.content);
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [messages, readAloud]);

  // ── Keyboard shortcuts: ⌘K new chat, ⌘E export, ⌘/ focus composer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        startNewChat();
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        exportChat();
      } else if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadId, messages, threads]);

  function exportChat() {
    if (messages.length === 0) {
      toast.error("Nothing to export yet.");
      return;
    }
    const thread = threads.find((t) => t.id === currentThreadId);
    const title = thread?.title || "Untitled chat";
    const lines: string[] = [];
    lines.push(`# ${title}`);
    if (thread?.updated_at) {
      lines.push(`_Last updated: ${new Date(thread.updated_at).toLocaleString()}_`);
    }
    lines.push("");
    for (const m of messages) {
      const who = m.role === "user" ? "**You**" : "**My Space**";
      if (m.type === "image") {
        lines.push(`${who} _(image)_`);
        lines.push(`![${m.image_prompt}](${m.image_url})`);
      } else {
        lines.push(`${who}`);
        if (m.attachments && m.attachments.length > 0) {
          for (const a of m.attachments) {
            lines.push(`📎 [${a.name}](${a.url})`);
          }
        }
        lines.push(m.content || "");
      }
      lines.push("");
    }
    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9._-]+/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
          {currentThreadId && messages.length > 0
            ? (
              <div className="flex items-center justify-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={exportChat}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Download this chat as Markdown"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
                {typeof window !== "undefined" && window.speechSynthesis
                  ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (readAloud) {
                          window.speechSynthesis.cancel();
                        }
                        setReadAloud((v) => !v);
                      }}
                      className={`inline-flex items-center gap-1 text-[11px] transition-colors ${
                        readAloud
                          ? "text-[#c4541e]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={readAloud
                        ? "Stop reading aloud"
                        : "Read AI replies aloud"}
                    >
                      {readAloud
                        ? <Volume2 className="w-3 h-3" />
                        : <VolumeX className="w-3 h-3" />}
                      Read aloud
                    </button>
                  )
                  : null}
              </div>
            )
            : null}
          {/* Search across threads (title + message content). */}
          <div className="relative mt-3">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search chats…"
              className="w-full pl-8 pr-2 py-1.5 text-xs bg-secondary/30 rounded-md outline-none focus:bg-secondary/50 transition-colors"
            />
          </div>
          {/* Knowledge base — open as side sheet. The AI loads these
              entries into the system prompt on every turn. */}
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="mt-2 w-full inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Knowledge base
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:max-w-lg overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle className="font-editorial text-2xl">
                  Knowledge base
                </SheetTitle>
              </SheetHeader>
              <div className="mt-5">
                <MySpaceKnowledgePanel />
              </div>
            </SheetContent>
          </Sheet>
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
            (() => {
              const q = threadSearch.trim().toLowerCase();
              const filtered = q.length < 2
                ? threads
                : threads.filter((t) =>
                  (t.title ?? "").toLowerCase().includes(q) ||
                  (searchHits?.has(t.id) ?? false)
                );
              if (filtered.length === 0) {
                return (
                  <p className="text-xs text-muted-foreground p-3 leading-relaxed">
                    No chats match "{threadSearch}".
                  </p>
                );
              }
              return (
                <ul className="space-y-0.5">
                  {filtered.map((t) => (
                    <ThreadListItem
                      key={t.id}
                      thread={t}
                      active={t.id === currentThreadId}
                      onClick={() => setCurrentThreadId(t.id)}
                      onDelete={() => deleteThread(t.id)}
                      onRename={(title) => renameThread(t.id, title)}
                      deleting={deletingThreadId === t.id}
                    />
                  ))}
                </ul>
              );
            })()
          )}
        </div>
      </aside>

      {/* Conversation column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile-only header strip — Menu button opens a left-side
            drawer with the full thread list + KB trigger, since the
            desktop aside is hidden on small screens. */}
        <div
          className="md:hidden flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: "rgba(255,138,76,0.18)" }}
        >
          <Sheet
            open={mobileNavOpen}
            onOpenChange={setMobileNavOpen}
          >
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open chat menu"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              >
                <Menu className="w-4 h-4" />
                Threads
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 max-w-[80vw] p-0 flex flex-col"
            >
              <SheetHeader className="px-3 py-3 border-b" style={{ borderColor: "rgba(255,138,76,0.18)" }}>
                <SheetTitle className="font-editorial text-xl">My Space</SheetTitle>
              </SheetHeader>
              <div className="px-3 py-3 border-b" style={{ borderColor: "rgba(255,138,76,0.18)" }}>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    startNewChat();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium rounded-xl px-3 py-2"
                  style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  New chat
                </button>
                <div className="relative mt-3">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                    placeholder="Search chats…"
                    className="w-full pl-8 pr-2 py-1.5 text-xs bg-secondary/30 rounded-md outline-none focus:bg-secondary/50"
                  />
                </div>
                <Sheet open={mobileKbOpen} onOpenChange={setMobileKbOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Knowledge base
                    </button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    className="w-full sm:max-w-lg overflow-y-auto"
                  >
                    <SheetHeader>
                      <SheetTitle className="font-editorial text-2xl">
                        Knowledge base
                      </SheetTitle>
                    </SheetHeader>
                    <div className="mt-5">
                      <MySpaceKnowledgePanel />
                    </div>
                  </SheetContent>
                </Sheet>
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
                  (() => {
                    const q = threadSearch.trim().toLowerCase();
                    const filtered = q.length < 2
                      ? threads
                      : threads.filter((t) =>
                        (t.title ?? "").toLowerCase().includes(q) ||
                        (searchHits?.has(t.id) ?? false)
                      );
                    if (filtered.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground p-3 leading-relaxed">
                          No chats match "{threadSearch}".
                        </p>
                      );
                    }
                    return (
                      <ul className="space-y-0.5">
                        {filtered.map((t) => (
                          <ThreadListItem
                            key={t.id}
                            thread={t}
                            active={t.id === currentThreadId}
                            onClick={() => {
                              setCurrentThreadId(t.id);
                              setMobileNavOpen(false);
                            }}
                            onDelete={() => deleteThread(t.id)}
                            onRename={(title) => renameThread(t.id, title)}
                            deleting={deletingThreadId === t.id}
                          />
                        ))}
                      </ul>
                    );
                  })()
                )}
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex-1 min-w-0 text-center text-sm text-muted-foreground truncate mx-2">
            {currentThreadId
              ? (threads.find((t) => t.id === currentThreadId)?.title || "Chat")
              : "New chat"}
          </div>
          <button
            type="button"
            onClick={startNewChat}
            aria-label="New chat"
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
                <MessageBubble
                  key={m.id ?? `idx-${i}`}
                  message={m}
                  onEditAndResend={(id, newText) =>
                    void send(newText, { replaceMessageId: id })}
                />
              ))}
            {/* Regenerate button under the last assistant text message
                when we're idle and the message has actually been
                persisted (has an id). */}
            {!sending && currentThreadId &&
                messages.length > 0 &&
                messages[messages.length - 1]?.role === "assistant" &&
                (messages[messages.length - 1] as TextMessage).id
              ? (
                <div className="flex justify-start pl-2">
                  <button
                    type="button"
                    onClick={regenerate}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Regenerate"
                  >
                    <RotateCw className="w-3 h-3" />
                    Regenerate
                  </button>
                </div>
              )
              : null}
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
          {pendingAttachments.length > 0 || uploadingCount > 0
            ? (
              <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
                {pendingAttachments.map((a, i) => (
                  <AttachmentChip
                    key={a.url}
                    att={a}
                    onRemove={() =>
                      setPendingAttachments((prev) =>
                        prev.filter((_, idx) => idx !== i)
                      )}
                  />
                ))}
                {uploadingCount > 0
                  ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Uploading {uploadingCount}…
                    </span>
                  )
                  : null}
              </div>
            )
            : null}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,text/*"
              hidden
              onChange={(e) => {
                void onPickFiles(e.target.files);
                if (e.target) e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || pendingAttachments.length >= 5}
              className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/40 disabled:opacity-40 transition-colors"
              aria-label="Attach file"
              title="Attach an image or PDF (max 5)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            {speechSupported
              ? (
                <button
                  type="button"
                  onClick={voiceRecording ? stopVoice : startVoice}
                  disabled={sending}
                  className={`shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors disabled:opacity-40 ${
                    voiceRecording
                      ? "bg-red-500/15 text-red-600"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                  }`}
                  aria-label={voiceRecording ? "Stop voice" : "Start voice"}
                  title={voiceRecording ? "Tap to stop" : "Voice input"}
                >
                  {voiceRecording
                    ? <MicOff className="w-4 h-4" />
                    : <Mic className="w-4 h-4" />}
                </button>
              )
              : null}
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
            {sending
              ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center bg-foreground text-background transition-opacity"
                  aria-label="Stop"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              )
              : (
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={(!input.trim() &&
                    pendingAttachments.length === 0) ||
                    uploadingCount > 0}
                  className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center bg-foreground text-background disabled:opacity-40 transition-opacity"
                  aria-label="Send"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
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
  onRename,
  deleting,
}: {
  thread: ThreadRow;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  deleting: boolean;
}) {
  const title = thread.title || "Untitled chat";
  const when = useMemo(() => formatThreadTime(thread.updated_at), [
    thread.updated_at,
  ]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Keep draft in sync with title when not editing (server may rename).
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== title) onRename(draft);
  };

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
          active
            ? "bg-secondary/70"
            : "hover:bg-secondary/40"
        }`}
      >
        {editing
          ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(title);
                  setEditing(false);
                }
              }}
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground outline-none border-b border-foreground/30 px-0.5 py-0"
              maxLength={80}
            />
          )
          : (
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
          )}
        {!editing
          ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground hover:text-foreground transition-opacity"
              aria-label="Rename chat"
              title="Rename chat"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )
          : null}
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
  summarize_inquiry_thread: "Summarizing thread…",
  check_availability: "Checking availability…",
  get_business_info: "Looking up your business…",
  get_sales_analytics: "Crunching sales numbers…",
  list_recent_notifications: "Reading notifications…",
  search_messages: "Searching messages…",
  send_host_reply: "Sending reply…",
  update_inquiry_status: "Updating inquiry…",
  send_email: "Sending email…",
  manage_appointment: "Updating appointment…",
  manage_calendar: "Updating calendar…",
  manage_knowledge: "Updating knowledge base…",
  manage_scheduled_action: "Updating scheduled action…",
  mark_notifications_read: "Marking read…",
  create_payment_link: "Creating payment link…",
  create_invoice: "Creating invoice…",
  bulk_update_inquiry_status: "Bulk-updating inquiries…",
  bulk_send_reply: "Sending bulk replies…",
  manage_faq: "Updating FAQs…",
  manage_package: "Updating packages…",
  update_profile: "Updating profile…",
  toggle_auto_reply: "Toggling auto-reply…",
  edit_image: "Editing image…",
  set_chat_preferences: "Saving preferences…",
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

function MessageBubble(
  {
    message,
    onEditAndResend,
  }: {
    message: ChatMessage;
    onEditAndResend?: (messageId: string, newText: string) => void;
  },
) {
  const isUser = message.role === "user";
  const attachments = message.type === "text" ? message.attachments : null;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    message.type === "text" ? message.content : "",
  );
  // Keep draft in sync if the message updates from props.
  useEffect(() => {
    if (!editing && message.type === "text") setDraft(message.content);
  }, [message, editing]);

  const canEdit = isUser && message.type === "text" && !!message.id &&
    !!onEditAndResend;

  const copyText = () => {
    const text = message.type === "text"
      ? message.content
      : message.image_prompt;
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const commitEdit = () => {
    const t = draft.trim();
    if (!t || !message.id) {
      setEditing(false);
      return;
    }
    if (message.type === "text" && t === message.content) {
      setEditing(false);
      return;
    }
    setEditing(false);
    onEditAndResend?.(message.id, t);
  };

  return (
    <div
      className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser ? "bg-foreground text-background" : "bg-white/70 text-foreground"
        }`}
        style={isUser
          ? undefined
          : { border: "0.5px solid rgba(255,138,76,0.18)" }}
      >
        {attachments && attachments.length > 0
          ? (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map((a) => <AttachmentTile key={a.url} att={a} />)}
            </div>
          )
          : null}
        {message.type === "text"
          ? (
            editing
              ? (
                <div className="min-w-[280px]">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        commitEdit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditing(false);
                        setDraft(message.content);
                      }
                    }}
                    rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                    className={`w-full resize-none bg-transparent text-sm leading-relaxed outline-none ${
                      isUser ? "text-background" : "text-foreground"
                    }`}
                  />
                  <div className="flex items-center justify-end gap-2 mt-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setDraft(message.content);
                      }}
                      className={`${
                        isUser
                          ? "text-background/70 hover:text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={commitEdit}
                      className={`font-medium ${
                        isUser
                          ? "text-background"
                          : "text-[#c4541e]"
                      }`}
                    >
                      Save & resend
                    </button>
                  </div>
                </div>
              )
              : message.content
              ? (
                <div
                  className={`text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-black/10 prose-code:text-[0.85em] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-black/10 prose-code:before:content-none prose-code:after:content-none ${
                    isUser
                      ? "prose-invert prose-strong:text-background prose-a:text-background prose-code:bg-white/20"
                      : "prose-strong:text-foreground"
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code(props: any) {
                        const { className, children } = props;
                        // Intercept ```chart fenced blocks — they
                        // carry JSON describing a Recharts spec.
                        if (className === "language-chart") {
                          return (
                            <ChartBlock raw={String(children).trim()} />
                          );
                        }
                        return (
                          <code className={className}>{children}</code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )
              : null
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
      {/* Timestamp + actions row, only visible on hover. */}
      <div
        className={`flex items-center gap-2 mt-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground ${
          isUser ? "flex-row-reverse" : ""
        }`}
      >
        {message.created_at
          ? <span>{formatTimestamp(message.created_at)}</span>
          : null}
        {(message.type === "text" && message.content) ||
            message.type === "image"
          ? (
            <button
              type="button"
              onClick={copyText}
              className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
              aria-label="Copy"
              title="Copy message"
            >
              {copied
                ? <Check className="w-3 h-3" />
                : <Copy className="w-3 h-3" />}
            </button>
          )
          : null}
        {canEdit
          ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
              aria-label="Edit"
              title="Edit and resend"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )
          : null}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Renders a ```chart fenced code block as a real Recharts component.
// Spec shape (from the system prompt):
//   { type: "bar" | "line" | "pie", data: [{ label, value }], title? }
function ChartBlock({ raw }: { raw: string }) {
  let spec: any;
  try {
    spec = JSON.parse(raw);
  } catch {
    return (
      <pre className="text-[11px] bg-black/5 p-2 rounded">
        {`Couldn't parse chart spec:\n${raw}`}
      </pre>
    );
  }
  const data = Array.isArray(spec?.data) ? spec.data : [];
  const type = String(spec?.type ?? "bar");
  const title = spec?.title ? String(spec.title) : null;
  const palette = [
    "#c4541e",
    "#e8915e",
    "#f4c187",
    "#9a3d18",
    "#d97a4e",
    "#7a2a0f",
  ];
  return (
    <div className="my-2 rounded-xl border bg-white/60 p-3" style={{ borderColor: "rgba(255,138,76,0.18)" }}>
      {title
        ? (
          <p className="text-xs font-medium text-foreground mb-2 text-center">
            {title}
          </p>
        )
        : null}
      <div className="w-full" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "line"
            ? (
              <LineChart data={data}>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={palette[0]}
                  dot={{ r: 3 }}
                />
              </LineChart>
            )
            : type === "pie"
            ? (
              <PieChart>
                <Tooltip />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  outerRadius={80}
                  label
                >
                  {data.map((_: any, i: number) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Pie>
              </PieChart>
            )
            : (
              <BarChart data={data}>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill={palette[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AttachmentChip(
  { att, onRemove }: { att: Attachment; onRemove: () => void },
) {
  const isImage = att.mime.startsWith("image/");
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md text-[11px] px-2 py-1 bg-secondary/60"
      title={`${att.name}${att.size ? ` · ${formatSize(att.size)}` : ""}`}
    >
      {isImage
        ? (
          <img
            src={att.url}
            alt=""
            className="w-5 h-5 rounded-sm object-cover"
          />
        )
        : <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
      <span className="max-w-[140px] truncate">{att.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function AttachmentTile({ att }: { att: Attachment }) {
  const isImage = att.mime.startsWith("image/");
  if (isImage) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg overflow-hidden max-w-[180px]"
      >
        <img src={att.url} alt={att.name} className="block w-full h-auto" />
      </a>
    );
  }
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md text-[11px] px-2 py-1 bg-white/40 hover:bg-white/60"
    >
      <FileText className="w-3.5 h-3.5" />
      <span className="max-w-[180px] truncate">{att.name}</span>
    </a>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
