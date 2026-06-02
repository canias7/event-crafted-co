import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  BellOff,
  Bell,
  Flag,
  Info,
  Loader2,
  MapPin,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  Smile,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import { useAuth } from "@/hooks/useAuth";
import { useChatTyping } from "@/hooks/useChatTyping";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
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
import { MessageActionMenu } from "@/components/messages/MessageActionMenu";
import {
  MessageReactions,
  type MessageReaction,
} from "@/components/messages/MessageReactions";
import { MessageReplyContext } from "@/components/messages/MessageReplyContext";
import { VoiceRecorder } from "@/components/messages/VoiceRecorder";
import { MessageBody } from "@/components/messages/MessageBody";
import { MessageAttachments } from "@/components/messages/MessageAttachments";
import { PinLocationDialog } from "@/components/messages/PinLocationDialog";
import { TypingBubble } from "@/components/messages/TypingBubble";
import {
  uploadAttachments,
  validateAttachment,
  ACCEPTED_MIME,
  MAX_FILES,
  type MessageAttachment,
} from "@/lib/messageAttachments";
import {
  QUICK_EMOJIS,
  groupMessages,
  type GroupedItem,
} from "@/lib/threadFormatting";
import { vendorNavItems as navItems } from "@/data/navItems";
import { VENDOR_INBOX_HUB_TABS } from "@/data/hubTabs";

// Vendor-to-vendor partner messaging — separate from host conversations.
// Threads are keyed on profiles.id (the user account) so a vendor with
// zero listings can still participate. After PR #543 this surface
// reaches feature parity with the inquiry chat: glass bubbles,
// reactions, edit, delete, reply-quote, attachments + voice, pin
// location, typing indicator, draft autosave, auto-scroll at-bottom
// check, mute / archive / report.

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const DRAFT_KEY = (threadId: string) => `vendora.partnerDraft.${threadId}`;

// Partner identity is rendered from the profiles row. Vendors fill
// these fields inconsistently — some have a business_name + logo_url
// (the brand pair), others only have a personal display_name +
// avatar_url. Pull all four and fall back in order so name and
// picture are always populated.
interface ProfileBrand {
  business_name: string | null;
  logo_url: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

function brandName(p: ProfileBrand | null): string {
  return (
    p?.business_name?.trim() ||
    p?.display_name?.trim() ||
    "Vendor"
  );
}

function brandLogo(p: ProfileBrand | null): string | null {
  return p?.logo_url || p?.avatar_url || null;
}

interface ThreadRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string;
  user_a_read_at: string | null;
  user_b_read_at: string | null;
  user_a_archived_at: string | null;
  user_b_archived_at: string | null;
  user_a: ProfileBrand | null;
  user_b: ProfileBrand | null;
  last_preview: { body: string; sender_user_id: string } | null;
}

interface PartnerMessage {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  attachments?: MessageAttachment[] | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
  contact_info_flagged?: boolean;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const threadsTable = () => (supabase as any).from("vendor_partner_threads");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgsTable = () => (supabase as any).from("vendor_partner_messages");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reactionsTable = () =>
  (supabase as any).from("vendor_partner_message_reactions");

export default function VendorPartnersPage() {
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeThreadId = searchParams.get("thread");

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [reactionsByMsg, setReactionsByMsg] = useState<
    Record<string, MessageReaction[]>
  >({});
  const [composer, setComposer] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeNow, setActiveNow] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pinLocationOpen, setPinLocationOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // True while the user is anchored within ~80px of the bottom. New
  // messages auto-scroll only when true, so we don't yank a reader
  // back down while they're scrolled up looking at history.
  const wasAtBottomRef = useRef(true);
  const hasLoadedRef = useRef(false);
  // Per-(message, emoji) lock for reaction toggles so rapid clicks
  // don't race the UNIQUE PK and both fire .insert().
  const togglesInFlightRef = useRef<Set<string>>(new Set());
  // Rehydration gate so the very first effect-run doesn't overwrite
  // the freshly-loaded localStorage draft with an empty string.
  const draftHydratedRef = useRef<string | null>(null);

  const { otherTyping, broadcastTyping } = useChatTyping(
    activeThreadId ? `partner-typing:${activeThreadId}` : null,
    myUserId ?? "anon",
  );

  // ─── Thread + message + reaction loads ─────────────────────────────

  const loadThreads = useCallback(async () => {
    if (!myUserId) {
      setLoadingThreads(false);
      return;
    }
    const { data } = await threadsTable()
      .select(
        "id, user_a_id, user_b_id, last_message_at, user_a_read_at, user_b_read_at, user_a_archived_at, user_b_archived_at, user_a:profiles!vendor_partner_threads_user_a_id_fkey(business_name, logo_url, display_name, avatar_url), user_b:profiles!vendor_partner_threads_user_b_id_fkey(business_name, logo_url, display_name, avatar_url)",
      )
      .or(`user_a_id.eq.${myUserId},user_b_id.eq.${myUserId}`)
      .order("last_message_at", { ascending: false });
    const rows = (data as ThreadRow[]) ?? [];
    // Last-message preview per thread comes from get_partner_thread_previews,
    // a DISTINCT ON RPC that returns exactly one row per thread_id.
    // The old approach pulled ALL messages across ALL threads and
    // deduped client-side — quadratic with usage.
    const lastBy = new Map<
      string,
      { body: string; sender_user_id: string }
    >();
    if (rows.length > 0) {
      const ids = rows.map((t) => t.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: msgs } = await (supabase as any).rpc(
        "get_partner_thread_previews",
        { p_thread_ids: ids },
      );
      for (const m of (msgs as Array<{
        thread_id: string;
        body: string;
        sender_user_id: string;
        deleted_at: string | null;
      }> | null) ?? []) {
        lastBy.set(m.thread_id, {
          body: m.deleted_at ? "Message deleted" : m.body,
          sender_user_id: m.sender_user_id,
        });
      }
    }
    // Filter out threads the user archived for their own side.
    const visibleRows = rows.filter((t) => {
      const archivedAt =
        t.user_a_id === myUserId ? t.user_a_archived_at : t.user_b_archived_at;
      // If a NEW message arrived after the archive, un-archive the
      // row so it shows up again. Same convention as Gmail.
      if (
        archivedAt &&
        new Date(t.last_message_at).getTime() <= new Date(archivedAt).getTime()
      ) {
        return false;
      }
      return true;
    });
    setThreads(
      visibleRows.map((t) => ({ ...t, last_preview: lastBy.get(t.id) ?? null })),
    );
    setLoadingThreads(false);
  }, [myUserId]);

  const loadMessages = useCallback(async (threadId: string) => {
    // Pull the latest 200 messages — descending so the LIMIT captures
    // the most recent slice rather than the oldest, then reverse for
    // chronological render. Older history can be paged in later.
    const { data } = await msgsTable()
      .select(
        "id, sender_user_id, body, created_at, attachments, edited_at, deleted_at, reply_to_message_id, contact_info_flagged",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = ((data as PartnerMessage[]) ?? []).slice().reverse();
    setMessages(rows);
    if (rows.length > 0) {
      const ids = rows.map((m) => m.id);
      const { data: rxns } = await reactionsTable()
        .select("message_id, user_id, emoji")
        .in("message_id", ids);
      const grouped: Record<string, MessageReaction[]> = {};
      for (const r of (rxns as Array<{
        message_id: string;
        user_id: string;
        emoji: string;
      }>) ?? []) {
        const list = grouped[r.message_id] ?? [];
        list.push({ user_id: r.user_id, emoji: r.emoji });
        grouped[r.message_id] = list;
      }
      setReactionsByMsg(grouped);
    } else {
      setReactionsByMsg({});
    }
    hasLoadedRef.current = true;
  }, []);

  async function markRead(threadId: string) {
    if (!myUserId) return;
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return;
    const mySide: "a" | "b" | null =
      thread.user_a_id === myUserId
        ? "a"
        : thread.user_b_id === myUserId
          ? "b"
          : null;
    if (!mySide) return;
    const myReadAt =
      mySide === "a" ? thread.user_a_read_at : thread.user_b_read_at;
    if (
      myReadAt &&
      new Date(myReadAt).getTime() >= new Date(thread.last_message_at).getTime()
    ) {
      return;
    }
    const now = new Date().toISOString();
    setThreads((prev) =>
      prev.map((t) =>
        t.id !== threadId
          ? t
          : mySide === "a"
            ? { ...t, user_a_read_at: now }
            : { ...t, user_b_read_at: now },
      ),
    );
    await threadsTable()
      .update(
        mySide === "a" ? { user_a_read_at: now } : { user_b_read_at: now },
      )
      .eq("id", threadId);
  }

  useEffect(() => {
    if (user && myUserId) loadThreads();
  }, [user, myUserId, loadThreads]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      setReactionsByMsg({});
      hasLoadedRef.current = false;
      return;
    }
    loadMessages(activeThreadId);
    markRead(activeThreadId);
    // Reset per-thread refs.
    togglesInFlightRef.current.clear();
    wasAtBottomRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  // ─── Realtime subs ─────────────────────────────────────────────────

  const messagesConfig = useMemo(
    () =>
      myUserId
        ? { table: "vendor_partner_messages" as const }
        : null,
    [myUserId],
  );
  useRealtime(messagesConfig, (payload) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = ((payload as any)?.new ?? (payload as any)?.old) as
      | { thread_id?: string }
      | null;
    if (row?.thread_id && row.thread_id === activeThreadId) {
      loadMessages(row.thread_id);
    }
    loadThreads();
  });

  const reactionsConfig = useMemo(
    () =>
      activeThreadId
        ? { table: "vendor_partner_message_reactions" as const }
        : null,
    [activeThreadId],
  );
  useRealtime(reactionsConfig, () => {
    if (activeThreadId) loadMessages(activeThreadId);
  });

  // ─── Draft autosave per-thread ─────────────────────────────────────

  useEffect(() => {
    if (!activeThreadId) {
      setComposer("");
      draftHydratedRef.current = null;
      return;
    }
    if (draftHydratedRef.current === activeThreadId) return;
    draftHydratedRef.current = activeThreadId;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY(activeThreadId));
      setComposer(raw ?? "");
    } catch {
      setComposer("");
    }
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;
    if (draftHydratedRef.current !== activeThreadId) return;
    try {
      if (composer) {
        window.localStorage.setItem(DRAFT_KEY(activeThreadId), composer);
      } else {
        window.localStorage.removeItem(DRAFT_KEY(activeThreadId));
      }
    } catch {
      /* quota / private mode — ignore */
    }
  }, [composer, activeThreadId]);

  // ─── Auto-grow composer ────────────────────────────────────────────

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [composer]);

  // ─── Auto-scroll on new message — only if anchored at bottom ──────

  useEffect(() => {
    if (!messagesEndRef.current) return;
    if (!wasAtBottomRef.current && hasLoadedRef.current) return;
    messagesEndRef.current.scrollIntoView({
      behavior: hasLoadedRef.current ? "smooth" : "auto",
      block: "end",
    });
  }, [messages.length, otherTyping]);

  // ─── Active-now polling ────────────────────────────────────────────

  const activeThread = useMemo(
    () => threads.find((x) => x.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );
  const otherVendorUserId = useMemo(() => {
    if (!activeThread || !myUserId) return null;
    return activeThread.user_a_id === myUserId
      ? activeThread.user_b_id
      : activeThread.user_a_id;
  }, [activeThread, myUserId]);
  const otherProfile = useMemo<ProfileBrand | null>(() => {
    if (!activeThread || !myUserId) return null;
    return activeThread.user_a_id === myUserId
      ? activeThread.user_b
      : activeThread.user_a;
  }, [activeThread, myUserId]);
  const otherVendorName = useMemo(
    () => brandName(otherProfile),
    [otherProfile],
  );
  const otherVendorLogo = useMemo(
    () => brandLogo(otherProfile),
    [otherProfile],
  );

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

  // ─── Mute state ────────────────────────────────────────────────────

  useEffect(() => {
    if (!myUserId || !activeThreadId) {
      setMuted(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("thread_mutes")
        .select("user_id")
        .eq("thread_id", activeThreadId)
        .eq("user_id", myUserId)
        .maybeSingle();
      if (cancelled) return;
      setMuted(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [myUserId, activeThreadId]);

  async function toggleMute() {
    if (!myUserId || !activeThreadId) return;
    if (muted) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("thread_mutes")
        .delete()
        .eq("thread_id", activeThreadId)
        .eq("user_id", myUserId);
      if (error) {
        toast.error(error.message);
        return;
      }
      setMuted(false);
      toast.success("Unmuted");
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("thread_mutes")
        .insert({ thread_id: activeThreadId, user_id: myUserId });
      if (error) {
        toast.error(error.message);
        return;
      }
      setMuted(true);
      toast.success("Muted");
    }
  }

  async function archiveThread() {
    if (!myUserId || !activeThreadId || !activeThread) return;
    const mySide = activeThread.user_a_id === myUserId ? "a" : "b";
    const ok = window.confirm(
      "Hide this conversation from your list? It'll come back if the other vendor messages you again.",
    );
    if (!ok) return;
    const now = new Date().toISOString();
    const { error } = await threadsTable()
      .update(mySide === "a" ? { user_a_archived_at: now } : { user_b_archived_at: now })
      .eq("id", activeThreadId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Thread archived");
    setSearchParams({}, { replace: true });
    loadThreads();
  }

  async function reportThread() {
    if (!myUserId || !activeThreadId) return;
    const reason = window.prompt("What's wrong with this conversation?");
    if (!reason) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("thread_reports")
      .insert({
        thread_id: activeThreadId,
        reporter_id: myUserId,
        reason: reason.trim(),
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reported — we'll review.");
  }

  // ─── Composer + send ───────────────────────────────────────────────

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
      !activeThreadId ||
      !myUserId ||
      (!composer.trim() && pendingFiles.length === 0)
    ) {
      return;
    }
    setSending(true);
    // Storage policy for message-attachments accepts paths prefixed
    // with the uploader's auth.uid (mobile schema). Use that here so
    // partner uploads land cleanly without policy changes.
    const pathPrefix = `${myUserId}/${activeThreadId}`;
    const uploaded =
      pendingFiles.length > 0
        ? await uploadAttachments(pendingFiles, pathPrefix, (n, m) =>
            toast.error(`${n}: ${m}`),
          )
        : [];
    if (
      pendingFiles.length > 0 &&
      uploaded.length === 0 &&
      !composer.trim()
    ) {
      setSending(false);
      toast.error("Couldn't upload your attachments — message not sent.");
      return;
    }
    const { error } = await msgsTable().insert({
      thread_id: activeThreadId,
      sender_user_id: myUserId,
      body: composer.trim() || "(attachment)",
      attachments: uploaded,
      reply_to_message_id: replyToId,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComposer("");
    setPendingFiles([]);
    setReplyToId(null);
    try {
      window.localStorage.removeItem(DRAFT_KEY(activeThreadId));
    } catch {
      /* ignore */
    }
    // Realtime will fire loadMessages + loadThreads; skipping the
    // explicit refetch saves a round-trip.
  }

  async function sendBody(body: string) {
    if (!activeThreadId || !myUserId || !body.trim()) return;
    const { error } = await msgsTable().insert({
      thread_id: activeThreadId,
      sender_user_id: myUserId,
      body: body.trim(),
    });
    if (error) toast.error(error.message);
  }

  // ─── Reactions ─────────────────────────────────────────────────────

  async function toggleReaction(messageId: string, emoji: string) {
    if (!myUserId) return;
    const lockKey = `${messageId}:${emoji}`;
    if (togglesInFlightRef.current.has(lockKey)) return;
    togglesInFlightRef.current.add(lockKey);
    const existing = (reactionsByMsg[messageId] ?? []).find(
      (r) => r.user_id === myUserId && r.emoji === emoji,
    );
    setReactionsByMsg((prev) => {
      const next = { ...prev };
      const list = (next[messageId] ?? []).filter(
        (r) => !(r.user_id === myUserId && r.emoji === emoji),
      );
      if (!existing) list.push({ user_id: myUserId, emoji });
      next[messageId] = list;
      return next;
    });
    try {
      if (existing) {
        await reactionsTable()
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", myUserId)
          .eq("emoji", emoji);
      } else {
        await reactionsTable().insert({
          message_id: messageId,
          user_id: myUserId,
          emoji,
        });
      }
    } finally {
      togglesInFlightRef.current.delete(lockKey);
    }
  }

  // ─── Edit + delete ─────────────────────────────────────────────────

  function startEditing(msg: PartnerMessage) {
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
    const { error } = await msgsTable()
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
    const { error } = await msgsTable()
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

  // ─── Grouped items for render ─────────────────────────────────────

  const groupedItems = useMemo(
    () =>
      groupMessages(messages, {
        isMe: (m) => m.sender_user_id === myUserId,
        senderKey: (m) => m.sender_user_id,
        createdAt: (m) => m.created_at,
        id: (m) => m.id,
      }),
    [messages, myUserId],
  );

  const replyTarget = useMemo(
    () => (replyToId ? messages.find((m) => m.id === replyToId) ?? null : null),
    [replyToId, messages],
  );

  function authorNameOf(senderUserId: string): string {
    if (senderUserId === myUserId) return "You";
    return otherVendorName;
  }

  return (
    <div className="flex h-screen vendor-canvas overflow-hidden">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main
        id="main-content"
        className="flex-1 flex flex-col overflow-hidden pb-24 lg:pb-0"
      >
        {/* When a thread is open, mirror the inquiry flow: hide the
            Inbox header + tabs + threads list, render the chat full-
            width. The chat's own back button (chrome header) clears
            ?thread= and brings the list view back. */}
        {!activeThreadId ? (
          <div className="backdrop-blur-sm px-4 md:px-8 py-5 space-y-3 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-editorial text-3xl">Inbox</h1>
                <p className="text-sm text-muted-foreground">
                  Chat with other vendors directly — no host in the loop.
                </p>
              </div>
              <NotificationBell variant="light" />
            </div>
            <SubNavTabs tabs={VENDOR_INBOX_HUB_TABS} />
          </div>
        ) : null}

        <div
          className={
            activeThreadId
              ? "flex-1 min-h-0 flex flex-col"
              : "flex flex-1 min-h-0"
          }
        >
          <aside
            className={
              activeThreadId
                ? "hidden"
                : // Left-aligned thread list — was centered with
                  // mx-auto + max-w-2xl, which made an empty page
                  // look pulled to the middle. Now anchors left and
                  // grows up to 3xl so it stays readable on wide
                  // monitors without floating.
                  "flex-1 overflow-y-auto p-3 md:p-4 max-w-3xl w-full"
            }
          >
            {loadingThreads ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-2xl" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="glass-card py-12 px-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="font-display text-lg">No partner threads yet</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Open a vendor's profile and tap "Message vendor" to start
                  coordinating directly.
                </p>
              </div>
            ) : (
              <ul
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.6)",
                  border: "0.5px solid rgba(0,0,0,0.08)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                {threads.map((t, i) => {
                  const isActive = t.id === activeThreadId;
                  const isFirst = i === 0;
                  const other =
                    t.user_a_id === myUserId ? t.user_b : t.user_a;
                  const name = brandName(other);
                  const logo = brandLogo(other);
                  const initial = name.charAt(0).toUpperCase();
                  const lastSenderId = t.last_preview?.sender_user_id ?? null;
                  const myReadAt =
                    t.user_a_id === myUserId
                      ? t.user_a_read_at
                      : t.user_b_read_at;
                  const isUnread =
                    lastSenderId !== null &&
                    lastSenderId !== myUserId &&
                    (!myReadAt ||
                      new Date(t.last_message_at).getTime() >
                        new Date(myReadAt).getTime());
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
                          setSearchParams(
                            { thread: t.id },
                            { replace: true },
                          )
                        }
                        className={`w-full text-left flex items-stretch gap-3 px-4 py-3 transition-colors ${
                          isActive ? "bg-white/70" : "hover:bg-white/40"
                        } ${isFirst ? "" : "border-t border-foreground/[0.06]"}`}
                      >
                        <span
                          className="self-center shrink-0 w-2 h-2 rounded-full"
                          aria-label={isUnread ? "Unread" : undefined}
                        >
                          {isUnread ? (
                            <span className="block w-2 h-2 rounded-full bg-blue-500" />
                          ) : null}
                        </span>

                        {logo ? (
                          <img
                            src={logo}
                            alt=""
                            className="shrink-0 w-11 h-11 rounded-full object-cover self-center"
                          />
                        ) : (
                          <span
                            className="shrink-0 w-11 h-11 rounded-full inline-flex items-center justify-center font-semibold self-center"
                            style={{
                              background: "rgba(0,0,0,0.08)",
                              color: "#18181b",
                            }}
                            aria-hidden
                          >
                            {initial}
                          </span>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`truncate ${
                                isUnread
                                  ? "font-semibold"
                                  : "font-medium"
                              }`}
                            >
                              {name}
                            </p>
                            <span className="shrink-0 text-[11px] text-muted-foreground tnum">
                              {relativeTime(t.last_message_at)}
                            </span>
                          </div>
                          <p
                            className={`text-xs truncate ${
                              isUnread
                                ? "text-foreground/80"
                                : "text-muted-foreground"
                            }`}
                          >
                            {preview}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Right-side find-a-vendor panel. Hidden when a thread is
              open so the chat can take the full width. Lets a vendor
              search for another vendor by business name and start
              (or resume) a partner thread without leaving the page. */}
          {!activeThreadId ? (
            <FindVendorPanel meId={user?.id ?? null} />
          ) : null}

          {/* Chat pane is full-width when a thread is active.
              min-h-0 lets the inner messages scroller engage. */}
          <section
            className={
              activeThreadId
                ? "flex flex-col min-h-0 flex-1"
                : "hidden"
            }
          >
            {activeThreadId ? (
              <PartnerChatPane
                activeThreadId={activeThreadId}
                otherVendorName={otherVendorName}
                otherVendorLogo={otherVendorLogo}
                activeNow={activeNow}
                muted={muted}
                onBack={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("thread");
                  setSearchParams(next, { replace: true });
                }}
                onToggleMute={toggleMute}
                onArchive={archiveThread}
                onReport={reportThread}
                scrollerRef={scrollerRef}
                wasAtBottomRef={wasAtBottomRef}
                hasLoadedRef={hasLoadedRef}
                messagesEndRef={messagesEndRef}
                composerRef={composerRef}
                fileInputRef={fileInputRef}
                groupedItems={groupedItems}
                messages={messages}
                reactionsByMsg={reactionsByMsg}
                myUserId={myUserId}
                authorNameOf={authorNameOf}
                otherTyping={otherTyping}
                broadcastTyping={broadcastTyping}
                composer={composer}
                setComposer={setComposer}
                sending={sending}
                pendingFiles={pendingFiles}
                setPendingFiles={setPendingFiles}
                isDragOver={isDragOver}
                setIsDragOver={setIsDragOver}
                emojiOpen={emojiOpen}
                setEmojiOpen={setEmojiOpen}
                pinLocationOpen={pinLocationOpen}
                setPinLocationOpen={setPinLocationOpen}
                editingMessageId={editingMessageId}
                editingDraft={editingDraft}
                setEditingDraft={setEditingDraft}
                replyToId={replyToId}
                setReplyToId={setReplyToId}
                replyTarget={replyTarget}
                pickFiles={pickFiles}
                sendMessage={sendMessage}
                sendBody={sendBody}
                toggleReaction={toggleReaction}
                startEditing={startEditing}
                cancelEditing={cancelEditing}
                saveEdit={saveEdit}
                deleteMessage={deleteMessage}
              />
            ) : null}
          </section>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

// ─── Chat pane component ─────────────────────────────────────────────
// Extracted so the page component stays focused on data + state and
// the JSX-heavy thread + composer markup lives in one place.

type AnyRef<T> = MutableRefObject<T>;

function PartnerChatPane(props: {
  activeThreadId: string;
  otherVendorName: string;
  otherVendorLogo: string | null;
  activeNow: boolean;
  muted: boolean;
  onBack: () => void;
  onToggleMute: () => void;
  onArchive: () => void;
  onReport: () => void;
  scrollerRef: AnyRef<HTMLDivElement | null>;
  wasAtBottomRef: AnyRef<boolean>;
  hasLoadedRef: AnyRef<boolean>;
  messagesEndRef: AnyRef<HTMLDivElement | null>;
  composerRef: AnyRef<HTMLTextAreaElement | null>;
  fileInputRef: AnyRef<HTMLInputElement | null>;
  groupedItems: GroupedItem<PartnerMessage>[];
  messages: PartnerMessage[];
  reactionsByMsg: Record<string, MessageReaction[]>;
  myUserId: string | null;
  authorNameOf: (id: string) => string;
  otherTyping: boolean;
  broadcastTyping: () => void;
  composer: string;
  setComposer: (v: string) => void;
  sending: boolean;
  pendingFiles: File[];
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
  emojiOpen: boolean;
  setEmojiOpen: (v: boolean) => void;
  pinLocationOpen: boolean;
  setPinLocationOpen: (v: boolean) => void;
  editingMessageId: string | null;
  editingDraft: string;
  setEditingDraft: (v: string) => void;
  replyToId: string | null;
  setReplyToId: (v: string | null) => void;
  replyTarget: PartnerMessage | null;
  pickFiles: (l: FileList) => void;
  sendMessage: () => void;
  sendBody: (body: string) => void;
  toggleReaction: (id: string, emoji: string) => void;
  startEditing: (m: PartnerMessage) => void;
  cancelEditing: () => void;
  saveEdit: (id: string) => void;
  deleteMessage: (id: string) => void;
}) {
  const {
    otherVendorName,
    otherVendorLogo,
    activeNow,
    muted,
    onBack,
    onToggleMute,
    onArchive,
    onReport,
    scrollerRef,
    wasAtBottomRef,
    messagesEndRef,
    composerRef,
    fileInputRef,
    groupedItems,
    messages,
    reactionsByMsg,
    myUserId,
    authorNameOf,
    otherTyping,
    broadcastTyping,
    composer,
    setComposer,
    sending,
    pendingFiles,
    setPendingFiles,
    isDragOver,
    setIsDragOver,
    emojiOpen,
    setEmojiOpen,
    pinLocationOpen,
    setPinLocationOpen,
    editingMessageId,
    editingDraft,
    setEditingDraft,
    replyToId,
    setReplyToId,
    replyTarget,
    pickFiles,
    sendMessage,
    sendBody,
    toggleReaction,
    startEditing,
    cancelEditing,
    saveEdit,
    deleteMessage,
  } = props;

  const initial = (otherVendorName?.trim()?.charAt(0) ?? "V").toUpperCase();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Liquid-glass header — mirrors InquiryDetailPage so the
          vendor sees the same chrome across all chat surfaces:
          sticky, pill back button, avatar with online dot, name +
          chip, sub-line, pill info button. */}
      <div
        className="sticky top-0 z-40 px-4 md:px-6 py-3 backdrop-blur-md"
        style={{
          background: "rgba(255,255,255,0.85)",
          borderBottom: "0.5px solid rgba(0,0,0,0.08)",
        }}
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to threads"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-sm border border-border/40 text-foreground/80 hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="relative shrink-0">
            {otherVendorLogo ? (
              <img
                src={otherVendorLogo}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
                aria-hidden
              />
            ) : (
              <span
                className="w-10 h-10 rounded-full inline-flex items-center justify-center font-semibold"
                style={{
                  background: "rgba(0,0,0,0.08)",
                  color: "#18181b",
                }}
                aria-hidden
              >
                {initial}
              </span>
            )}
            {activeNow ? (
              <span
                aria-hidden
                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#fffdfa]"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-medium text-foreground truncate">
                {otherVendorName}
              </p>
              <span
                className="shrink-0 inline-flex items-center text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  color: "rgb(67,56,202)",
                }}
              >
                Partner
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {activeNow ? "Active now" : "Vendor-to-vendor chat"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Thread actions"
                className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/95 shadow-sm border border-border/40 text-foreground/80 hover:bg-white"
              >
                <Info className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onToggleMute} className="cursor-pointer">
                {muted ? (
                  <Bell className="w-4 h-4 mr-2" />
                ) : (
                  <BellOff className="w-4 h-4 mr-2" />
                )}
                {muted ? "Unmute thread" : "Mute thread"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchive} className="cursor-pointer">
                <Archive className="w-4 h-4 mr-2" />
                Archive thread
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onReport}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Flag className="w-4 h-4 mr-2" />
                Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Thread */}
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          wasAtBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-5"
      >
        <div className="max-w-3xl mx-auto space-y-1.5">
          {groupedItems.length === 0 ? (
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
                  {!it.isMe ? (
                    it.showTail ? (
                      otherVendorLogo ? (
                        <img
                          src={otherVendorLogo}
                          alt=""
                          className="shrink-0 w-6 h-6 rounded-full object-cover"
                          aria-hidden
                        />
                      ) : (
                        <span
                          className="shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-semibold"
                          style={{
                            background: "rgba(0,0,0,0.08)",
                            color: "#18181b",
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
                            return (
                              <MessageReplyContext
                                authorName={authorNameOf(parent.sender_user_id)}
                                body={parent.deleted_at ? "" : parent.body}
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
                        currentUserId={myUserId}
                        align={it.isMe ? "right" : "left"}
                        onToggle={(emoji) => toggleReaction(m.id, emoji)}
                      />
                    ) : null}
                    {!isDeleted && m.contact_info_flagged ? (
                      <p
                        className={`text-[10px] text-muted-foreground/80 mt-0.5 inline-flex items-center gap-1 ${
                          it.isMe ? "self-end pr-1" : "self-start pl-1"
                        }`}
                      >
                        <span aria-hidden>⚠</span>
                        Looks like contact info — kept on Vendora.
                      </p>
                    ) : null}
                    {it.showTail && !isDeleted ? (
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

          {otherTyping ? <TypingBubble withAvatarSpacer /> : null}

          <div ref={messagesEndRef} aria-hidden />
        </div>
      </div>

      {/* Sticky composer */}
      <div
        className="sticky bottom-24 lg:bottom-0 px-4 md:px-6 py-3 backdrop-blur-md"
        style={{
          background: "rgba(255,255,255,0.92)",
          borderTop: "0.5px solid rgba(0,0,0,0.08)",
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
          {/* Quick-action chips — only Pin location makes sense for
              vendor-to-vendor coordination today. Send-quote and
              share-availability are bound to inquiries. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPinLocationOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-background/95 border border-border/40 shadow-sm rounded-full px-3 py-1.5 hover:bg-background"
            >
              <MapPin className="w-3.5 h-3.5 text-accent" />
              Pin location
            </button>
          </div>

          <div
            className={`rounded-2xl transition ${
              isDragOver
                ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                : ""
            }`}
          >
            {replyTarget ? (
              <MessageReplyContext
                authorName={authorNameOf(replyTarget.sender_user_id)}
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
                          setComposer(`${composer}${e}`);
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
                onPaste={(e) => {
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
                placeholder={`Message ${otherVendorName}…`}
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

      <PinLocationDialog
        open={pinLocationOpen}
        onOpenChange={setPinLocationOpen}
        onSend={(body) => sendBody(body)}
      />
    </div>
  );
}

// Right-side panel: search any approved vendor by business name and
// open a partner thread with them. Uses the same find_or_create_partner_thread
// RPC that "Message vendor" on a public vendor profile uses, so an
// existing thread is reused instead of duplicated.
interface VendorSearchResult {
  id: string;
  user_id: string | null;
  business_name: string | null;
  category: string | null;
  location: string | null;
  logo_url: string | null;
}

function FindVendorPanel({ meId }: { meId: string | null }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  // Debounce so each keystroke doesn't fire a query — 200ms is the
  // sweet spot for "feels live" without spamming Supabase.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_profiles")
        .select("id, user_id, business_name, category, location, logo_url")
        .eq("application_status", "approved")
        .ilike("business_name", `%${q}%`)
        .order("business_name", { ascending: true })
        .limit(15);
      if (cancelled) return;
      const rows = ((data ?? []) as VendorSearchResult[]).filter(
        (r) => r.user_id && r.user_id !== meId,
      );
      setResults(rows);
      setSearching(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, meId]);

  async function startThread(r: VendorSearchResult) {
    if (!r.user_id || starting) return;
    setStarting(r.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "find_or_create_partner_thread",
      { p_other_user_id: r.user_id },
    );
    setStarting(null);
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't start the thread.");
      return;
    }
    navigate(`/vendor/partners?thread=${data}`);
  }

  const showEmpty = query.trim().length >= 2 && !searching && results.length === 0;

  return (
    <aside
      className="hidden lg:flex flex-col w-80 shrink-0 border-l p-4 gap-3 overflow-hidden"
      style={{
        borderColor: "rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.4)",
      }}
    >
      <div>
        <p className="text-sm font-semibold text-foreground">Find a vendor</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Search any approved vendor by business name to start a chat.
        </p>
      </div>
      <div className="relative">
        <Search
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Standard search-bar UX: Enter starts a thread with the
            // first result so a vendor can type → enter without
            // reaching for the mouse.
            if (e.key === "Enter" && !searching && results.length > 0) {
              e.preventDefault();
              void startThread(results[0]);
            }
          }}
          placeholder="Search vendors…"
          aria-label="Search vendors by business name"
          className="pl-9 rounded-full"
        />
      </div>
      <div
        className="flex-1 overflow-y-auto -mr-2 pr-2"
        aria-live="polite"
        aria-busy={searching}
      >
        {searching ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : showEmpty ? (
          <p className="text-xs text-muted-foreground py-4 px-2">
            No vendors match "{query.trim()}".
          </p>
        ) : results.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 px-2 leading-relaxed">
            Start typing — results show up after 2 characters.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((r) => {
              const label = r.business_name?.trim() || "Unnamed vendor";
              const sub = [r.category, r.location].filter(Boolean).join(" · ");
              const initial = (label[0] ?? "?").toUpperCase();
              const isStarting = starting === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={isStarting}
                    onClick={() => void startThread(r)}
                    className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-secondary/40 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"
                    style={{
                      background: "rgba(255,255,255,0.6)",
                      border: "0.5px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {r.logo_url ? (
                      <img
                        src={r.logo_url}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="w-9 h-9 rounded-full inline-flex items-center justify-center font-semibold shrink-0 text-sm"
                        style={{
                          background: "rgba(0,0,0,0.08)",
                          color: "#18181b",
                        }}
                      >
                        {initial}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground truncate">
                        {label}
                      </span>
                      {sub ? (
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {sub}
                        </span>
                      ) : null}
                    </span>
                    {isStarting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <UserPlus
                        className="w-4 h-4 text-muted-foreground shrink-0"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
