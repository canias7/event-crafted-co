import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { useInquiryTyping } from "@/hooks/useInquiryTyping";
import { MessageActionMenu } from "@/components/messages/MessageActionMenu";
import {
  MessageReactions,
  type MessageReaction,
} from "@/components/messages/MessageReactions";
import { MessageReplyContext } from "@/components/messages/MessageReplyContext";
import { VoiceRecorder } from "@/components/messages/VoiceRecorder";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Send, Loader2, Star, Sparkles, Paperclip, X, CalendarDays, Smile } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QUICK_EMOJIS, groupMessages } from "@/lib/threadFormatting";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRequireVerifiedEmail } from "@/hooks/useRequireVerifiedEmail";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
// Lazy: only loads when the host clicks "Leave a review."
const ReviewFormModal = lazy(() =>
  import("@/components/reviews/ReviewFormModal").then((m) => ({
    default: m.ReviewFormModal,
  })),
);
import { ProposeAppointmentModal } from "@/components/appointments/ProposeAppointmentModal";
import {
  ProposalCard,
  type Proposal,
  type SignaturePayload,
} from "@/components/proposals/ProposalCard";
import { MessageAttachments } from "@/components/messages/MessageAttachments";
import {
  uploadAttachments,
  validateAttachment,
  ACCEPTED_MIME,
  MAX_FILES,
  type MessageAttachment,
} from "@/lib/messageAttachments";
import { customerNavItems as navItems } from "@/data/navItems";

interface Inquiry {
  id: string;
  vendor_id: string;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  special_requests: string | null;
  status: string;
  created_at: string;
  vendor_read_at: string | null;
  host_read_at: string | null;
  vendor: {
    business_name: string;
    category: string;
  } | null;
}

interface ExistingReview {
  id: string;
  rating: number;
  body: string | null;
  photo_urls?: string[];
}

interface Message {
  id: string;
  body: string;
  sender_role: "host" | "vendor" | "agent";
  created_at: string;
  attachments?: MessageAttachment[];
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
}

const statusStyles: Record<string, string> = {
  new: "bg-accent/15 text-accent border-accent/30",
  drafted: "bg-secondary text-secondary-foreground border-border",
  replied: "bg-foreground text-background border-foreground",
  won: "bg-accent text-accent-foreground border-accent",
  lost: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<string, string> = {
  new: "Awaiting reply",
  drafted: "Vendor drafting",
  replied: "Replied",
  won: "Booked",
  lost: "Closed",
  expired: "Expired",
};

function fmtMoney(c: number | null) {
  return c == null ? "—" : `$${(c / 100).toLocaleString()}`;
}

export default function HostInquiryDetailPage() {
  const { inquiryId } = useParams();
  const { user } = useAuth();
  const requireVerified = useRequireVerifiedEmail();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { otherTyping, broadcastTyping } = useInquiryTyping(
    inquiryId,
    "host",
  );
  const [reactionsByMsg, setReactionsByMsg] = useState<
    Record<string, MessageReaction[]>
  >({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [review, setReview] = useState<ExistingReview | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [acting, setActing] = useState<"accept" | "reject" | null>(null);
  // Thread id is the direct_threads row for this inquiry; mobile uses
  // the same model — see ensure_inquiry_thread RPC. Resolved on load.
  const [threadId, setThreadId] = useState<string | null>(null);

  async function load() {
    if (!inquiryId || !user) return;
    setLoading(true);

    const { data: i, error: iErr } = await supabase
      .from("inquiries")
      .select(
        "id, vendor_id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status, created_at, vendor_read_at, host_read_at, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name, category)",
      )
      .eq("id", inquiryId)
      .maybeSingle();

    if (iErr || !i) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setInquiry(i as unknown as Inquiry);

    // First-time-open: stamp host_read_at so the vendor's "Seen at X"
    // indicator can light up. Fire-and-forget — the page renders even
    // if this write is slow / fails.
    const inq = i as unknown as Inquiry | null;
    if (inq && inq.host_read_at == null) {
      supabase
        .from("inquiries")
        .update({ host_read_at: new Date().toISOString() })
        .eq("id", inquiryId)
        .then(({ error: readErr }) => {
          if (readErr)
            console.error(
              "[HostInquiryDetail] mark-read failed",
              readErr.message,
            );
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tid } = await (supabase as any).rpc("ensure_inquiry_thread", {
      p_inquiry_id: inquiryId,
    });
    const thread = (tid as string | null) ?? null;
    setThreadId(thread);

    if (thread) {
      const { data: msgs } = await supabase
        .from("direct_messages")
        .select(
          "id, body, sender_role, created_at, attachments, edited_at, deleted_at, reply_to_message_id",
        )
        .eq("thread_id", thread)
        .order("created_at", { ascending: true });
      const messageRows = (msgs as unknown as Message[]) ?? [];
      setMessages(messageRows);
      if (messageRows.length > 0) {
        const ids = messageRows.map((m) => m.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rxns } = await (supabase as any)
          .from("direct_message_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", ids);
        const grouped: Record<string, MessageReaction[]> = {};
        for (const r of (rxns as Array<{
          message_id: string;
          user_id: string;
          emoji: string;
        }> | null) ?? []) {
          const list = grouped[r.message_id] ?? [];
          list.push({ user_id: r.user_id, emoji: r.emoji });
          grouped[r.message_id] = list;
        }
        setReactionsByMsg(grouped);
      } else {
        setReactionsByMsg({});
      }
    } else {
      setMessages([]);
      setReactionsByMsg({});
    }

    // Existing review (if any)
    const { data: r } = await supabase
      .from("reviews")
      .select("id, rating, body, photo_urls")
      .eq("inquiry_id", inquiryId)
      .maybeSingle();
    setReview((r as ExistingReview | null) ?? null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: props } = await (supabase as any)
      .from("proposals")
      .select(
        "id, title, line_items, subtotal_cents, deposit_cents, terms, contract_body, status, sent_at, signed_at, signed_name, first_viewed_at, last_viewed_at, view_count",
      )
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false });
    setProposals((props as unknown as Proposal[]) ?? []);

    setLoading(false);
  }

  async function respondProposal(
    p: Proposal,
    action: "accepted" | "rejected",
    signature?: SignaturePayload,
  ) {
    setActing(action === "accepted" ? "accept" : "reject");
    const update: Record<string, unknown> = {
      status: action,
      responded_at: new Date().toISOString(),
    };
    if (signature) {
      update.signed_at = signature.signed_at;
      update.signed_name = signature.signed_name;
      update.signed_user_agent = signature.signed_user_agent;
    }
    // Update payload is dynamic (status + optional signature fields),
    // which the typed update() can't validate. Cast through any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("proposals")
      .update(update)
      .eq("id", p.id);
    setActing(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      action === "accepted"
        ? signature
          ? "Signed and accepted — you're booked."
          : "Proposal accepted — you're booked."
        : "Proposal declined",
    );
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId, user]);

  // Live updates: re-fetch when this thread's messages or this inquiry's
  // status change. Routed through the shared user-scoped channel.
  const messagesConfig = useMemo(
    () =>
      threadId
        ? { table: "direct_messages", filter: `thread_id=eq.${threadId}` }
        : null,
    [threadId],
  );
  useRealtime(messagesConfig, () => load());

  const reactionsConfig = useMemo(
    () =>
      threadId
        ? { table: "direct_message_reactions" as const }
        : null,
    [threadId],
  );
  useRealtime(reactionsConfig, () => load());

  async function toggleReaction(messageId: string, emoji: string) {
    if (!user?.id) return;
    const existing = (reactionsByMsg[messageId] ?? []).find(
      (r) => r.user_id === user.id && r.emoji === emoji,
    );
    setReactionsByMsg((prev) => {
      const next = { ...prev };
      const list = (next[messageId] ?? []).filter(
        (r) => !(r.user_id === user.id && r.emoji === emoji),
      );
      if (!existing) list.push({ user_id: user.id, emoji });
      next[messageId] = list;
      return next;
    });
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("direct_message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("direct_message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji });
    }
  }

  function startEditing(msg: Message) {
    setEditingMessageId(msg.id);
    setEditingDraft(msg.body ?? "");
  }

  function cancelEditing() {
    setEditingMessageId(null);
    setEditingDraft("");
  }

  async function saveEdit(messageId: string) {
    const body = editingDraft.trim();
    if (!body) {
      toast.error("Message can't be empty");
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, body, edited_at: new Date().toISOString() }
          : m,
      ),
    );
    cancelEditing();
    const { error } = await supabase
      .from("direct_messages")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ body } as any)
      .eq("id", messageId);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function deleteMessage(messageId: string) {
    const ok = window.confirm("Delete this message? This can't be undone.");
    if (!ok) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, deleted_at: new Date().toISOString() }
          : m,
      ),
    );
    const { error } = await supabase
      .from("direct_messages")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", messageId);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  const inquiryConfig = useMemo(
    () =>
      inquiryId
        ? { table: "inquiries", event: "UPDATE" as const, filter: `id=eq.${inquiryId}` }
        : null,
    [inquiryId],
  );
  useRealtime(inquiryConfig, () => load());

  function pickFiles(list: FileList) {
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      const err = validateAttachment(f);
      if (err) {
        toast.error(err);
        continue;
      }
      if (pendingFiles.length + accepted.length >= MAX_FILES) {
        toast.error(`Up to ${MAX_FILES} attachments per message`);
        break;
      }
      accepted.push(f);
    }
    setPendingFiles((prev) => [...prev, ...accepted]);
  }

  async function sendMessage() {
    if (
      (!composer.trim() && pendingFiles.length === 0) ||
      !inquiryId ||
      !user ||
      !threadId
    )
      return;
    setSending(true);
    const uploaded =
      pendingFiles.length > 0
        ? await uploadAttachments(pendingFiles, inquiryId, (n, m) =>
            toast.error(`${n}: ${m}`),
          )
        : [];
    const { error } = await supabase.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      sender_role: "host",
      body: composer.trim() || "(attachment)",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: uploaded,
      reply_to_message_id: replyToId,
    } as any);
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComposer("");
    setPendingFiles([]);
    setReplyToId(null);
    load();
  }

  const replyTarget = useMemo(
    () => (replyToId ? messages.find((m) => m.id === replyToId) ?? null : null),
    [replyToId, messages],
  );

  if (notFound) {
    return (
      <div className="flex min-h-screen vendor-canvas">
        <DashboardSidebar items={navItems} title="Customer" backPath="/" />
        <main className="flex-1 pb-20 lg:pb-0 p-8">
          <Link
            to="/customer/inquiries"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to inquiries
          </Link>
          <div className="text-center py-24">
            <p className="font-label text-muted-foreground mb-3">404</p>
            <h1 className="font-editorial text-3xl mb-2">Inquiry not found</h1>
            <p className="text-sm text-muted-foreground">
              This inquiry doesn't exist or you don't have access.
            </p>
          </div>
        </main>
        <MobileNav items={navItems} />
      </div>
    );
  }

  // "Seen" indicator — only fires when the vendor has read past the
  // last outgoing host message.
  const lastOutgoing = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_role === "host") return messages[i];
    }
    return null;
  })();
  const seenAt =
    lastOutgoing && inquiry?.vendor_read_at &&
    new Date(inquiry.vendor_read_at).getTime() >=
      new Date(lastOutgoing.created_at).getTime()
      ? inquiry.vendor_read_at
      : null;
  const seenTimeLabel = seenAt
    ? new Date(seenAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-4 sticky top-0 z-40">
          <Link
            to="/customer/inquiries"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to inquiries
          </Link>
        </div>

        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
          {loading ? (
            <>
              <Skeleton className="h-32 w-full rounded-sm" />
              <Skeleton className="h-48 w-full rounded-sm" />
            </>
          ) : (
            inquiry && (
              <>
                {/* Inquiry summary */}
                <div className="card-soft p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                      <p className="font-label text-muted-foreground">To</p>
                      <h1 className="font-editorial text-3xl">
                        {inquiry.vendor?.business_name ?? "Vendor"}
                      </h1>
                      {inquiry.vendor?.category && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {inquiry.vendor.category}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={statusStyles[inquiry.status] ?? ""}
                    >
                      {statusLabel[inquiry.status] ?? inquiry.status}
                    </Badge>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="font-label text-muted-foreground">Event</p>
                      <p className="text-sm capitalize mt-1">
                        {inquiry.event_type.replace("_", " ")}
                        {inquiry.event_date && (
                          <>
                            {" · "}
                            <span className="tnum">{inquiry.event_date}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="font-label text-muted-foreground">Guests</p>
                      <p className="text-sm tnum mt-1">
                        {inquiry.guest_count ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="font-label text-muted-foreground">Budget</p>
                      <p className="text-sm tnum mt-1">
                        {fmtMoney(inquiry.budget_min_cents)} –{" "}
                        {fmtMoney(inquiry.budget_max_cents)}
                      </p>
                    </div>
                  </div>

                  {inquiry.location && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="font-label text-muted-foreground">
                        Location
                      </p>
                      <p className="text-sm mt-1">{inquiry.location}</p>
                    </div>
                  )}

                  {inquiry.special_requests && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="font-label text-muted-foreground">
                        Your notes
                      </p>
                      <p className="text-sm mt-1 leading-relaxed">
                        {inquiry.special_requests}
                      </p>
                    </div>
                  )}
                </div>

                {/* Review CTA (only on booked inquiries) */}
                {inquiry.status === "won" && (
                  <div className="rounded-2xl bg-card border border-accent/30 bg-accent/5 p-6">
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {review ? (
                          <>
                            <p className="font-display text-base mb-1">
                              You rated{" "}
                              {inquiry.vendor?.business_name ?? "this vendor"}{" "}
                              {review.rating} {review.rating === 1 ? "star" : "stars"}
                            </p>
                            <div className="flex items-center gap-1 mb-2">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-4 h-4 ${
                                    i < review.rating
                                      ? "fill-accent text-accent"
                                      : "text-muted-foreground/30"
                                  }`}
                                />
                              ))}
                            </div>
                            {review.body && (
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                "{review.body}"
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="font-display text-base mb-1">
                              Loved working with{" "}
                              {inquiry.vendor?.business_name ?? "this vendor"}?
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              Leave a review to help future hosts choose with
                              confidence.
                            </p>
                          </>
                        )}
                      </div>
                      <Button
                        onClick={() => {
                          if (!requireVerified("posting a review")) return;
                          setReviewModalOpen(true);
                        }}
                        size="sm"
                        variant={review ? "outline" : "default"}
                        className={`rounded-full whitespace-nowrap ${
                          !review
                            ? "bg-foreground text-background hover:bg-foreground/90"
                            : ""
                        }`}
                      >
                        {review ? "Edit review" : "Leave a review"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Proposals */}
                {proposals.length > 0 && (
                  <div className="space-y-4">
                    {proposals.map((p) => (
                      <ProposalCard
                        key={p.id}
                        proposal={p}
                        canRespond={p.status === "pending"}
                        acting={acting}
                        onAccept={(sig) => respondProposal(p, "accepted", sig)}
                        onReject={() => respondProposal(p, "rejected")}
                      />
                    ))}
                  </div>
                )}

                {/* Thread */}
                <div className="card-soft p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-label text-muted-foreground">
                      Conversation
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAppointmentModalOpen(true)}
                      className="rounded-full h-8 text-xs"
                    >
                      <CalendarDays className="w-3 h-3 mr-1" />
                      Propose meeting
                    </Button>
                  </div>
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No messages yet — your inquiry has been sent and the
                      vendor will reply soon.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {groupMessages(messages, {
                        isMe: (m) => m.sender_role === "host",
                        senderKey: (m) => m.sender_role,
                        createdAt: (m) => m.created_at,
                        id: (m) => m.id,
                      }).map((it) => {
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
                        const isDeleted = m.deleted_at != null;
                        const isEdited = m.edited_at != null && !isDeleted;
                        const msgReactions = reactionsByMsg[m.id] ?? [];
                        return (
                          <div
                            key={m.id}
                            className={`group flex items-end gap-2 ${
                              it.firstInGroup ? "mt-2" : "mt-0.5"
                            } ${it.isMe ? "justify-end" : ""}`}
                          >
                            {!isDeleted && it.isMe ? (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                                <MessageActionMenu
                                  isMine
                                  onReact={(emoji) => toggleReaction(m.id, emoji)}
                                  onReply={() => setReplyToId(m.id)}
                                  onEdit={() => startEditing(m)}
                                  onDelete={() => deleteMessage(m.id)}
                                />
                              </div>
                            ) : null}
                            <div className="flex flex-col">
                              <div
                                className={`max-w-[80%] px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl ${
                                  isDeleted
                                    ? "bg-secondary/60 text-muted-foreground italic"
                                    : it.isMe
                                      ? `bg-foreground text-background ${
                                          it.showTail ? "rounded-br-sm" : ""
                                        }`
                                      : `bg-secondary ${
                                          it.showTail ? "rounded-bl-sm" : ""
                                        }`
                                }`}
                              >
                                {isDeleted ? (
                                  <p>Message deleted</p>
                                ) : (
                                  <>
                                    {m.reply_to_message_id ? (() => {
                                      const parent = messages.find(
                                        (x) => x.id === m.reply_to_message_id,
                                      );
                                      if (!parent) return null;
                                      const parentName =
                                        parent.sender_role === "vendor"
                                          ? inquiry?.vendor?.business_name ?? "Vendor"
                                          : parent.sender_role === "host"
                                            ? "You"
                                            : "Vendora AI";
                                      return (
                                        <MessageReplyContext
                                          authorName={parentName}
                                          body={
                                            parent.deleted_at
                                              ? ""
                                              : parent.body
                                          }
                                          tone="bubble"
                                        />
                                      );
                                    })() : null}
                                    {editingMessageId === m.id ? (
                                      <div className="space-y-2">
                                        <Textarea
                                          value={editingDraft}
                                          onChange={(e) =>
                                            setEditingDraft(e.target.value)
                                          }
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              !e.shiftKey
                                            ) {
                                              e.preventDefault();
                                              saveEdit(m.id);
                                            } else if (e.key === "Escape") {
                                              e.preventDefault();
                                              cancelEditing();
                                            }
                                          }}
                                          rows={2}
                                          autoFocus
                                          className="text-sm bg-background/80 text-foreground rounded-lg min-h-[40px]"
                                        />
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={cancelEditing}
                                            className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => saveEdit(m.id)}
                                            className="text-[11px] font-medium rounded-full px-3 py-1 bg-foreground text-background hover:opacity-90"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p>{m.body}</p>
                                    )}
                                    {m.attachments && m.attachments.length > 0 && (
                                      <MessageAttachments
                                        attachments={m.attachments}
                                      />
                                    )}
                                    {isEdited ? (
                                      <span className="block text-[10px] opacity-60 mt-1">
                                        edited
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              {!isDeleted && msgReactions.length > 0 ? (
                                <MessageReactions
                                  reactions={msgReactions}
                                  currentUserId={user?.id ?? null}
                                  align={it.isMe ? "right" : "left"}
                                  onToggle={(emoji) => toggleReaction(m.id, emoji)}
                                />
                              ) : null}
                            </div>
                            {!isDeleted && !it.isMe ? (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                                <MessageActionMenu
                                  isMine={false}
                                  onReact={(emoji) => toggleReaction(m.id, emoji)}
                                  onReply={() => setReplyToId(m.id)}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {otherTyping ? <HostTypingBubble /> : null}
                      {seenTimeLabel ? (
                        <p className="text-right text-[11px] text-muted-foreground mt-1 mr-1">
                          Seen {seenTimeLabel}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Composer */}
                <div className="card-soft p-6">
                  <p className="font-label text-muted-foreground mb-3">Reply</p>
                  {replyTarget ? (
                    <MessageReplyContext
                      authorName={
                        replyTarget.sender_role === "vendor"
                          ? inquiry?.vendor?.business_name ?? "Vendor"
                          : replyTarget.sender_role === "host"
                            ? "You"
                            : "Vendora AI"
                      }
                      body={replyTarget.deleted_at ? "" : replyTarget.body}
                      tone="composer"
                      onCancel={() => setReplyToId(null)}
                    />
                  ) : null}
                  <Textarea
                    value={composer}
                    onChange={(e) => {
                      setComposer(e.target.value);
                      if (e.target.value.length > 0) broadcastTyping();
                    }}
                    rows={4}
                    placeholder="Write your message…"
                  />
                  {pendingFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {pendingFiles.map((f, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-full text-xs"
                        >
                          {f.name}
                          <button
                            type="button"
                            onClick={() =>
                              setPendingFiles((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                            aria-label="Remove attachment"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending || pendingFiles.length >= MAX_FILES}
                        className="rounded-full text-muted-foreground"
                      >
                        <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                        Attach
                      </Button>
                      <VoiceRecorder
                        disabled={sending || pendingFiles.length >= MAX_FILES}
                        onRecorded={(file) => {
                          const list = new DataTransfer();
                          list.items.add(file);
                          pickFiles(list.files);
                        }}
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
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
                                onClick={() => setComposer((v) => v + e)}
                                className="text-xl rounded-md p-1.5 hover:bg-secondary transition-colors"
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_MIME.join(",")}
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) pickFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={
                        sending ||
                        (!composer.trim() && pendingFiles.length === 0)
                      }
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {inquiry && user && (
        <>
          {reviewModalOpen && (
            <Suspense fallback={null}>
              <ReviewFormModal
                open={reviewModalOpen}
                onOpenChange={setReviewModalOpen}
                inquiryId={inquiry.id}
                vendorId={inquiry.vendor_id}
                hostId={user.id}
                vendorName={inquiry.vendor?.business_name ?? "this vendor"}
                existingReview={review}
                onSuccess={load}
              />
            </Suspense>
          )}
          <ProposeAppointmentModal
            open={appointmentModalOpen}
            onOpenChange={setAppointmentModalOpen}
            inquiryId={inquiry.id}
            vendorId={inquiry.vendor_id}
            hostId={user.id}
            proposedBy="host"
          />
        </>
      )}
    </div>
  );
}

// Three-dot animated typing indicator — mirror of InquiryDetailPage's
// TypingBubble but local to this file so the host page doesn't need
// to import a peer page's component. The styling lines up with the
// incoming-message bubble (bg-card / border-border) used on this side.
function HostTypingBubble() {
  return (
    <div className="flex items-end gap-2 mt-2">
      <div
        className="bg-card border border-border px-3.5 py-2.5 rounded-2xl rounded-bl-sm inline-flex items-end gap-1"
        aria-label="Typing"
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "0s" }} />
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "0.2s" }} />
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "0.4s" }} />
      </div>
    </div>
  );
}
