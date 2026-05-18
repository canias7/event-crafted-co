import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Loader2, MessageSquare, Smile } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { vendorNavItems as navItems } from "@/data/navItems";
import { VENDOR_MESSAGES_HUB_TABS } from "@/data/hubTabs";

// Vendor-to-vendor partner messaging — separate from host conversations.
// Threads are keyed on profiles.id (the user account) so a vendor with
// zero listings can still participate. Other-side identity (business
// name, logo) is read from the partner's profiles row, mirroring how
// the public nav already renders the brand.

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

interface ProfileBrand {
  business_name: string | null;
  logo_url: string | null;
}

interface ThreadRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string;
  user_a: ProfileBrand | null;
  user_b: ProfileBrand | null;
  last_preview: { body: string; sender_user_id: string } | null;
}

interface PartnerMessage {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const threadsTable = () => (supabase as any).from("vendor_partner_threads");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgsTable = () => (supabase as any).from("vendor_partner_messages");

export default function VendorPartnersPage() {
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeThreadId = searchParams.get("thread");

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeNow, setActiveNow] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    if (!myUserId) {
      setLoadingThreads(false);
      return;
    }
    setLoadingThreads(true);
    const { data } = await threadsTable()
      .select(
        "id, user_a_id, user_b_id, last_message_at, user_a:profiles!vendor_partner_threads_user_a_id_fkey(business_name, logo_url), user_b:profiles!vendor_partner_threads_user_b_id_fkey(business_name, logo_url)",
      )
      .or(`user_a_id.eq.${myUserId},user_b_id.eq.${myUserId}`)
      .order("last_message_at", { ascending: false });
    const rows = (data as ThreadRow[]) ?? [];
    // Fetch the latest message body for each thread so the row can
    // show an iMessage-style preview. One query, ordered desc, then
    // pick the first row we see per thread_id.
    const lastBy = new Map<
      string,
      { body: string; sender_user_id: string }
    >();
    if (rows.length > 0) {
      const ids = rows.map((t) => t.id);
      const { data: msgs } = await msgsTable()
        .select("thread_id, body, sender_user_id, created_at")
        .in("thread_id", ids)
        .order("created_at", { ascending: false });
      for (const m of (msgs as Array<{
        thread_id: string;
        body: string;
        sender_user_id: string;
      }>) ?? []) {
        if (!lastBy.has(m.thread_id)) {
          lastBy.set(m.thread_id, {
            body: m.body,
            sender_user_id: m.sender_user_id,
          });
        }
      }
    }
    setThreads(
      rows.map((t) => ({ ...t, last_preview: lastBy.get(t.id) ?? null })),
    );
    setLoadingThreads(false);
  }

  async function loadMessages(threadId: string) {
    const { data } = await msgsTable()
      .select("id, sender_user_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data as PartnerMessage[]) ?? []);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  useEffect(() => {
    if (user && myUserId) loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, myUserId]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    loadMessages(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  // Realtime: live-update the open partner thread via shared channel.
  const partnerMsgConfig = useMemo(
    () =>
      activeThreadId
        ? {
            table: "vendor_partner_messages",
            event: "INSERT" as const,
            filter: `thread_id=eq.${activeThreadId}`,
          }
        : null,
    [activeThreadId],
  );
  useRealtime(partnerMsgConfig, () => {
    if (activeThreadId) loadMessages(activeThreadId);
  });

  async function send() {
    if (!activeThreadId || !composer.trim() || !myUserId) return;
    setSending(true);
    const { error } = await msgsTable().insert({
      thread_id: activeThreadId,
      sender_user_id: myUserId,
      body: composer.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComposer("");
    loadMessages(activeThreadId);
    loadThreads();
  }

  const activeThread = useMemo(
    () => threads.find((x) => x.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const otherVendorName = useMemo(() => {
    if (!activeThread) return null;
    return activeThread.user_a_id === myUserId
      ? activeThread.user_b?.business_name
      : activeThread.user_a?.business_name;
  }, [activeThread, myUserId]);

  const otherVendorUserId = useMemo(() => {
    if (!activeThread) return null;
    return activeThread.user_a_id === myUserId
      ? activeThread.user_b_id
      : activeThread.user_a_id;
  }, [activeThread, myUserId]);

  // Active-now polling — get_user_last_seen RPC every 30s, same as
  // the host / vendor messages pages.
  useEffect(() => {
    if (!otherVendorUserId) {
      setActiveNow(false);
      return;
    }
    let cancelled = false;
    async function tick() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("get_user_last_seen", {
        p_user_id: otherVendorUserId,
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
  }, [otherVendorUserId]);

  type RenderItem =
    | { kind: "sep"; label: string; key: string }
    | {
        kind: "msg";
        message: PartnerMessage;
        isMe: boolean;
        showTail: boolean;
        firstInGroup: boolean;
      };

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    let lastIso: string | null = null;
    let lastSender: string | null = null;
    messages.forEach((m, i) => {
      const isMe = m.sender_user_id === myUserId;
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
        next.sender_user_id === m.sender_user_id &&
        isSameDay(m.created_at, next.created_at);
      items.push({
        kind: "msg",
        message: m,
        isMe,
        showTail: !sameSenderNext,
        firstInGroup: lastSender !== m.sender_user_id,
      });
      lastIso = m.created_at;
      lastSender = m.sender_user_id;
    });
    return items;
  }, [messages, myUserId]);

  function insertEmoji(e: string) {
    setComposer((v) => v + e);
    setEmojiOpen(false);
  }

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-editorial text-3xl">Vendor messages</h1>
            <p className="text-sm text-muted-foreground">
              Chat with other vendors directly — no host in the loop.
            </p>
          </div>
          <SubNavTabs tabs={VENDOR_MESSAGES_HUB_TABS} />
        </div>

        {!myUserId ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <p className="font-display text-xl mb-2">Sign in to continue</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[360px_1fr] h-[calc(100vh-65px)]">
            <aside className="border-r border-border overflow-y-auto p-3">
              {loadingThreads ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-2xl" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="bg-card rounded-2xl card-shadow py-12 px-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                    <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="font-display text-lg">No partner threads yet</p>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    Open a vendor's profile and tap "Message vendor" to
                    start coordinating directly.
                  </p>
                </div>
              ) : (
                <ul
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,253,250,0.6)",
                    border: "0.5px solid rgba(255,138,76,0.18)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                  }}
                >
                  {threads.map((t, i) => {
                    const isActive = t.id === activeThreadId;
                    const isFirst = i === 0;
                    const other =
                      t.user_a_id === myUserId ? t.user_b : t.user_a;
                    const name = other?.business_name?.trim() || "Vendor";
                    const initial = name.charAt(0).toUpperCase();
                    const preview = t.last_preview
                      ? `${
                          t.last_preview.sender_user_id === myUserId
                            ? "You: "
                            : ""
                        }${t.last_preview.body}`
                      : "No messages yet";
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSearchParams({ thread: t.id }, { replace: true })
                          }
                          className={`w-full text-left flex items-stretch gap-3 px-4 py-3 transition-colors ${
                            isActive ? "bg-white/70" : "hover:bg-white/40"
                          } ${isFirst ? "" : "border-t border-foreground/[0.06]"}`}
                        >
                          {other?.logo_url ? (
                            <img
                              src={other.logo_url}
                              alt=""
                              className="shrink-0 w-11 h-11 rounded-full object-cover self-center"
                            />
                          ) : (
                            <span
                              className="shrink-0 w-11 h-11 rounded-full inline-flex items-center justify-center font-semibold self-center"
                              style={{
                                background: "rgba(255,138,76,0.18)",
                                color: "#c4541e",
                              }}
                              aria-hidden
                            >
                              {initial}
                            </span>
                          )}

                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-foreground">
                              {name}
                            </span>
                            <p className="mt-0.5 text-[13px] text-muted-foreground leading-snug truncate">
                              {preview}
                            </p>
                          </div>

                          <span className="shrink-0 text-[11px] text-muted-foreground self-start tnum">
                            {relativeTime(t.last_message_at)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            <section className="flex flex-col">
              {!activeThreadId ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
                  Select a thread to view messages
                </div>
              ) : (
                <>
                  <div className="border-b border-border bg-card px-4 py-3">
                    <p className="font-display text-base">
                      {otherVendorName ?? "Partner"}
                    </p>
                    {activeNow ? (
                      <p className="text-xs flex items-center gap-1.5 mt-0.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-emerald-600">Active now</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                    {renderItems.map((it) => {
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
                              ? "ml-auto bg-foreground text-background"
                              : "bg-card border border-border"
                          } ${it.firstInGroup ? "mt-2" : "mt-0.5"} ${
                            it.isMe
                              ? `rounded-2xl ${it.showTail ? "rounded-br-sm" : ""}`
                              : `rounded-2xl ${it.showTail ? "rounded-bl-sm" : ""}`
                          }`}
                        >
                          {m.body}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-border bg-card p-3">
                    <div className="flex items-end gap-2 flex-wrap">
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
                        placeholder="Type a message…  ⌘ + Enter to send"
                        className="text-sm flex-1 min-w-[180px]"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={send}
                        disabled={sending || !composer.trim()}
                        className="rounded-full bg-foreground text-background hover:bg-foreground/90 shrink-0"
                      >
                        {sending ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Send
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
