import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
// Mirrors VendorMessagesPage structure but reads from
// vendor_partner_threads / vendor_partner_messages and attributes
// messages to the team's vendor_profile (not the individual user).

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
  vendor_a_id: string;
  vendor_b_id: string;
  last_message_at: string;
  vendor_a: {
    business_name: string | null;
    category: string | null;
    user_id: string | null;
  } | null;
  vendor_b: {
    business_name: string | null;
    category: string | null;
    user_id: string | null;
  } | null;
}

interface PartnerMessage {
  id: string;
  sender_vendor_id: string;
  body: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const threadsTable = () => (supabase as any).from("vendor_partner_threads");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgsTable = () => (supabase as any).from("vendor_partner_messages");

export default function VendorPartnersPage() {
  const { user, vendorMemberships } = useAuth();
  const myVendorId = vendorMemberships[0]?.vendor_id ?? null;
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
    if (!myVendorId) {
      setLoadingThreads(false);
      return;
    }
    setLoadingThreads(true);
    const { data } = await threadsTable()
      .select(
        "id, vendor_a_id, vendor_b_id, last_message_at, vendor_a:vendor_profiles!vendor_partner_threads_vendor_a_id_fkey(business_name, category, user_id), vendor_b:vendor_profiles!vendor_partner_threads_vendor_b_id_fkey(business_name, category, user_id)",
      )
      .or(`vendor_a_id.eq.${myVendorId},vendor_b_id.eq.${myVendorId}`)
      .order("last_message_at", { ascending: false });
    setThreads((data as ThreadRow[]) ?? []);
    setLoadingThreads(false);
  }

  async function loadMessages(threadId: string) {
    const { data } = await msgsTable()
      .select("id, sender_vendor_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data as PartnerMessage[]) ?? []);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  useEffect(() => {
    if (user && myVendorId) loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, myVendorId]);

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
    if (!activeThreadId || !composer.trim() || !myVendorId) return;
    setSending(true);
    const { error } = await msgsTable().insert({
      thread_id: activeThreadId,
      sender_vendor_id: myVendorId,
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
    return activeThread.vendor_a_id === myVendorId
      ? activeThread.vendor_b?.business_name
      : activeThread.vendor_a?.business_name;
  }, [activeThread, myVendorId]);

  const otherVendorUserId = useMemo(() => {
    if (!activeThread) return null;
    return activeThread.vendor_a_id === myVendorId
      ? activeThread.vendor_b?.user_id ?? null
      : activeThread.vendor_a?.user_id ?? null;
  }, [activeThread, myVendorId]);

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
      const isMe = m.sender_vendor_id === myVendorId;
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
        next.sender_vendor_id === m.sender_vendor_id &&
        isSameDay(m.created_at, next.created_at);
      items.push({
        kind: "msg",
        message: m,
        isMe,
        showTail: !sameSenderNext,
        firstInGroup: lastSender !== m.sender_vendor_id,
      });
      lastIso = m.created_at;
      lastSender = m.sender_vendor_id;
    });
    return items;
  }, [messages, myVendorId]);

  function insertEmoji(e: string) {
    setComposer((v) => v + e);
    setEmojiOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-display text-xl">Partner messages</h1>
            <p className="text-sm text-muted-foreground">
              Coordinate directly with other vendors on shared events — no
              host needed in the loop.
            </p>
          </div>
          <SubNavTabs tabs={VENDOR_MESSAGES_HUB_TABS} />
        </div>

        {!myVendorId ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <p className="font-display text-xl mb-2">
              Set up your business profile first
            </p>
            <p className="text-sm text-muted-foreground">
              Partner messages come from your vendor profile — finish that
              first and partners can reach you here.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[280px_1fr] h-[calc(100vh-65px)]">
            <aside className="border-r border-border overflow-y-auto bg-card/30">
              {loadingThreads ? (
                <div className="p-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-sm" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium mb-2">No partner threads yet</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Open a vendor's profile and tap "Message vendor" to
                    start coordinating directly.
                  </p>
                </div>
              ) : (
                <ul>
                  {threads.map((t) => {
                    const isActive = t.id === activeThreadId;
                    const other =
                      t.vendor_a_id === myVendorId ? t.vendor_b : t.vendor_a;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSearchParams({ thread: t.id }, { replace: true })
                          }
                          className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors ${
                            isActive ? "bg-secondary" : "hover:bg-secondary/40"
                          }`}
                        >
                          <p className="text-sm font-medium truncate">
                            {other?.business_name ?? "Vendor"}
                          </p>
                          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                            {other?.category ?? ""} · last activity{" "}
                            <span className="tnum">
                              {new Date(t.last_message_at).toLocaleDateString()}
                            </span>
                          </p>
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

      <p className="hidden">
        <Link to="/vendor/messages">Back to host messages</Link>
      </p>
    </div>
  );
}
