import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { useInquiryTyping } from "@/hooks/useInquiryTyping";
import { MessageActionMenu } from "@/components/messages/MessageActionMenu";
import {
  MessageReactions,
  type MessageReaction,
} from "@/components/messages/MessageReactions";
import { MessageReplyContext } from "@/components/messages/MessageReplyContext";
import { VoiceRecorder } from "@/components/messages/VoiceRecorder";
import { MessageBody } from "@/components/messages/MessageBody";
import { TypingBubble } from "@/components/messages/TypingBubble";
import { RatingPromptStrip } from "@/components/reviews/RatingPromptStrip";
import { SubmittedReviewStatusCard } from "@/components/reviews/SubmittedReviewStatusCard";
import { BookingConfirmationCard } from "@/components/inquiries/BookingConfirmationCard";
import { VendorPaymentButtons } from "@/components/payments/VendorPaymentButtons";
import { InquiryReviewCard } from "@/components/inquiries/InquiryReviewCard";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Loader2,
  Sparkles,
  Paperclip,
  X,
  CalendarDays,
  CheckCheck,
  Info,
  Smile,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QUICK_EMOJIS, groupMessages } from "@/lib/threadFormatting";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
    logo_url?: string | null;
    stripe_account_id?: string | null;
    payment_handles?: Partial<{
      square: string;
      paypal: string;
      venmo: string;
      cashapp: string;
      zelle: string;
    }> | null;
  } | null;
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
  is_hilux_generated?: boolean | null;
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

// localStorage key for the in-flight draft, scoped per inquiry so two
// open tabs (or a navigate-away-and-back) don't clobber each other.
// Mirrors the vendor-side pattern in InquiryDetailPage.
function draftKey(inquiryId: string | undefined): string | null {
  return inquiryId ? `vendora.host-inquiry-draft.${inquiryId}` : null;
}

export default function HostInquiryDetailPage() {
  const { inquiryId } = useParams();
  const { user } = useAuth();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  // Track whether we've already rehydrated the draft for the active
  // inquiry — without this, the first effect-run overwrites the
  // freshly-loaded localStorage value with an empty string.
  const draftHydratedRef = useRef<string | null>(null);
  // Tracks the previously active inquiry so we can clear transient
  // per-inquiry state on navigate (reply target, edit, attachments).
  const prevInquiryIdRef = useRef<string | undefined>(inquiryId);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user is currently anchored near the bottom of
  // the thread. New messages auto-scroll only when this is true so we
  // don't yank a user back down while they're reading history.
  const wasAtBottomRef = useRef(true);
  // Per-(message, emoji) lock for reaction toggles — see toggleReaction.
  const togglesInFlightRef = useRef<Set<string>>(new Set());
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
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  // Vendor-side reviews of this host (conversation + event). The host
  // can post a public response per review via InquiryReviewCard.
  // Loaded only after the page settles; RLS already gates blind-period
  // event reviews so we never see unreleased rows.
  const [vendorReviews, setVendorReviews] = useState<
    Array<{
      id: string;
      vendor_id: string;
      rating: number;
      body: string | null;
      kind: "conversation" | "event";
      created_at: string;
      response: { body: string; created_at: string; updated_at: string } | null;
    }>
  >([]);
  const [acting, setActing] = useState<"accept" | "reject" | null>(null);
  // Thread id is the direct_threads row for this inquiry; mobile uses
  // the same model — see ensure_inquiry_thread RPC. Resolved on load.
  const [threadId, setThreadId] = useState<string | null>(null);
  const [typingUntil, setTypingUntil] = useState<string | null>(null);
  // Forces a re-render every ~1s so the typing chip auto-hides
  // when the TTL passes without waiting for another realtime event.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Tracks first-paint vs realtime-driven reloads so the skeleton
  // overlay only flashes once. Ref instead of state because the
  // load() closure used to read inquiry === null and could go stale
  // when multiple loads were in flight.
  const hasLoadedRef = useRef(false);

  // useCallback so the realtime hook below sees a stable reference
  // across renders; otherwise each render replaces the subscription
  // callback and leaks listeners on rapid mount/unmount cycles.
  const load = useCallback(async () => {
    if (!inquiryId || !user) return;
    if (!hasLoadedRef.current) setLoading(true);

    // Three independent reads — inquiry, thread RPC, proposals —
    // fire in parallel. Messages + reactions depend on the thread id
    // so they chain after. Submitted-review status is fetched by
    // SubmittedReviewStatusCard on its own.
    const [iRes, tidRes, propsRes, vendorRevsRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select(
          "id, vendor_id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status, created_at, vendor_read_at, host_read_at, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name, category, logo_url, stripe_account_id, payment_handles)",
        )
        .eq("id", inquiryId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("ensure_inquiry_thread", {
        p_inquiry_id: inquiryId,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("proposals")
        .select(
          "id, title, line_items, subtotal_cents, deposit_cents, terms, contract_body, status, sent_at, signed_at, signed_name, first_viewed_at, last_viewed_at, view_count",
        )
        .eq("inquiry_id", inquiryId)
        .order("created_at", { ascending: false }),
      // Vendor-side reviews this host is the subject of. RLS gates
      // visibility — blind-period event reviews don't surface here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("reviews")
        .select(
          "id, vendor_id, rating, body, kind, created_at, response:review_responses(body, created_at, updated_at)",
        )
        .eq("inquiry_id", inquiryId)
        .eq("rater_role", "vendor")
        .order("created_at", { ascending: true }),
    ]);

    // Only flip to 404 if the row is genuinely missing. Transient
    // errors (network blip on a realtime refresh) keep the existing
    // inquiry visible instead of permanently landing on the
    // not-found state.
    if (!iRes.data) {
      if (!iRes.error) setNotFound(true);
      setLoading(false);
      return;
    }
    setInquiry(iRes.data as unknown as Inquiry);

    // Stamp host_read_at every time the host opens the inquiry so
    // the inbox unread dot resets correctly. The unread predicate is
    // last_message_at > host_read_at — without re-stamping on each
    // visit, the dot would only clear on the very first open.
    // Fire-and-forget.
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

    const thread = (tidRes.data as string | null) ?? null;
    setThreadId(thread);

    if (thread) {
      // Pull the typing-until once on load so the indicator is
      // correct on first render. The realtime subscription below
      // keeps it current after that.
      supabase
        .from("direct_threads")
        .select("hilux_typing_until")
        .eq("id", thread)
        .maybeSingle()
        .then(({ data }) => {
          setTypingUntil(
            ((data as { hilux_typing_until?: string | null } | null)
              ?.hilux_typing_until) ?? null,
          );
        });

    }

    if (thread) {
      // Latest 200 messages — descending under LIMIT to slice from
      // the newest end, then reversed to render oldest-first.
      const { data: msgs } = await supabase
        .from("direct_messages")
        .select(
          "id, body, sender_role, created_at, attachments, edited_at, deleted_at, reply_to_message_id, is_hilux_generated",
        )
        .eq("thread_id", thread)
        .order("created_at", { ascending: false })
        .limit(200);
      const messageRows = ((msgs as unknown as Message[]) ?? []).slice().reverse();
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

    setProposals((propsRes.data as unknown as Proposal[]) ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setVendorReviews(((vendorRevsRes.data as any[]) ?? []).map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      rating: r.rating,
      body: r.body,
      kind: r.kind,
      created_at: r.created_at,
      // response is a 1-row nested select; coerce to scalar.
      response: Array.isArray(r.response)
        ? (r.response[0] ?? null)
        : (r.response ?? null),
    })));

    hasLoadedRef.current = true;
    setLoading(false);
  }, [inquiryId, user]);

  async function respondProposal(
    p: Proposal,
    action: "accepted" | "rejected",
    signature?: SignaturePayload,
  ) {
    // Idempotency guard. Fast double-tap on Accept can fire two
    // respondProposal calls before setActing(action) takes effect. The
    // DB update would no-op (status is already accepted), but two
    // toasts and two load() calls fire. Bail early if the proposal is
    // already in a terminal state.
    if (p.status !== "pending" || acting !== null) return;
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
  }, [load]);

  // Mark this inquiry's notifications as read whenever the host opens
  // the page. Without this, opening from the NotificationBell leaves
  // the bell badge counting that notification as unread until the
  // user manually mark-all-reads. The inquiry's notifications all
  // link to /customer/inquiries/<id>, so a LIKE on the link column
  // catches both new-message and proposal-accepted entries.
  useEffect(() => {
    if (!user?.id || !inquiryId) return;
    void supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null)
      .like("link", `%/customer/inquiries/${inquiryId}%`);
  }, [user?.id, inquiryId]);

  // Reset transient per-inquiry state when navigating from one
  // inquiry to another. Otherwise a "reply" or "edit" started in
  // inquiry A bleeds into inquiry B — the composer thinks it's
  // replying to a message that isn't even in the current thread.
  useEffect(() => {
    if (prevInquiryIdRef.current !== inquiryId) {
      setReplyToId(null);
      setEditingMessageId(null);
      setEditingDraft("");
      setPendingFiles([]);
      prevInquiryIdRef.current = inquiryId;
    }
  }, [inquiryId]);

  // Rehydrate any in-flight draft from localStorage when the active
  // inquiry changes. Hosts otherwise lose their reply on any nav.
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

  // Persist the draft on every keystroke. localStorage is cheap; the
  // user's typing is the canonical source of truth.
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

  // Auto-scroll to the bottom — but only if the user is already
  // anchored near the bottom. If they've scrolled up to read
  // history, hold their position so the next realtime tick doesn't
  // yank them back down.
  useEffect(() => {
    if (!messagesEndRef.current) return;
    if (!wasAtBottomRef.current && hasLoadedRef.current) return;
    messagesEndRef.current.scrollIntoView({
      behavior: hasLoadedRef.current ? "smooth" : "auto",
      block: "end",
    });
  }, [messages.length, otherTyping]);

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

  // Subscribe to this thread's row so the typing indicator updates
  // when HILUX flips hilux_typing_until on/off. We only need this
  // one column, so we refetch it (not the whole conversation) on
  // every direct_threads event for this row.
  const threadConfig = useMemo(
    () =>
      threadId
        ? { table: "direct_threads", filter: `id=eq.${threadId}` }
        : null,
    [threadId],
  );
  useRealtime(threadConfig, () => {
    if (!threadId) return;
    supabase
      .from("direct_threads")
      .select("hilux_typing_until")
      .eq("id", threadId)
      .maybeSingle()
      .then(({ data }) => {
        setTypingUntil(
          ((data as { hilux_typing_until?: string | null } | null)
            ?.hilux_typing_until) ?? null,
        );
      });
  });

  // Refetch ONLY reactions for this thread's messages on a reaction
  // event — not the full load() which would also pull inquiry +
  // messages + reviews. RLS gates relevance so any event we receive
  // is one we care about; the goal is just to keep the refetch scoped.
  const loadReactionsForThread = useCallback(async () => {
    const ids = messages.map((m) => m.id);
    if (ids.length === 0) {
      setReactionsByMsg({});
      return;
    }
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
  }, [messages]);
  const reactionsConfig = useMemo(
    () =>
      threadId
        ? { table: "direct_message_reactions" as const }
        : null,
    [threadId],
  );
  useRealtime(reactionsConfig, loadReactionsForThread);

  async function toggleReaction(messageId: string, emoji: string) {
    if (!user?.id) return;
    // Per-(message, emoji) lock: rapid double-taps within the same
    // render snapshot used to both see the stale `existing` and
    // both fire .insert(), hitting the PK violation on the second.
    // Drop subsequent clicks until the in-flight one resolves —
    // the realtime tick will reconcile state regardless.
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
    // Snapshot the row pre-edit so we can revert if the UPDATE
    // hits RLS or a network failure — otherwise the optimistic
    // body sticks locally while the recipient still sees the old
    // one.
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

  async function deleteMessage(messageId: string) {
    const ok = window.confirm("Delete this message? This can't be undone.");
    if (!ok) return;
    const before = messages.find((m) => m.id === messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, deleted_at: new Date().toISOString() }
          : m,
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

  const inquiryConfig = useMemo(
    () =>
      inquiryId
        ? { table: "inquiries", event: "UPDATE" as const, filter: `id=eq.${inquiryId}` }
        : null,
    [inquiryId],
  );
  useRealtime(inquiryConfig, () => load());

  // Proposals: vendor can withdraw or revise after the host opens the
  // page. Without a sub the bubble shows the stale state until manual
  // refresh.
  const proposalsConfig = useMemo(
    () =>
      inquiryId
        ? { table: "proposals", filter: `inquiry_id=eq.${inquiryId}` }
        : null,
    [inquiryId],
  );
  useRealtime(proposalsConfig, () => load());

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
    // Attachment-only message where every upload failed: don't post
    // a `(attachment)` ghost row with an empty attachments array.
    // Per-file errors already toasted; let the user retry or remove
    // the failed files.
    if (
      pendingFiles.length > 0 &&
      uploaded.length === 0 &&
      !composer.trim()
    ) {
      setSending(false);
      toast.error("Couldn't upload your attachments — message not sent.");
      return;
    }
    // Partial-failure case: some uploads succeeded, some didn't.
    // Surface it so the user knows the message is missing files.
    if (
      pendingFiles.length > 0 &&
      uploaded.length > 0 &&
      uploaded.length < pendingFiles.length
    ) {
      toast.info(
        `${uploaded.length} of ${pendingFiles.length} attachments uploaded.`,
      );
    }
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
    // No explicit load() — the messages realtime subscription will
    // fire on the INSERT we just made and pick the row up. Skipping
    // the redundant fetch saves a full inquiry+thread+messages+
    // reactions+review+proposals round-trip per send.
  }

  const replyTarget = useMemo(
    () => (replyToId ? messages.find((m) => m.id === replyToId) ?? null : null),
    [replyToId, messages],
  );

  // Memoize the grouped-with-separators array so we don't redo the
  // pass on every realtime tick / typing-indicator flip.
  const groupedItems = useMemo(
    () =>
      groupMessages(messages, {
        isMe: (m) => m.sender_role === "host",
        senderKey: (m) => m.sender_role,
        createdAt: (m) => m.created_at,
        id: (m) => m.id,
      }),
    [messages],
  );

  if (notFound) {
    return (
      <div className="flex min-h-screen vendor-canvas">
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

  // Skeleton-state render while initial load completes.
  if (loading && inquiry === null) {
    return (
      <div className="min-h-screen vendor-canvas flex flex-col">
        <div className="sticky top-0 z-40 px-4 md:px-6 py-3 backdrop-blur-md border-b border-border/40">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!inquiry) return null;

  const vendorName = inquiry.vendor?.business_name?.trim() || "Vendor";
  const vendorInitial = vendorName.charAt(0).toUpperCase();
  const eventTypeNice = inquiry.event_type
    ? `${inquiry.event_type.charAt(0).toUpperCase()}${inquiry.event_type.slice(1).replace(/_/g, " ")}`
    : "";

  // "Seen" indicator — only fires when the vendor has read past the
  // last outgoing host message.
  const lastOutgoing = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_role === "host") return messages[i];
    }
    return null;
  })();
  const seenAt =
    lastOutgoing && inquiry.vendor_read_at &&
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
    <div className="min-h-screen vendor-canvas flex flex-col">
      {/* ─── Sticky chat header ─────────────────────────────────────────
          Pill back button + vendor avatar w/ subtle presence dot +
          name + "{event} inquiry · {date}" subtitle + pill Info
          button. Info opens the inquiry-summary sheet (the brief the
          host originally submitted). */}
      <div
        className="sticky top-0 z-40 px-4 md:px-6 py-3 backdrop-blur-md"
        style={{
          background: "rgba(255,253,250,0.85)",
          borderBottom: "0.5px solid rgba(255,138,76,0.18)",
        }}
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <Link
            to="/customer/inquiries"
            aria-label="Back to inquiries"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-sm border border-border/40 text-foreground/80 hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="relative shrink-0">
            {inquiry.vendor?.logo_url ? (
              <img
                src={inquiry.vendor.logo_url}
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
                {vendorInitial}
              </span>
            )}
            <span
              aria-hidden
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#fffdfa]"
            />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-medium text-foreground truncate">{vendorName}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {eventTypeNice ? `${eventTypeNice} inquiry` : "Inquiry"}
              {inquiry.event_date
                ? ` · ${new Date(inquiry.event_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            aria-label="Inquiry details"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-sm border border-border/40 text-foreground/80 hover:bg-white"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── Chat thread (scrolling area) ────────────────────────────── */}
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          // 80px slack at the bottom — small upward scroll still
          // counts as "at the bottom" so a one-line read doesn't
          // suppress auto-scroll for the next reply.
          wasAtBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-5"
      >
        <div className="max-w-3xl mx-auto space-y-1.5">
          {/* Pinned: status pill for context (the host's reminder of
              where this inquiry stands). */}
          <div className="flex items-center justify-center pb-2">
            <Badge
              variant="outline"
              className={`${statusStyles[inquiry.status] ?? ""} rounded-full text-[11px] font-medium`}
            >
              {statusLabel[inquiry.status] ?? inquiry.status}
            </Badge>
          </div>

          {/* Original brief — rendered as the host's opening outgoing
              bubble so the thread reads start-to-finish. */}
          {inquiry.special_requests && (
            <div className="flex items-end justify-end mt-2">
              <div className="max-w-md px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl rounded-br-sm bg-white/65 backdrop-blur-md text-foreground border border-white/70 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Your inquiry
                </p>
                <p>
                  <MessageBody body={inquiry.special_requests} />
                </p>
              </div>
            </div>
          )}

          {/* Proposals — sender-agnostic system bubbles */}
          {proposals.map((p) => (
            <div key={p.id} className="my-3">
              <ProposalCard
                proposal={p}
                canRespond={p.status === "pending"}
                acting={acting}
                onAccept={(sig) => respondProposal(p, "accepted", sig)}
                onReject={() => respondProposal(p, "rejected")}
              />
            </div>
          ))}

          {messages.length === 0 && !inquiry.special_requests ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No messages yet — the vendor will reply soon.
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
              const isAi =
                m.sender_role === "agent" || m.is_hilux_generated === true;
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
                  {/* Vendor avatar on the tail bubble of each
                      incoming run, like iMessage. */}
                  {!it.isMe ? (
                    it.showTail ? (
                      inquiry.vendor?.logo_url ? (
                        <img
                          src={inquiry.vendor.logo_url}
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
                          {vendorInitial}
                        </span>
                      )
                    ) : (
                      <span className="shrink-0 w-6" aria-hidden />
                    )
                  ) : null}
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
                            ? `bg-white/65 text-foreground border border-white/70 ${
                                it.showTail ? "rounded-br-sm" : ""
                              }`
                            : `bg-white/45 text-foreground border border-white/55 ${
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
                                ? vendorName
                                : parent.sender_role === "host"
                                  ? "You"
                                  : "Vendora AI";
                            return (
                              <MessageReplyContext
                                authorName={parentName}
                                body={parent.deleted_at ? "" : parent.body}
                                tone="bubble"
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
                    {/* Tail-only timestamp — iMessage prints the time
                        under the last message in a run. */}
                    {it.showTail ? (
                      <p
                        className={`text-[10px] text-muted-foreground/80 tnum mt-0.5 ${
                          it.isMe ? "text-right pr-1" : "pl-1"
                        }`}
                      >
                        {new Date(m.created_at).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
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

          {(() => {
            const hiluxTyping =
              typingUntil != null &&
              new Date(typingUntil).getTime() > Date.now();
            // Prefer the HILUX label when the agent's processing; the
            // human-presence "otherTyping" still wins if both are true,
            // since the vendor would have taken over the thread.
            if (otherTyping) return <TypingBubble withAvatarSpacer />;
            if (hiluxTyping) return <TypingBubble withAvatarSpacer label="HILUX is typing" />;
            return null;
          })()}
          {seenTimeLabel ? (
            <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground mt-1 mr-1">
              <CheckCheck className="w-3 h-3" aria-hidden />
              <span>Read · {seenTimeLabel}</span>
            </div>
          ) : null}

          {/* Off-platform booking handshake. Hidden when an accepted
              proposal exists (the proposals path is canonical). */}
          {inquiry ? (
            <BookingConfirmationCard
              inquiryId={inquiry.id}
              selfRole="host"
              otherPartyName={vendorName}
              hasAcceptedProposal={proposals.some((p) => p.status === "accepted")}
            />
          ) : null}

          {/* Vendor's connected payment methods — Stripe, Venmo,
              Cash App, etc. Component returns null when the vendor
              hasn't configured anything, so we don't render an
              empty "Pay this vendor" header on cold inquiries.
              Rendered after BookingConfirmationCard so the
              payment options sit right next to the booking flow,
              not buried below the rating prompt. */}
          {inquiry?.vendor ? (
            <VendorPaymentButtons
              info={{
                stripe_account_id: inquiry.vendor.stripe_account_id ?? null,
                payment_handles: inquiry.vendor.payment_handles ?? null,
              }}
              className="card-soft p-4"
            />
          ) : null}

          {/* Rating discovery + status — RatingPromptStrip surfaces
              the CTA when eligible; SubmittedReviewStatusCard shows
              what's already been submitted (with mutual-blind
              "waiting" stamp for unreleased event reviews). */}
          {inquiry ? (
            <RatingPromptStrip
              inquiryId={inquiry.id}
              vendorId={inquiry.vendor_id}
              hostId={user?.id ?? ""}
              eventDate={inquiry.event_date}
              raterRole="host"
              otherPartyName={vendorName}
            />
          ) : null}
          {inquiry ? (
            <SubmittedReviewStatusCard
              inquiryId={inquiry.id}
              raterRole="host"
              otherPartyName={vendorName}
            />
          ) : null}

          {/* Vendor-side ratings the host can publicly respond to.
              Includes both conversation ratings (released on insert)
              and event reviews (post-mutual-reveal). RLS hides blind-
              period rows. */}
          {vendorReviews.map((r) => (
            <div key={r.id} className="my-4">
              <InquiryReviewCard
                review={r}
                responderRole="host"
                onResponseSaved={load}
              />
            </div>
          ))}

          <div ref={messagesEndRef} aria-hidden />
        </div>
      </div>

      {/* ─── Sticky composer ─────────────────────────────────────────── */}
      {/* Closed-inquiry composer state. Inquiries in terminal "lost"
          or "expired" states aren't actionable on either side — RLS
          would reject the insert anyway. Hide the composer behind a
          notice so the host doesn't waste time typing. "won" stays
          open since booked vendors still chat about planning. */}
      {inquiry &&
      (inquiry.status === "lost" ||
        inquiry.status === "expired" ||
        inquiry.status === "cancelled") ? (
        <div className="sticky bottom-20 lg:bottom-0 px-4 md:px-6 py-3 backdrop-blur-md text-center text-sm text-muted-foreground"
          style={{
            background: "rgba(255,253,250,0.92)",
            borderTop: "0.5px solid rgba(255,138,76,0.18)",
          }}
        >
          {inquiry.status === "lost"
            ? "This inquiry is closed."
            : inquiry.status === "expired"
              ? "This inquiry expired and is no longer accepting messages."
              : "This inquiry was cancelled."}
        </div>
      ) : (
      <div
        // bottom-20 on mobile lifts the composer above the floating
        // MobileNav pill (≈80px including safe-area padding). On lg+
        // the MobileNav is hidden, so the composer sticks at the
        // actual viewport bottom.
        className="sticky bottom-20 lg:bottom-0 px-4 md:px-6 py-3 backdrop-blur-md"
        style={{
          background: "rgba(255,253,250,0.92)",
          borderTop: "0.5px solid rgba(255,138,76,0.18)",
        }}
      >
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Quick-action chips — host-side has one: propose a
              meeting time. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAppointmentModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-background/95 border border-border/40 shadow-sm rounded-full px-3 py-1.5 hover:bg-background"
            >
              <CalendarDays className="w-3.5 h-3.5 text-foreground/70" />
              Propose meeting
            </button>
          </div>

          <div className="rounded-2xl">
            {replyTarget ? (
              <MessageReplyContext
                authorName={
                  replyTarget.sender_role === "vendor"
                    ? vendorName
                    : replyTarget.sender_role === "host"
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
              <Textarea
                ref={composerRef}
                value={composer}
                onChange={(e) => {
                  setComposer(e.target.value);
                  if (e.target.value.length > 0) broadcastTyping();
                }}
                onKeyDown={(e) => {
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
                placeholder={`Message ${vendorName}…`}
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
      )}

      <MobileNav items={navItems} />

      {/* Inquiry summary sheet — opened from the Info button. Shows
          the brief the host submitted as a reference. */}
      {summaryOpen && (
        <InquirySummarySheet
          inquiry={inquiry}
          onClose={() => setSummaryOpen(false)}
        />
      )}

      {inquiry && user && (
        <ProposeAppointmentModal
          open={appointmentModalOpen}
          onOpenChange={setAppointmentModalOpen}
          inquiryId={inquiry.id}
          vendorId={inquiry.vendor_id}
          hostId={user.id}
          proposedBy="host"
        />
      )}
    </div>
  );
}

// Full-inquiry summary rendered on a blurred backdrop. Opened from
// the Info button in the chat header. Mirrors the vendor side's
// InquiryPreviewSheet but stripped to the fields the host cares
// about — what they asked the vendor for, in the form they submitted.
function InquirySummarySheet({
  inquiry,
  onClose,
}: {
  inquiry: Inquiry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="relative w-full sm:max-w-lg bg-[#fffdfa] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-background/95 border border-border/40 shadow-sm text-foreground/80 hover:bg-white inline-flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 pt-7 space-y-5">
          <div>
            <p className="font-label text-muted-foreground">To</p>
            <h2 className="font-editorial text-2xl">
              {inquiry.vendor?.business_name ?? "Vendor"}
            </h2>
            {inquiry.vendor?.category && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {inquiry.vendor.category}
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-border/40">
            <div>
              <p className="font-label text-muted-foreground">Event</p>
              <p className="text-sm capitalize mt-1">
                {inquiry.event_type.replace(/_/g, " ")}
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
            <div className="pt-4 border-t border-border/40">
              <p className="font-label text-muted-foreground">Location</p>
              <p className="text-sm mt-1">{inquiry.location}</p>
            </div>
          )}

          {inquiry.special_requests && (
            <div className="pt-4 border-t border-border/40">
              <p className="font-label text-muted-foreground">Your notes</p>
              <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">
                <MessageBody body={inquiry.special_requests} />
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
