import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { useInquiryTyping } from "@/hooks/useInquiryTyping";
import { MessageActionMenu } from "@/components/messages/MessageActionMenu";
import {
  MessageReactions,
  type MessageReaction,
} from "@/components/messages/MessageReactions";
import { MessageReplyContext } from "@/components/messages/MessageReplyContext";
import { VoiceRecorder } from "@/components/messages/VoiceRecorder";
import { TemplatePicker } from "@/components/messages/TemplatePicker";
import { PinLocationDialog } from "@/components/messages/PinLocationDialog";
import { MessageBody } from "@/components/messages/MessageBody";
import { TypingBubble } from "@/components/messages/TypingBubble";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  CheckCheck,
  Info,
  MapPin,
  X,
  RotateCcw,
  Send,
  Loader2,
  Smile,
} from "lucide-react";
import { groupMessages } from "@/lib/threadFormatting";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Lazy: only loads when the vendor opens "Send proposal."
const ProposalFormModal = lazy(() =>
  import("@/components/proposals/ProposalFormModal").then((m) => ({
    default: m.ProposalFormModal,
  })),
);
import {
  InquiryReviewCard,
  type ReviewWithResponse,
} from "@/components/inquiries/InquiryReviewCard";
import {
  ProposalCard,
  type Proposal,
} from "@/components/proposals/ProposalCard";
import { ProposalShareToggle } from "@/components/proposals/ProposalShareToggle";
import { ProposeAppointmentModal } from "@/components/appointments/ProposeAppointmentModal";
import { MessageAttachments } from "@/components/messages/MessageAttachments";
import {
  uploadAttachments,
  validateAttachment,
  ACCEPTED_MIME,
  MAX_FILES,
  type MessageAttachment,
} from "@/lib/messageAttachments";
import { FileText, Paperclip, CalendarDays, Eye } from "lucide-react";
import { toast } from "sonner";

interface Inquiry {
  id: string;
  host_id: string;
  vendor_id: string;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  special_requests: string | null;
  intake_answers: Record<string, string | string[] | boolean> | null;
  status: string;
  quality_score: number | null;
  intent_score: number | null;
  recommended_verification: string | null;
  vendor_read_at: string | null;
  host_read_at: string | null;
  host: { display_name: string | null; avatar_url: string | null } | null;
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

// localStorage key for the in-flight draft, scoped per inquiry so two
// open tabs don't clobber each other.
function draftKey(inquiryId: string | undefined): string | null {
  return inquiryId ? `vendora.inquiry-draft.${inquiryId}` : null;
}

function fmtMoney(c: number | null) {
  return c == null ? "—" : `$${(c / 100).toLocaleString()}`;
}

export default function InquiryDetailPage() {
  const { inquiryId } = useParams();
  const { user } = useAuth();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [review, setReview] = useState<ReviewWithResponse | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [pinLocationOpen, setPinLocationOpen] = useState(false);
  // Inquiry preview sheet — opened from the "..." menu, shows the
  // full original inquiry on a blurred backdrop. Tap the close arrow
  // to return to the chat.
  const [inquiryPreviewOpen, setInquiryPreviewOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  // reactionsByMsg: map of message_id → array of {user_id, emoji}.
  // Refetched whenever messages reload + on the realtime sub below.
  const [reactionsByMsg, setReactionsByMsg] = useState<
    Record<string, MessageReaction[]>
  >({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const { otherTyping, broadcastTyping } = useInquiryTyping(
    inquiryId,
    "vendor",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user is currently anchored near the bottom of
  // the thread. New messages auto-scroll only when this is true —
  // we don't yank a user back down while they're reading history.
  const wasAtBottomRef = useRef(true);
  const hasLoadedRef = useRef(false);
  // Per-(message, emoji) lock for reaction toggles — see toggleReaction.
  const togglesInFlightRef = useRef<Set<string>>(new Set());
  // Track whether we've already rehydrated the draft for the active
  // inquiry — without this, the first effect-run overwrites the
  // freshly-loaded localStorage value with an empty string.
  const draftHydratedRef = useRef<string | null>(null);

  // Rehydrate any in-flight draft from localStorage on inquiry change.
  useEffect(() => {
    if (!inquiryId) return;
    if (draftHydratedRef.current === inquiryId) return;
    draftHydratedRef.current = inquiryId;
    const key = draftKey(inquiryId);
    if (!key) return;
    try {
      const v = window.localStorage.getItem(key);
      if (v) setComposer(v);
    } catch {
      /* private mode / quota — fall back to empty composer */
    }
  }, [inquiryId]);

  // Persist the draft on every keystroke (no debounce — localStorage
  // is cheap and the user's typing is the canonical source of truth).
  useEffect(() => {
    const key = draftKey(inquiryId);
    if (!key) return;
    if (draftHydratedRef.current !== inquiryId) return;
    try {
      if (composer) window.localStorage.setItem(key, composer);
      else window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [composer, inquiryId]);

  // Auto-grow the composer textarea up to max-h-32 (128px). HTML's
  // <textarea rows={1}> stays at one row by default — content past
  // that scrolls in place, which is exactly the "chatbox breaks"
  // behavior the host saw on long messages.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [composer]);

  // Auto-scroll to the bottom — but only when the user is anchored
  // near the bottom. If they've scrolled up to read history, hold
  // their position so the next realtime tick doesn't yank them
  // back. First paint always anchors at the bottom.
  useEffect(() => {
    if (!messagesEndRef.current) return;
    if (!wasAtBottomRef.current && hasLoadedRef.current) return;
    messagesEndRef.current.scrollIntoView({
      behavior: hasLoadedRef.current ? "smooth" : "auto",
      block: "end",
    });
  }, [messages.length, otherTyping]);

  // useCallback so the realtime hook below sees a stable reference
  // across renders; without this, every render replaces the realtime
  // subscription's callback and the previous binding's cleanup path
  // can drift on rapid open/close cycles, slowly leaking listeners.
  const load = useCallback(async () => {
    if (!inquiryId) return;
    // Four queries up front — all keyed only on inquiryId — fire in
    // parallel. messages still has to wait on the RPC's thread id, so
    // it goes in a second hop. Cuts page-open latency roughly in half
    // versus the previous fully-sequential chain.
    const [inqRes, threadRes, reviewRes, propsRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select("*, host:profiles!inquiries_host_id_fkey(display_name, avatar_url)")
        .eq("id", inquiryId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("ensure_inquiry_thread", {
        p_inquiry_id: inquiryId,
      }),
      supabase
        .from("reviews")
        .select(
          "id, vendor_id, rating, body, created_at, response:review_responses(body, updated_at)",
        )
        .eq("inquiry_id", inquiryId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("proposals")
        .select(
          "id, title, line_items, subtotal_cents, deposit_cents, terms, contract_body, status, sent_at, signed_at, signed_name, first_viewed_at, last_viewed_at, view_count, share_token",
        )
        .eq("inquiry_id", inquiryId)
        .order("created_at", { ascending: false }),
    ]);

    const i = inqRes.data;
    setInquiry(i as unknown as Inquiry);

    // First-time-open: stamp vendor_read_at so the inbox unread dot
    // turns off. Fire-and-forget so the page renders even if the
    // write is slow / fails; the next visit will retry.
    const inq = i as unknown as Inquiry | null;
    if (inq && inq.vendor_read_at == null) {
      supabase
        .from("inquiries")
        .update({ vendor_read_at: new Date().toISOString() })
        .eq("id", inquiryId)
        .then(({ error: readErr }) => {
          if (readErr)
            console.error("[InquiryDetail] mark-read failed", readErr.message);
        });
    }

    const thread = (threadRes.data as string | null) ?? null;
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
      // Reactions: one query for all messages in this thread.
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

    const reviewRow = reviewRes.data;
    if (reviewRow) {
      const normalized: ReviewWithResponse = {
        id: reviewRow.id,
        vendor_id: reviewRow.vendor_id,
        rating: reviewRow.rating,
        body: reviewRow.body,
        created_at: reviewRow.created_at,
        response: Array.isArray(reviewRow.response)
          ? reviewRow.response[0] ?? null
          : (reviewRow.response ?? null),
      };
      setReview(normalized);
    } else {
      setReview(null);
    }

    setProposals((propsRes.data as unknown as Proposal[]) ?? []);

    hasLoadedRef.current = true;
    setLoading(false);
  }, [inquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: re-fetch on direct_messages for this thread + inquiry
  // status changes. Mobile uses the same model — see ensure_inquiry_thread.
  const messagesConfig = useMemo(
    () =>
      threadId
        ? { table: "direct_messages", filter: `thread_id=eq.${threadId}` }
        : null,
    [threadId],
  );
  useRealtime(messagesConfig, load);

  // Reactions live in their own table; the shared user channel
  // delivers events that pass RLS, so refetching the whole inquiry
  // on every reaction change is fine.
  const reactionsConfig = useMemo(
    () =>
      threadId
        ? { table: "direct_message_reactions" as const }
        : null,
    [threadId],
  );
  useRealtime(reactionsConfig, load);

  const inquiryConfig = useMemo(
    () =>
      inquiryId
        ? { table: "inquiries", event: "UPDATE" as const, filter: `id=eq.${inquiryId}` }
        : null,
    [inquiryId],
  );
  useRealtime(inquiryConfig, load);

  // Toggle a reaction on a message: if I already reacted with this
  // emoji, remove it; otherwise insert. Optimistic local update keeps
  // the chip count responsive; the realtime sub corrects any drift
  // (e.g. if the other side reacted in between).
  async function toggleReaction(messageId: string, emoji: string) {
    if (!user?.id) return;
    // Per-(message, emoji) lock: rapid double-taps in the same
    // render snapshot used to both observe `existing` and race
    // to .insert() (PK violation, silent inconsistency).
    const lockKey = `${messageId}:${emoji}`;
    if (togglesInFlightRef.current.has(lockKey)) return;
    togglesInFlightRef.current.add(lockKey);
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
    try {
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
    } finally {
      togglesInFlightRef.current.delete(lockKey);
    }
  }

  // Soft-delete an outgoing message. The bubble shows "Message
  // deleted" in its place; reactions and attachments hide. On
  // failure we revert the optimistic local strike-through so the
  // sender's view doesn't diverge from the recipient's until the
  // next realtime tick.
  async function deleteMessage(messageId: string) {
    const ok = window.confirm("Delete this message? This can't be undone.");
    if (!ok) return;
    const before = messages.find((m) => m.id === messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m,
      ),
    );
    const { error } = await supabase
      .from("direct_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId);
    if (error) {
      toast.error(error.message);
      if (before) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? before : m)),
        );
      }
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
    const before = messages.find((m) => m.id === messageId);
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
      .update({ body })
      .eq("id", messageId);
    if (error) {
      toast.error(error.message);
      if (before) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? before : m)),
        );
      }
    }
  }

  // Memoize the grouped-with-separators array so we don't redo the
  // pass on every realtime tick / typing-indicator flip.
  const groupedItems = useMemo(
    () =>
      groupMessages(messages, {
        isMe: (m) =>
          m.sender_role === "vendor" || m.sender_role === "agent",
        senderKey: (m) =>
          m.sender_role === "agent" ? "vendor" : m.sender_role,
        createdAt: (m) => m.created_at,
        id: (m) => m.id,
      }),
    [messages],
  );

  const replyTarget = useMemo(
    () => (replyToId ? messages.find((m) => m.id === replyToId) ?? null : null),
    [replyToId, messages],
  );

  async function transitionToReplied() {
    if (!inquiry || !inquiryId) return;
    if (inquiry.status !== "new" && inquiry.status !== "drafted") return;
    const { error } = await supabase
      .from("inquiries")
      .update({ status: "replied" })
      .eq("id", inquiryId);
    if (error) {
      // Don't toast — this is a background transition triggered by
      // sending a message. The message itself already went through; a
      // status-update failure is purely housekeeping that the next
      // realtime tick will re-attempt. Log so we'd notice in Sentry.
      console.error("[InquiryDetail] transitionToReplied failed", error.message);
    }
  }

  async function setStatus(next: "won" | "lost" | "replied") {
    if (!inquiryId) return;
    setStatusUpdating(true);
    const { error } = await supabase
      .from("inquiries")
      .update({ status: next })
      .eq("id", inquiryId);
    setStatusUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      next === "won"
        ? "Marked as booked"
        : next === "lost"
          ? "Marked as closed"
          : "Reopened",
    );
    load();
  }

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

  // Drop a single canned body into the thread without going through the
  // composer (used by quick-action chips like "Pin location"). Keeps
  // the composer's pending state and reply target intact.
  async function sendBody(body: string) {
    if (!body.trim() || !inquiryId || !user || !threadId) return;
    const { error } = await supabase.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      sender_role: "vendor",
      body: body.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    await transitionToReplied();
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
    // Attachment-only message where every upload failed: don't post a
    // "(attachment)" body with no actual files. The per-file errors
    // were already toasted by the upload callback; keep the composer
    // intact so the vendor can retry or remove the failed files.
    if (
      pendingFiles.length > 0 &&
      uploaded.length === 0 &&
      !composer.trim()
    ) {
      setSending(false);
      toast.error("Couldn't upload your attachments — message not sent.");
      return;
    }
    const { error } = await supabase.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      sender_role: "vendor",
      body: composer.trim() || "(attachment)",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: uploaded,
      reply_to_message_id: replyToId,
    } as any);
    if (error) {
      setSending(false);
      return toast.error(error.message);
    }
    await transitionToReplied();
    setComposer("");
    setPendingFiles([]);
    setReplyToId(null);
    // Drop the draft now that the message landed.
    const key = draftKey(inquiryId);
    if (key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    setSending(false);
    // No explicit load() — the messages realtime subscription will
    // pick up the INSERT we just made. Skips a redundant full
    // refetch of inquiry+thread+messages+reactions+proposals.
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!inquiry) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Inquiry not found
      </div>
    );
  }

  const isClosed = inquiry.status === "won" || inquiry.status === "lost";
  const hostName = inquiry.host?.display_name?.trim() || "Host";
  const initial = hostName.charAt(0).toUpperCase();

  // "Seen" indicator: surface under the last outgoing (vendor/agent)
  // message when the host has read past it. Stamping happens host-side
  // — we just read it back.
  const lastOutgoing = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender_role === "vendor" || m.sender_role === "agent") return m;
    }
    return null;
  })();
  const seenAt =
    lastOutgoing && inquiry.host_read_at &&
    new Date(inquiry.host_read_at).getTime() >=
      new Date(lastOutgoing.created_at).getTime()
      ? inquiry.host_read_at
      : null;
  const seenTimeLabel = seenAt
    ? new Date(seenAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen vendor-canvas flex flex-col">
      {/* ─── Sticky chat header ─────────────────────────────────────────
          Liquid-glass header: pill-shaped back button + avatar w/
          online dot + name + "{event_type} inquiry · {date}" subtitle
          + pill-shaped info button on the right. Info button opens the
          actions dropdown (View inquiry / Close-or-Reopen). */}
      <div
        className="sticky top-0 z-40 px-4 md:px-6 py-3 backdrop-blur-md"
        style={{
          background: "rgba(255,253,250,0.85)",
          borderBottom: "0.5px solid rgba(255,138,76,0.18)",
        }}
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <Link
            to="/vendor/inbox"
            aria-label="Back to inbox"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-sm border border-border/40 text-foreground/80 hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="relative shrink-0">
            {inquiry.host?.avatar_url ? (
              <img
                src={inquiry.host.avatar_url}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
                aria-hidden
              />
            ) : (
              <span
                className="w-10 h-10 rounded-full inline-flex items-center justify-center font-semibold"
                style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
                aria-hidden
              >
                {initial}
              </span>
            )}
            {/* Static "active" indicator. We don't track presence yet,
                so anyone whose chat is open gets the dot — the host
                appears reachable, the chat feels alive. */}
            <span
              aria-hidden
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#fffdfa]"
            />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-medium text-foreground truncate">{hostName}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {inquiry.event_type
                ? `${inquiry.event_type.charAt(0).toUpperCase()}${inquiry.event_type.slice(1)} inquiry`
                : "Inquiry"}
              {inquiry.event_date
                ? ` · ${new Date(inquiry.event_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}`
                : ""}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Inquiry details"
                className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-sm border border-border/40 text-foreground/80 hover:bg-white"
              >
                <Info className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => setInquiryPreviewOpen(true)}
                className="cursor-pointer"
              >
                <Eye className="w-4 h-4 mr-2" />
                View inquiry
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isClosed ? (
                <DropdownMenuItem
                  disabled={statusUpdating}
                  onClick={() => setStatus("replied")}
                  className="cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reopen inquiry
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={statusUpdating}
                  onClick={() => setStatus("lost")}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <X className="w-4 h-4 mr-2" />
                  Close inquiry
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Chat thread (scrolling area) ────────────────────────────── */}
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          // 80px slack — small upward scroll still counts as "at the
          // bottom" so a one-line read doesn't suppress auto-scroll
          // for the next reply.
          wasAtBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-5"
      >
        <div className="max-w-3xl mx-auto space-y-1.5">
          {/* Pinned: the original inquiry, rendered as the host's
              "opening message" so the thread starts with their ask. A
              small NEW INQUIRY chip sits above the bubble to flag that
              this is the host's original brief, not a regular reply. */}
          {inquiry.special_requests && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-background/90 backdrop-blur-sm border border-border/40 text-foreground/70 rounded-full px-2.5 py-1 shadow-sm">
                  <Sparkles className="w-3 h-3 text-accent" />
                  New inquiry
                </span>
              </div>
              <div className="flex items-end gap-2">
                {inquiry.host?.avatar_url ? (
                  <img
                    src={inquiry.host.avatar_url}
                    alt=""
                    className="shrink-0 w-6 h-6 rounded-full object-cover"
                    aria-hidden
                  />
                ) : (
                  <span
                    className="shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-semibold"
                    style={{
                      background: "rgba(255,138,76,0.18)",
                      color: "#c4541e",
                    }}
                    aria-hidden
                  >
                    {initial}
                  </span>
                )}
                <div className="max-w-md px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white/55 backdrop-blur-md text-foreground border border-white/60 shadow-sm">
                  <p>
                    <MessageBody body={inquiry.special_requests} />
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Proposals as system bubbles in-thread */}
          {proposals.map((p) => (
            <div key={p.id} className="my-3">
              <ProposalCard proposal={p} />
              {p.status === "pending" && (
                <ProposalShareToggle
                  proposalId={p.id}
                  initialToken={
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (p as any).share_token ?? null
                  }
                />
              )}
            </div>
          ))}

          {/* Messages */}
          {messages.length === 0 && !inquiry.special_requests ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No messages yet. Say hi.
            </p>
          ) : (
            groupedItems.map((it) => {
              if (it.kind === "sep") {
                return (
                  <div
                    key={it.key}
                    className="flex items-center justify-center py-3"
                  >
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-background/80 backdrop-blur-sm rounded-full px-3 py-1 border border-border/40 shadow-sm">
                      {it.label}
                    </span>
                  </div>
                );
              }
              const m = it.message;
              const isAi = m.sender_role === "agent";
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
                  {/* Incoming-side avatar: render on the tail bubble of
                      each host run so each speech "burst" gets one
                      portrait, like iMessage. Non-tail incoming messages
                      leave a spacer so bubbles in the same run line up. */}
                  {!it.isMe ? (
                    it.showTail ? (
                      inquiry.host?.avatar_url ? (
                        <img
                          src={inquiry.host.avatar_url}
                          alt=""
                          className="shrink-0 w-6 h-6 rounded-full object-cover"
                          aria-hidden
                        />
                      ) : (
                        <span
                          className="shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-semibold"
                          style={{
                            background: "rgba(255,138,76,0.18)",
                            color: "#c4541e",
                          }}
                          aria-hidden
                        >
                          {initial}
                        </span>
                      )
                    ) : (
                      <span className="shrink-0 w-6" aria-hidden />
                    )
                  ) : null}
                  {/* Action menu sits on the opposite side of the
                      bubble — left of my outgoing messages, right of
                      incoming. Hidden until the row is hovered. */}
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
                      className={`max-w-md px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl backdrop-blur-md shadow-sm ${
                        isDeleted
                          ? "bg-background/60 text-muted-foreground italic border border-border/40"
                          : it.isMe
                            ? `bg-foreground/85 text-background border border-foreground/30 ${
                                it.showTail ? "rounded-br-sm" : ""
                              }`
                            : `bg-white/55 text-foreground border border-white/60 ${
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
                              parent.sender_role === "host"
                                ? hostName
                                : parent.sender_role === "vendor"
                                  ? "You"
                                  : "Vendora AI";
                            return (
                              <MessageReplyContext
                                authorName={parentName}
                                body={
                                  parent.deleted_at ? "" : parent.body
                                }
                                tone="bubble"
                                inverted={it.isMe}
                              />
                            );
                          })() : null}
                          {isAi ? (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-80 mb-1">
                              <Sparkles className="w-3 h-3" />
                              Sent by AI
                            </span>
                          ) : null}
                          {editingMessageId === m.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingDraft}
                                onChange={(e) =>
                                  setEditingDraft(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
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
                            <p>
                              <MessageBody body={m.body} />
                            </p>
                          )}
                          {m.attachments && m.attachments.length > 0 && (
                            <MessageAttachments attachments={m.attachments} />
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
            })
          )}

          {otherTyping ? <TypingBubble withAvatarSpacer /> : null}
          {seenTimeLabel ? (
            <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground mt-1 mr-1">
              <CheckCheck className="w-3 h-3" aria-hidden />
              <span>Read · {seenTimeLabel}</span>
            </div>
          ) : null}

          {/* Review as a system bubble at the end of the thread */}
          {review && (
            <div className="my-4">
              <InquiryReviewCard review={review} onResponseSaved={load} />
            </div>
          )}

          <div ref={messagesEndRef} aria-hidden />
        </div>
      </div>

      {/* ─── Sticky composer ─────────────────────────────────────────── */}
      <div
        className="sticky bottom-0 px-4 md:px-6 py-3 backdrop-blur-md"
        style={{
          background: "rgba(255,253,250,0.92)",
          borderTop: "0.5px solid rgba(255,138,76,0.18)",
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setIsDragOver(true);
          }
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          setIsDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            pickFiles(e.dataTransfer.files);
          }
        }}
      >
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Quick-action chips above the composer — each is a single
              tap that either opens a focused modal or drops a templated
              body into the thread. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setProposalModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-background/95 border border-border/40 shadow-sm rounded-full px-3 py-1.5 hover:bg-background"
            >
              <FileText className="w-3.5 h-3.5 text-foreground/70" />
              Send quote
            </button>
            <button
              type="button"
              onClick={() => setAppointmentModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-background/95 border border-border/40 shadow-sm rounded-full px-3 py-1.5 hover:bg-background"
            >
              <CalendarDays className="w-3.5 h-3.5 text-foreground/70" />
              Share availability
            </button>
            <button
              type="button"
              onClick={() => setPinLocationOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-background/95 border border-border/40 shadow-sm rounded-full px-3 py-1.5 hover:bg-background"
            >
              <MapPin className="w-3.5 h-3.5 text-accent" />
              Pin location
            </button>
          </div>

          {/* Reply quote + pending file chips, when present, sit above
              the input pill so they're visually attached to the next
              message. */}
          <div
            className={`rounded-2xl transition ${
              isDragOver
                ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                : ""
            }`}
          >
            {replyTarget ? (
              <MessageReplyContext
                authorName={
                  replyTarget.sender_role === "host"
                    ? hostName
                    : replyTarget.sender_role === "vendor"
                      ? "You"
                      : "Vendora AI"
                }
                body={replyTarget.deleted_at ? "" : replyTarget.body}
                tone="composer"
                onCancel={() => setReplyToId(null)}
              />
            ) : null}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingFiles.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-background/90 border border-border/40 rounded-full text-xs"
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

            {/* The single composer pill — paperclip + secondary tools
                on the left, textarea fills the middle, dark circular
                send button on the right. All inside one rounded
                container with a soft shadow. */}
            <div className="flex items-end gap-1 bg-background/95 border border-border/40 shadow-sm rounded-3xl pl-2 pr-1.5 py-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || pendingFiles.length >= MAX_FILES}
                aria-label="Attach files"
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 text-muted-foreground disabled:opacity-50"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <VoiceRecorder
                disabled={sending || pendingFiles.length >= MAX_FILES}
                onRecorded={(file) => {
                  const list = new DataTransfer();
                  list.items.add(file);
                  pickFiles(list.files);
                }}
              />
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={sending}
                    aria-label="Quick reactions"
                    className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 text-muted-foreground disabled:opacity-50"
                  >
                    <Smile className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-56 p-2">
                  <div className="grid grid-cols-6 gap-1">
                    {QUICK_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        aria-label={`Insert ${e}`}
                        onClick={() => {
                          setComposer((v) => v + e);
                          setEmojiOpen(false);
                          composerRef.current?.focus();
                        }}
                        className="text-xl rounded-md p-1.5 hover:bg-secondary transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <TemplatePicker
                vendorId={inquiry?.vendor_id ?? null}
                onPick={(body) => {
                  setComposer((prev) => (prev ? `${prev}\n${body}` : body));
                  composerRef.current?.focus();
                }}
              />
              <Textarea
                ref={composerRef}
                value={composer}
                onChange={(e) => {
                  setComposer(e.target.value);
                  if (e.target.value.length > 0) broadcastTyping();
                }}
                onPaste={(e) => {
                  // Paste-an-image from clipboard: pull the image File
                  // out of clipboardData and run it through pickFiles
                  // (same validation as the paperclip / drop paths).
                  const files: File[] = [];
                  for (const item of Array.from(e.clipboardData.items)) {
                    if (item.kind === "file") {
                      const f = item.getAsFile();
                      if (f) files.push(f);
                    }
                  }
                  if (files.length > 0) {
                    e.preventDefault();
                    const list = new DataTransfer();
                    for (const f of files) list.items.add(f);
                    pickFiles(list.files);
                  }
                }}
                onKeyDown={(e) => {
                  // iMessage convention: Enter sends, Shift+Enter inserts
                  // a newline.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (
                      !sending &&
                      (composer.trim() || pendingFiles.length > 0)
                    ) {
                      sendMessage();
                    }
                  }
                }}
                rows={1}
                placeholder={`Message ${hostName}…`}
                className="resize-none min-h-[36px] max-h-32 rounded-2xl border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
              />
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
                aria-label="Send"
                className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 h-9 w-9 p-0"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {inquiry && (
        <>
          {proposalModalOpen && (
            <Suspense fallback={null}>
              <ProposalFormModal
                open={proposalModalOpen}
                onOpenChange={setProposalModalOpen}
                inquiryId={inquiry.id}
                vendorId={inquiry.vendor_id}
                hostId={inquiry.host_id}
                defaultTitle={`${inquiry.event_type.replace("_", " ")} proposal`}
                onSuccess={load}
              />
            </Suspense>
          )}
          <ProposeAppointmentModal
            open={appointmentModalOpen}
            onOpenChange={setAppointmentModalOpen}
            inquiryId={inquiry.id}
            vendorId={inquiry.vendor_id}
            hostId={inquiry.host_id}
            proposedBy="vendor"
          />
          <PinLocationDialog
            open={pinLocationOpen}
            onOpenChange={setPinLocationOpen}
            defaultAddress={inquiry.location}
            onSend={(body) => {
              sendBody(body);
            }}
          />
          {inquiryPreviewOpen && (
            <InquiryPreviewSheet
              inquiry={inquiry}
              hostName={hostName}
              onClose={() => setInquiryPreviewOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

// Full-inquiry preview rendered on a blurred backdrop. Opened from
// the "..." menu on the chat header. The chat stays alive underneath
// (visible but softened); the back arrow in the top-left dismisses.
function InquiryPreviewSheet({
  inquiry,
  hostName,
  onClose,
}: {
  inquiry: Inquiry;
  hostName: string;
  onClose: () => void;
}) {
  // Escape closes the sheet — mirrors the MediaLightbox pattern.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const eventLabel = inquiry.event_type.replace(/_/g, " ");
  const dateStr = inquiry.event_date
    ? (() => {
        const [y, m, d] = inquiry.event_date.split("T")[0].split("-").map(Number);
        if (!y || !m || !d) return inquiry.event_date;
        return new Date(y, m - 1, d).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      })()
    : null;
  const budgetStr =
    inquiry.budget_min_cents != null || inquiry.budget_max_cents != null
      ? `${fmtMoney(inquiry.budget_min_cents)} – ${fmtMoney(inquiry.budget_max_cents)}`
      : null;
  const intakeEntries = inquiry.intake_answers
    ? Object.entries(inquiry.intake_answers)
    : [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-12 overflow-y-auto"
      onClick={onClose}
      style={{
        background: "rgba(20,16,12,0.55)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Back to chat"
        className="fixed top-4 left-4 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center hover:bg-white/25"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl p-7 md:p-9 shadow-2xl"
        style={{
          background: "rgba(255,253,250,0.97)",
          border: "0.5px solid rgba(255,138,76,0.22)",
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.22em] font-medium text-accent mb-2">
          Inquiry preview
        </p>
        <h2 className="font-editorial italic text-3xl mb-1">{hostName}</h2>
        <p className="text-sm text-muted-foreground capitalize mb-6">
          {eventLabel}
        </p>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {dateStr ? (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-1">
                Event date
              </dt>
              <dd className="text-sm font-medium text-foreground">{dateStr}</dd>
            </div>
          ) : null}
          {inquiry.guest_count != null ? (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-1">
                Guests
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {inquiry.guest_count}
              </dd>
            </div>
          ) : null}
          {inquiry.location ? (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-1">
                Location
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {inquiry.location}
              </dd>
            </div>
          ) : null}
          {budgetStr ? (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-1">
                Budget
              </dt>
              <dd className="text-sm font-medium text-foreground tnum">
                {budgetStr}
              </dd>
            </div>
          ) : null}
        </dl>

        {inquiry.special_requests ? (
          <div className="mt-7">
            <p className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-2">
              Special requests
            </p>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {inquiry.special_requests}
            </p>
          </div>
        ) : null}

        {intakeEntries.length > 0 ? (
          <div className="mt-7">
            <p className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-3">
              Intake form answers
            </p>
            <dl className="space-y-3">
              {intakeEntries.map(([qid, val]) => (
                <div key={qid}>
                  <dt className="text-xs text-muted-foreground">
                    {qid.slice(0, 8)}…
                  </dt>
                  <dd className="text-sm text-foreground">
                    {Array.isArray(val) ? val.join(", ") : String(val)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {inquiry.recommended_verification ? (
          <div className="mt-7 p-3 rounded-xl bg-accent/10 text-sm text-foreground">
            <span className="font-medium">Recommended verification: </span>
            {inquiry.recommended_verification}
          </div>
        ) : null}
      </div>
    </div>
  );
}



