import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, Loader2, MessageSquare, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactInfoWarning } from "@/components/messages/ContactInfoWarning";
import { detectContactInfo } from "@/lib/contactInfoSignals";
import { customerNavItems as navItems } from "@/data/navItems";
import { formatDate } from "@/lib/format";

interface ThreadRow {
  id: string;
  vendor_id: string;
  last_message_at: string;
  inquiry_id: string | null;
  vendor: { business_name: string; category: string } | null;
}

interface DirectMessage {
  id: string;
  sender_role: "host" | "vendor";
  body: string;
  created_at: string;
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
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    if (!user) return;
    setLoading(true);
    const { data } = await threadsTable()
      .select(
        "id, vendor_id, last_message_at, inquiry_id, vendor:vendor_profiles!direct_threads_vendor_id_fkey(business_name, category)",
      )
      .eq("host_id", user.id)
      .order("last_message_at", { ascending: false });
    setThreads((data as ThreadRow[]) ?? []);
    setLoading(false);
  }

  async function loadMessages(threadId: string) {
    const { data } = await dmsTable()
      .select("id, sender_role, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
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

  // Realtime: live-update active thread + thread list ordering
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`host-dms-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const msg = payload.new as DirectMessage & { thread_id: string };
          if (msg.thread_id === activeThreadId) loadMessages(activeThreadId);
          loadThreads();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeThreadId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  async function send() {
    if (!composer.trim() || !activeThreadId || !user) return;
    setSending(true);
    const flags = detectContactInfo(composer);
    const { error } = await dmsTable().insert({
      thread_id: activeThreadId,
      sender_id: user.id,
      sender_role: "host",
      body: composer.trim(),
      contact_info_flagged: flags.any,
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

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Messages</h1>
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
                <div className="border-b border-border px-6 py-3 bg-card">
                  <Link
                    to={`/vendors/${activeThread.vendor_id}`}
                    className="font-display text-base hover:text-accent transition-colors"
                  >
                    {activeThread.vendor?.business_name ?? "Vendor"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {activeThread.vendor?.category}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-12">
                      Say hi — vendors typically reply within a few hours.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const isMe = m.sender_role === "host";
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[80%] p-3 rounded-sm text-sm leading-relaxed whitespace-pre-wrap ${
                            isMe
                              ? "bg-foreground text-background ml-auto"
                              : "bg-secondary"
                          }`}
                        >
                          {m.body}
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-border p-4 space-y-2 bg-card">
                  <ContactInfoWarning body={composer} />
                  <div className="flex items-end gap-2">
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
                      className="resize-none"
                    />
                    <Button
                      onClick={send}
                      disabled={sending || !composer.trim()}
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
