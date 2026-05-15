import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { Link, useSearchParams } from "react-router-dom";
import {
  Send,
  Loader2,
  MessageSquare,
  ArrowRight,
  Smile,
  MoreHorizontal,
  BellOff,
  Bell,
  Flag,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ContactInfoWarning } from "@/components/messages/ContactInfoWarning";
import { MessageAttachments } from "@/components/messages/MessageAttachments";
import { AttachmentPickerButton } from "@/components/messages/AttachmentPickerButton";
import { detectContactInfo } from "@/lib/contactInfoSignals";
import {
  uploadAttachments,
  type MessageAttachment,
} from "@/lib/messageAttachments";
import { customerNavItems as navItems } from "@/data/navItems";
import { formatDate } from "@/lib/format";

const QUICK_EMOJIS = [
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

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

interface ThreadRow {
  id: string;
  vendor_id: string;
  last_message_at: string;
  inquiry_id: string | null;
  vendor: {
    business_name: string;
    category: string;
    user_id?: string | null;
  } | null;
}

interface DirectMessage {
  id: string;
  sender_role: "host" | "vendor";
  body: string;
  attachments?: MessageAttachment[];
  created_at: string;
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function daySeparator(iso: string): string {
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

const threadsTable = () => supabase.from("direct_threads");
const dmsTable = () => supabase.from("direct_messages");

export default function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeThreadId = searchParams.get("thread");

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [activeNow, setActiveNow] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tracks whether the component is still mounted. Realtime callbacks
  // and the initial fetches both close over this so we don't setState
  // after unmount (no leak warning, no wasted render).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function loadThreads() {
    if (!user) return;
    setLoading(true);
    const { data } = await threadsTable()
      .select(
        "id, vendor_id, last_message_at, inquiry_id, vendor:vendor_profiles!direct_threads_vendor_id_fkey(business_name, category, user_id)",
      )
      .eq("host_id", user.id)
      .order("last_message_at", { ascending: false });
    if (!mountedRef.current) return;
    setThreads((data as ThreadRow[]) ?? []);
    setLoading(false);
  }

  async function loadMessages(threadId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (dmsTable() as any)
      .select("id, sender_role, body, attachments, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (!mountedRef.current) return;
    setMessages((data as DirectMessage[]) ?? []);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId]);

  // Realtime: live-update active thread + thread list ordering.
  // Shares the user-scoped channel from RealtimeProvider.
  const realtimeConfig = useMemo(
    () =>
      user
        ? { table: "direct_messages", event: "INSERT" as const }
        : null,
    [user?.id],
  );
  useRealtime(realtimeConfig, (payload) => {
    if (!mountedRef.current) return;
    const msg = payload.new as DirectMessage & { thread_id: string };
    if (msg.thread_id === activeThreadId) loadMessages(activeThreadId);
    loadThreads();
  });

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  // Seed mute state from thread_mutes so the menu reflects reality
  // on open. Mirrors host-mobile/(host)/thread/[id].tsx.
  // Cast as any: thread_mutes / thread_reports aren't in the
  // generated Supabase types yet (added in 20260511195000 migration
  // after the last types regeneration).
  useEffect(() => {
    if (!user?.id || !activeThreadId) {
      setMuted(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("thread_mutes")
        .select("thread_id")
        .eq("user_id", user.id)
        .eq("thread_id", activeThreadId)
        .maybeSingle();
      if (!cancelled) setMuted(data != null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeThreadId]);

  async function toggleMute() {
    if (!user?.id || !activeThreadId) return;
    const next = !muted;
    setMuted(next); // optimistic
    if (next) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("thread_mutes")
        .insert({ user_id: user.id, thread_id: activeThreadId });
      if (error) {
        setMuted(false);
        toast.error(error.message);
      } else {
        toast.success("Notifications muted for this thread.");
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("thread_mutes")
        .delete()
        .eq("user_id", user.id)
        .eq("thread_id", activeThreadId);
      if (error) {
        setMuted(true);
        toast.error(error.message);
      } else {
        toast.success("Notifications re-enabled.");
      }
    }
  }

  async function reportThread() {
    if (!user?.id || !activeThreadId) return;
    const reason = window.prompt(
      "Report this conversation — what's wrong?\n\n(Sent to our team; the other party isn't notified.)",
    );
    if (reason === null) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("thread_reports")
      .insert({
        thread_id: activeThreadId,
        reporter_id: user.id,
        reason: reason.trim() || null,
      });
    if (error) {
      toast.error(`Couldn't send report: ${error.message}`);
      return;
    }
    toast.success("Reported. We'll review and follow up if needed.");
  }

  // Poll the other party's last-seen timestamp for the "Active now"
  // dot. Lightweight: just the open thread, every 30s, no realtime
  // subscription. Mirrors host-mobile/(host)/thread/[id].tsx.
  useEffect(() => {
    if (!activeThread?.vendor?.user_id) {
      setActiveNow(false);
      return;
    }
    let cancelled = false;
    async function tick() {
      const otherUserId = activeThread?.vendor?.user_id;
      if (!otherUserId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("get_user_last_seen", {
        p_user_id: otherUserId,
      });
      if (cancelled) return;
      const lastSeen = data as string | null;
      setActiveNow(
        !!lastSeen &&
          Date.now() - new Date(lastSeen).getTime() < ACTIVE_WINDOW_MS,
      );
    }
    tick();
    const interval = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeThread?.vendor?.user_id]);

  // Group consecutive same-sender messages within the same day and
  // insert "Today / Yesterday / Mar 5" separators between days.
  type RenderItem =
    | { kind: "sep"; label: string; key: string }
    | {
        kind: "msg";
        message: DirectMessage;
        isMe: boolean;
        showTail: boolean;
        firstInGroup: boolean;
      };

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    let lastIso: string | null = null;
    let lastSender: string | null = null;
    messages.forEach((m, i) => {
      const isMe = m.sender_role === "host";
      if (!lastIso || !isSameDay(lastIso, m.created_at)) {
        items.push({
          kind: "sep",
          label: daySeparator(m.created_at),
          key: `sep-${m.id}`,
        });
        lastSender = null;
      }
      const next = messages[i + 1];
      const sameSenderNext =
        next &&
        next.sender_role === m.sender_role &&
        isSameDay(m.created_at, next.created_at);
      items.push({
        kind: "msg",
        message: m,
        isMe,
        showTail: !sameSenderNext,
        firstInGroup: lastSender !== m.sender_role,
      });
      lastIso = m.created_at;
      lastSender = m.sender_role;
    });
    return items;
  }, [messages]);

  function insertEmoji(e: string) {
    setComposer((v) => v + e);
    setEmojiOpen(false);
  }

  async function send() {
    if ((!composer.trim() && pendingFiles.length === 0) || !activeThreadId || !user)
      return;
    setSending(true);
    let attachments: MessageAttachment[] = [];
    if (pendingFiles.length > 0) {
      attachments = await uploadAttachments(
        pendingFiles,
        activeThreadId,
        (n, m) => toast.error(`${n}: ${m}`),
      );
    }
    const flags = detectContactInfo(composer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (dmsTable() as any).insert({
      thread_id: activeThreadId,
      sender_id: user.id,
      sender_role: "host",
      body: composer.trim(),
      attachments,
      contact_info_flagged: flags.any,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComposer("");
    setPendingFiles([]);
    loadMessages(activeThreadId);
    loadThreads();
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border/40 bg-card/60 backdrop-blur px-4 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">Messages</h1>
          <p className="text-sm text-muted-foreground">
            Casual chat with vendors before sending a formal inquiry
          </p>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] h-[calc(100vh-65px)]">
          {/* Thread list */}
          <aside className="border-r border-border overflow-y-auto bg-card/30">
            {loading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-sm" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium mb-2">No messages yet</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Tap "Message" on any vendor profile to start a conversation
                  without committing to a structured inquiry.
                </p>
                <Link to="/vendors">
                  <Button size="sm" variant="outline" className="rounded-full">
                    Browse vendors
                    <ArrowRight className="w-3 h-3 ml-1.5" />
                  </Button>
                </Link>
              </div>
            ) : (
              <ul>
                {threads.map((t) => {
                  const isActive = t.id === activeThreadId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSearchParams({ thread: t.id }, { replace: true })
                        }
                        className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors ${
                          isActive
                            ? "bg-secondary"
                            : "hover:bg-secondary/40"
                        }`}
                      >
                        <p className="text-sm font-medium truncate">
                          {t.vendor?.business_name ?? "Vendor"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {t.vendor?.category}
                          {" · "}
                          {formatDate(t.last_message_at, "short")}
                        </p>
                        {t.inquiry_id && (
                          <p className="text-[10px] text-accent mt-1 uppercase tracking-wide">
                            Linked to inquiry
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Active thread */}
          <section className="flex flex-col min-w-0">
            {!activeThread ? (
              <div className="flex-1 flex items-center justify-center text-center p-6">
                <div className="max-w-sm">
                  <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {threads.length === 0
                      ? "Start a conversation from any vendor profile."
                      : "Select a conversation."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-border px-6 py-3 bg-card flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/vendors/${activeThread.vendor_id}`}
                      className="font-display text-base hover:text-accent transition-colors"
                    >
                      {activeThread.vendor?.business_name ?? "Vendor"}
                    </Link>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {activeNow ? (
                        <>
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-emerald-600">Active now</span>
                          <span className="opacity-60">·</span>
                        </>
                      ) : null}
                      {activeThread.vendor?.category}
                      {muted ? (
                        <>
                          <span className="opacity-60">·</span>
                          <span className="inline-flex items-center gap-1">
                            <BellOff className="w-3 h-3" />
                            Muted
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        aria-label="Thread options"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={toggleMute}>
                        {muted ? (
                          <>
                            <Bell className="w-3.5 h-3.5 mr-2" />
                            Unmute notifications
                          </>
                        ) : (
                          <>
                            <BellOff className="w-3.5 h-3.5 mr-2" />
                            Mute notifications
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={reportThread}
                        className="text-destructive"
                      >
                        <Flag className="w-3.5 h-3.5 mr-2" />
                        Report
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-1.5">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-12">
                      Say hi — vendors typically reply within a few hours.
                    </p>
                  ) : (
                    renderItems.map((it) => {
                      if (it.kind === "sep") {
                        return (
                          <div
                            key={it.key}
                            className="flex items-center justify-center py-3"
                          >
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              — {it.label} —
                            </span>
                          </div>
                        );
                      }
                      const m = it.message;
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[80%] px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                            it.isMe
                              ? "bg-foreground text-background ml-auto"
                              : "bg-secondary"
                          } ${it.firstInGroup ? "mt-2" : "mt-0.5"} ${
                            it.isMe
                              ? `rounded-2xl ${it.showTail ? "rounded-br-sm" : ""}`
                              : `rounded-2xl ${it.showTail ? "rounded-bl-sm" : ""}`
                          }`}
                        >
                          {m.body}
                          {m.attachments && m.attachments.length > 0 && (
                            <MessageAttachments attachments={m.attachments} />
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-border p-4 space-y-2 bg-card">
                  <ContactInfoWarning body={composer} />
                  <div className="flex items-end gap-2 flex-wrap">
                    <AttachmentPickerButton
                      pending={pendingFiles}
                      onChange={setPendingFiles}
                      disabled={sending}
                    />
                    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-full shrink-0"
                          disabled={sending}
                          aria-label="Quick reactions"
                        >
                          <Smile className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="w-56 p-2"
                      >
                        <div className="grid grid-cols-6 gap-1">
                          {QUICK_EMOJIS.map((e) => (
                            <button
                              key={e}
                              onClick={() => insertEmoji(e)}
                              className="text-xl rounded-md p-1.5 hover:bg-secondary transition-colors"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Textarea
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={2}
                      placeholder="Type a message…  (Cmd+Enter to send)"
                      className="resize-none flex-1 min-w-[180px]"
                    />
                    <Button
                      onClick={send}
                      disabled={
                        sending || (!composer.trim() && pendingFiles.length === 0)
                      }
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90 shrink-0"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
