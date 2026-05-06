import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, Loader2, MessageSquare, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactInfoWarning } from "@/components/messages/ContactInfoWarning";
import { MessageAttachments } from "@/components/messages/MessageAttachments";
import { AttachmentPickerButton } from "@/components/messages/AttachmentPickerButton";
import {
  uploadAttachments,
  type MessageAttachment,
} from "@/lib/messageAttachments";
import { detectContactInfo } from "@/lib/contactInfoSignals";
import { vendorNavItems as navItems } from "@/data/navItems";

// Vendor messaging page — split-screen with Hosts on the left half and
// Partners on the right half. The two columns are fully independent
// (different tables, different active-thread query params, different
// composers); both stay live at the same time so a vendor never has
// to flip a tab to glance at the other inbox.

interface HostThreadRow {
  id: string;
  host_id: string;
  last_message_at: string;
  inquiry_id: string | null;
  host: { display_name: string | null } | null;
}

interface DirectMessage {
  id: string;
  sender_role: "host" | "vendor";
  body: string;
  attachments?: MessageAttachment[];
  created_at: string;
}

interface PartnerThreadRow {
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
const directThreadsTable = () => (supabase as any).from("direct_threads");
const directMessagesTable = () => supabase.from("direct_messages");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const partnerThreadsTable = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).from("vendor_partner_threads");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const partnerMessagesTable = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).from("vendor_partner_messages");

export default function VendorMessagesPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeHostThreadId = searchParams.get("host");
  const activePartnerThreadId = searchParams.get("partner");

  // ─── Host threads ───
  const [hostThreads, setHostThreads] = useState<HostThreadRow[]>([]);
  const [hostLoading, setHostLoading] = useState(true);
  const [hostMessages, setHostMessages] = useState<DirectMessage[]>([]);
  const [hostComposer, setHostComposer] = useState("");
  const [hostPendingFiles, setHostPendingFiles] = useState<File[]>([]);
  const [hostSending, setHostSending] = useState(false);
  const hostMessagesEndRef = useRef<HTMLDivElement>(null);

  // ─── Partner threads ───
  const [partnerThreads, setPartnerThreads] = useState<PartnerThreadRow[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(true);
  const [partnerMessages, setPartnerMessages] = useState<PartnerMessage[]>([]);
  const [partnerComposer, setPartnerComposer] = useState("");
  const [partnerSending, setPartnerSending] = useState(false);
  const partnerMessagesEndRef = useRef<HTMLDivElement>(null);

  function setActive(side: "host" | "partner", threadId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (threadId) next.set(side, threadId);
    else next.delete(side);
    setSearchParams(next, { replace: true });
  }

  // ─── Loaders ───

  async function loadHostThreads() {
    if (!vendorId) {
      setHostLoading(false);
      return;
    }
    setHostLoading(true);
    const { data } = await directThreadsTable()
      .select(
        "id, host_id, last_message_at, inquiry_id, host:profiles!direct_threads_host_id_fkey(display_name)",
      )
      .eq("vendor_id", vendorId)
      .order("last_message_at", { ascending: false });
    setHostThreads((data as HostThreadRow[]) ?? []);
    setHostLoading(false);
  }

  async function loadHostMessages(threadId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (directMessagesTable() as any)
      .select("id, sender_role, body, attachments, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setHostMessages((data as DirectMessage[]) ?? []);
    setTimeout(() => {
      hostMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  async function loadPartnerThreads() {
    if (!vendorId) {
      setPartnerLoading(false);
      return;
    }
    setPartnerLoading(true);
    const { data } = await partnerThreadsTable()
      .select(
        "id, vendor_a_id, vendor_b_id, last_message_at, vendor_a:vendor_profiles!vendor_partner_threads_vendor_a_id_fkey(business_name, category), vendor_b:vendor_profiles!vendor_partner_threads_vendor_b_id_fkey(business_name, category)",
      )
      .or(`vendor_a_id.eq.${vendorId},vendor_b_id.eq.${vendorId}`)
      .order("last_message_at", { ascending: false });
    setPartnerThreads((data as PartnerThreadRow[]) ?? []);
    setPartnerLoading(false);
  }

  async function loadPartnerMessages(threadId: string) {
    const { data } = await partnerMessagesTable()
      .select("id, sender_vendor_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setPartnerMessages((data as PartnerMessage[]) ?? []);
    setTimeout(() => {
      partnerMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  useEffect(() => {
    loadHostThreads();
    loadPartnerThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    if (activeHostThreadId) loadHostMessages(activeHostThreadId);
    else setHostMessages([]);
  }, [activeHostThreadId]);

  useEffect(() => {
    if (activePartnerThreadId) loadPartnerMessages(activePartnerThreadId);
    else setPartnerMessages([]);
  }, [activePartnerThreadId]);

  // ─── Realtime ───

  const hostRealtimeConfig = useMemo(
    () =>
      vendorId ? { table: "direct_messages", event: "INSERT" as const } : null,
    [vendorId],
  );
  useRealtime(hostRealtimeConfig, (payload) => {
    const msg = payload.new as DirectMessage & { thread_id: string };
    if (msg.thread_id === activeHostThreadId)
      loadHostMessages(activeHostThreadId);
    loadHostThreads();
  });

  const partnerRealtimeConfig = useMemo(
    () =>
      activePartnerThreadId
        ? {
            table: "vendor_partner_messages",
            event: "INSERT" as const,
            filter: `thread_id=eq.${activePartnerThreadId}`,
          }
        : null,
    [activePartnerThreadId],
  );
  useRealtime(partnerRealtimeConfig, () => {
    if (activePartnerThreadId) loadPartnerMessages(activePartnerThreadId);
    loadPartnerThreads();
  });

  // ─── Senders ───

  const activeHostThread = useMemo(
    () => hostThreads.find((t) => t.id === activeHostThreadId) ?? null,
    [hostThreads, activeHostThreadId],
  );

  const activePartnerThread = useMemo(
    () => partnerThreads.find((t) => t.id === activePartnerThreadId) ?? null,
    [partnerThreads, activePartnerThreadId],
  );

  const otherPartnerName = useMemo(() => {
    if (!activePartnerThread) return null;
    return activePartnerThread.vendor_a_id === vendorId
      ? activePartnerThread.vendor_b?.business_name
      : activePartnerThread.vendor_a?.business_name;
  }, [activePartnerThread, vendorId]);

  async function sendHost() {
    if (
      (!hostComposer.trim() && hostPendingFiles.length === 0) ||
      !activeHostThreadId ||
      !user
    )
      return;
    setHostSending(true);
    let attachments: MessageAttachment[] = [];
    if (hostPendingFiles.length > 0) {
      attachments = await uploadAttachments(
        hostPendingFiles,
        activeHostThreadId,
        (n, m) => toast.error(`${n}: ${m}`),
      );
    }
    const flags = detectContactInfo(hostComposer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (directMessagesTable() as any).insert({
      thread_id: activeHostThreadId,
      sender_id: user.id,
      sender_role: "vendor",
      body: hostComposer.trim(),
      attachments,
      contact_info_flagged: flags.any,
    });
    setHostSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHostComposer("");
    setHostPendingFiles([]);
    loadHostMessages(activeHostThreadId);
    loadHostThreads();
  }

  async function sendPartner() {
    if (!activePartnerThreadId || !partnerComposer.trim() || !vendorId) return;
    setPartnerSending(true);
    const { error } = await partnerMessagesTable().insert({
      thread_id: activePartnerThreadId,
      sender_vendor_id: vendorId,
      body: partnerComposer.trim(),
    });
    setPartnerSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPartnerComposer("");
    loadPartnerMessages(activePartnerThreadId);
    loadPartnerThreads();
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Messages</h1>
          <p className="text-sm text-muted-foreground">
            Hosts on the left, partner vendors on the right — both inboxes live
            at once.
          </p>
        </div>

        {!vendorId ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <p className="font-display text-xl mb-2">
              Set up your business profile first
            </p>
            <p className="text-sm text-muted-foreground">
              Messages come from your vendor profile — finish that first and
              hosts and partner vendors can reach you here.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 h-[calc(100vh-89px)] divide-y lg:divide-y-0 lg:divide-x divide-border">
            {/* ── Hosts panel ── */}
            <ConversationPanel
              eyebrowIcon={MessageSquare}
              eyebrowLabel="Hosts"
              eyebrowSubtitle="Casual DMs from prospective hosts"
              loading={hostLoading}
              threads={hostThreads.map((t) => ({
                id: t.id,
                title: t.host?.display_name ?? "Anonymous host",
                subtitle: new Date(t.last_message_at).toLocaleDateString(),
                badge: t.inquiry_id ? "Linked to inquiry" : undefined,
              }))}
              activeThreadId={activeHostThreadId}
              onSelectThread={(id) => setActive("host", id)}
              emptyTitle="No host messages yet"
              emptyHint={
                <>
                  Hosts can DM you directly from your profile. For structured
                  leads, check{" "}
                  <Link
                    to="/vendor/inbox"
                    className="text-accent hover:underline"
                  >
                    Inbox
                  </Link>
                  .
                </>
              }
              activeHeader={
                activeHostThread ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-display text-base truncate">
                        {activeHostThread.host?.display_name ??
                          "Anonymous host"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeHostThread.inquiry_id
                          ? "Has a structured inquiry"
                          : "DM only — no inquiry yet"}
                      </p>
                    </div>
                    {activeHostThread.inquiry_id && (
                      <Link
                        to={`/vendor/inbox/${activeHostThread.inquiry_id}`}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full h-8 text-xs"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Open inquiry
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : null
              }
            >
              {activeHostThreadId && (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {hostMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-12">
                        No messages yet.
                      </p>
                    ) : (
                      hostMessages.map((m) => {
                        const isMe = m.sender_role === "vendor";
                        return (
                          <div
                            key={m.id}
                            className={`max-w-[85%] p-3 rounded-sm text-sm leading-relaxed whitespace-pre-wrap ${
                              isMe
                                ? "bg-foreground text-background ml-auto"
                                : "bg-secondary"
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
                    <div ref={hostMessagesEndRef} />
                  </div>
                  <div className="border-t border-border p-3 space-y-2 bg-card">
                    <ContactInfoWarning body={hostComposer} />
                    <div className="flex items-end gap-2 flex-wrap">
                      <AttachmentPickerButton
                        pending={hostPendingFiles}
                        onChange={setHostPendingFiles}
                        disabled={hostSending}
                      />
                      <Textarea
                        value={hostComposer}
                        onChange={(e) => setHostComposer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            sendHost();
                          }
                        }}
                        rows={2}
                        placeholder="Reply to host…  ⌘+Enter"
                        className="resize-none flex-1 min-w-[160px] text-sm"
                      />
                      <Button
                        onClick={sendHost}
                        disabled={
                          hostSending ||
                          (!hostComposer.trim() && hostPendingFiles.length === 0)
                        }
                        className="rounded-full bg-foreground text-background hover:bg-foreground/90 shrink-0"
                      >
                        {hostSending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </ConversationPanel>

            {/* ── Partners panel ── */}
            <ConversationPanel
              eyebrowIcon={Users}
              eyebrowLabel="Partners"
              eyebrowSubtitle="Vendor-to-vendor coordination"
              loading={partnerLoading}
              threads={partnerThreads.map((t) => {
                const other =
                  t.vendor_a_id === vendorId ? t.vendor_b : t.vendor_a;
                return {
                  id: t.id,
                  title: other?.business_name ?? "Vendor",
                  subtitle: `${other?.category ?? ""} · ${new Date(
                    t.last_message_at,
                  ).toLocaleDateString()}`,
                };
              })}
              activeThreadId={activePartnerThreadId}
              onSelectThread={(id) => setActive("partner", id)}
              emptyTitle="No partner threads yet"
              emptyHint="Open a vendor's profile and tap Message vendor to start coordinating."
              activeHeader={
                activePartnerThread ? (
                  <p className="font-display text-base truncate">
                    {otherPartnerName ?? "Partner"}
                  </p>
                ) : null
              }
            >
              {activePartnerThreadId && (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {partnerMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-12">
                        No messages yet.
                      </p>
                    ) : (
                      partnerMessages.map((m) => {
                        const fromMe = m.sender_vendor_id === vendorId;
                        return (
                          <div
                            key={m.id}
                            className={`max-w-[85%] rounded-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                              fromMe
                                ? "ml-auto bg-foreground text-background"
                                : "bg-card border border-border"
                            }`}
                          >
                            {m.body}
                            <p
                              className={`text-[10px] mt-1.5 tnum ${
                                fromMe
                                  ? "text-background/60"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {new Date(m.created_at).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        );
                      })
                    )}
                    <div ref={partnerMessagesEndRef} />
                  </div>
                  <div className="border-t border-border bg-card p-3">
                    <Textarea
                      value={partnerComposer}
                      onChange={(e) => setPartnerComposer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          sendPartner();
                        }
                      }}
                      rows={2}
                      placeholder="Message partner…  ⌘+Enter"
                      className="text-sm mb-2"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={sendPartner}
                        disabled={partnerSending || !partnerComposer.trim()}
                        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                      >
                        {partnerSending ? (
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
            </ConversationPanel>
          </div>
        )}
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

interface ConversationPanelProps {
  eyebrowIcon: typeof MessageSquare;
  eyebrowLabel: string;
  eyebrowSubtitle: string;
  loading: boolean;
  threads: Array<{
    id: string;
    title: string;
    subtitle: string;
    badge?: string;
  }>;
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  emptyTitle: string;
  emptyHint: React.ReactNode;
  activeHeader?: React.ReactNode;
  children?: React.ReactNode;
}

// Generic split-panel surface: left = threads list, right = active
// conversation. Pure presentation — parent owns the data and the
// composer. Same shape used for both Hosts and Partners.
function ConversationPanel({
  eyebrowIcon: EyebrowIcon,
  eyebrowLabel,
  eyebrowSubtitle,
  loading,
  threads,
  activeThreadId,
  onSelectThread,
  emptyTitle,
  emptyHint,
  activeHeader,
  children,
}: ConversationPanelProps) {
  return (
    <div className="grid grid-cols-[200px_1fr] min-w-0">
      <aside className="border-r border-border overflow-y-auto bg-card/30 min-w-0">
        <div className="px-3 py-3 border-b border-border bg-card/50 sticky top-0">
          <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
            <EyebrowIcon className="w-3 h-3" />
            {eyebrowLabel}
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-snug">
            {eyebrowSubtitle}
          </p>
        </div>
        {loading ? (
          <div className="p-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-sm" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs font-medium mb-1.5">{emptyTitle}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {emptyHint}
            </p>
          </div>
        ) : (
          <ul>
            {threads.map((t) => {
              const isActive = t.id === activeThreadId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(t.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors ${
                      isActive ? "bg-secondary" : "hover:bg-secondary/40"
                    }`}
                  >
                    <p className="text-xs font-medium truncate">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {t.subtitle}
                    </p>
                    {t.badge && (
                      <p className="text-[9px] text-accent mt-1 uppercase tracking-wide">
                        {t.badge}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="flex flex-col min-w-0">
        {!activeThreadId ? (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <p className="text-xs text-muted-foreground">
              Select a conversation.
            </p>
          </div>
        ) : (
          <>
            {activeHeader && (
              <div className="border-b border-border px-4 py-3 bg-card">
                {activeHeader}
              </div>
            )}
            {children}
          </>
        )}
      </section>
    </div>
  );
}
