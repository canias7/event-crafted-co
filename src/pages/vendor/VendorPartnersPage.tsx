import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { vendorNavItems as navItems } from "@/data/navItems";
import { VENDOR_MESSAGES_HUB_TABS } from "@/data/hubTabs";

// Vendor-to-vendor partner messaging — separate from host conversations.
// Mirrors VendorMessagesPage structure but reads from
// vendor_partner_threads / vendor_partner_messages and attributes
// messages to the team's vendor_profile (not the individual user).

interface ThreadRow {
  id: string;
  vendor_a_id: string;
  vendor_b_id: string;
  last_message_at: string;
  vendor_a: { business_name: string | null; category: string | null } | null;
  vendor_b: { business_name: string | null; category: string | null } | null;
}

interface PartnerMessage {
  id: string;
  sender_vendor_id: string;
  body: string;
  created_at: string;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    if (!myVendorId) {
      setLoadingThreads(false);
      return;
    }
    setLoadingThreads(true);
    const { data } = await threadsTable()
      .select(
        "id, vendor_a_id, vendor_b_id, last_message_at, vendor_a:vendor_profiles!vendor_partner_threads_vendor_a_id_fkey(business_name, category), vendor_b:vendor_profiles!vendor_partner_threads_vendor_b_id_fkey(business_name, category)",
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

    const channel = supabase
      .channel(`partner-msgs-${activeThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendor_partner_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        },
        () => loadMessages(activeThreadId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeThreadId]);

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

  const otherVendorName = useMemo(() => {
    const t = threads.find((x) => x.id === activeThreadId);
    if (!t) return null;
    return t.vendor_a_id === myVendorId
      ? t.vendor_b?.business_name
      : t.vendor_a?.business_name;
  }, [threads, activeThreadId, myVendorId]);

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
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.map((m) => {
                      const fromMe = m.sender_vendor_id === myVendorId;
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[80%] rounded-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                            fromMe
                              ? "ml-auto bg-foreground text-background"
                              : "bg-card border border-border"
                          }`}
                        >
                          {m.body}
                          <p
                            className={`text-[10px] mt-1.5 tnum ${
                              fromMe ? "text-background/60" : "text-muted-foreground"
                            }`}
                          >
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-border bg-card p-3">
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
                      className="text-sm mb-2"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={send}
                        disabled={sending || !composer.trim()}
                        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
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
