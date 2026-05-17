import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Check,
  X,
  RotateCcw,
  Send,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { groupMessages } from "@/lib/threadFormatting";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { TemplatePicker } from "@/components/messages/TemplatePicker";
import {
  uploadAttachments,
  validateAttachment,
  ACCEPTED_MIME,
  MAX_FILES,
  type MessageAttachment,
} from "@/lib/messageAttachments";
import { FileText, Paperclip, CalendarDays } from "lucide-react";
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
  host: { display_name: string | null } | null;
}

interface Message {
  id: string;
  body: string;
  sender_role: "host" | "vendor" | "agent";
  created_at: string;
  attachments?: MessageAttachment[];
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
  new: "New",
  drafted: "AI drafting",
  replied: "Replied",
  won: "Booked",
  lost: "Closed",
  expired: "Expired",
};

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // useCallback so the realtime hook below sees a stable reference
  // across renders; without this, every render replaces the realtime
  // subscription's callback and the previous binding's cleanup path
  // can drift on rapid open/close cycles, slowly leaking listeners.
  const load = useCallback(async () => {
    if (!inquiryId) return;
    const { data: i } = await supabase
      .from("inquiries")
      .select("*, host:profiles!inquiries_host_id_fkey(display_name)")
      .eq("id", inquiryId)
      .maybeSingle();
    setInquiry(i as unknown as Inquiry);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tid } = await (supabase as any).rpc("ensure_inquiry_thread", {
      p_inquiry_id: inquiryId,
    });
    const thread = (tid as string | null) ?? null;
    setThreadId(thread);
    if (thread) {
      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("id, body, sender_role, created_at, attachments")
        .eq("thread_id", thread)
        .order("created_at", { ascending: true });
      setMessages((msgs as unknown as Message[]) ?? []);
    } else {
      setMessages([]);
    }

    // Review (if host left one) + vendor response
    const { data: reviewRow } = await supabase
      .from("reviews")
      .select(
        "id, vendor_id, rating, body, created_at, response:review_responses(body, updated_at)",
      )
      .eq("inquiry_id", inquiryId)
      .maybeSingle();
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

    // Proposals on this inquiry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: props } = await (supabase as any)
      .from("proposals")
      .select(
        "id, title, line_items, subtotal_cents, deposit_cents, terms, contract_body, status, sent_at, signed_at, signed_name, first_viewed_at, last_viewed_at, view_count, share_token",
      )
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false });
    setProposals((props as unknown as Proposal[]) ?? []);

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

  const inquiryConfig = useMemo(
    () =>
      inquiryId
        ? { table: "inquiries", event: "UPDATE" as const, filter: `id=eq.${inquiryId}` }
        : null,
    [inquiryId],
  );
  useRealtime(inquiryConfig, load);

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
      sender_role: "vendor",
      body: composer.trim() || "(attachment)",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: uploaded,
    } as any);
    if (error) {
      setSending(false);
      return toast.error(error.message);
    }
    await transitionToReplied();
    setComposer("");
    setPendingFiles([]);
    setSending(false);
    load();
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
  const eventLabel = inquiry.event_type.replace(/_/g, " ");
  const dateChip = inquiry.event_date
    ? (() => {
        const [y, m, d] = inquiry.event_date.split("T")[0].split("-").map(Number);
        if (!y || !m || !d) return inquiry.event_date;
        return new Date(y, m - 1, d).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      })()
    : null;
  const budgetChip =
    inquiry.budget_min_cents != null || inquiry.budget_max_cents != null
      ? `${fmtMoney(inquiry.budget_min_cents)} – ${fmtMoney(inquiry.budget_max_cents)}`
      : null;
  const guestChip =
    inquiry.guest_count != null ? `${inquiry.guest_count} guests` : null;

  return (
    <div className="min-h-screen vendor-canvas flex flex-col">
      {/* ─── Sticky chat header ─────────────────────────────────────────
          Compact bar: back arrow, host avatar+name+event type, status
          dot, "..." menu for all the secondary actions (proposal,
          meeting, mark booked, close, view details). The chat itself
          is the rest of the screen. */}
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
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span
            className="shrink-0 w-10 h-10 rounded-full inline-flex items-center justify-center font-semibold"
            style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground truncate leading-tight">
              {hostName}
            </p>
            <p className="text-[12px] text-muted-foreground capitalize truncate leading-tight">
              {eventLabel}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`${statusStyles[inquiry.status] ?? ""} shrink-0`}
          >
            {statusLabel[inquiry.status] ?? inquiry.status}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More actions"
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 text-muted-foreground"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {!isClosed ? (
                <>
                  <DropdownMenuItem
                    onClick={() => setProposalModalOpen(true)}
                    className="cursor-pointer"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Send proposal
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setAppointmentModalOpen(true)}
                    className="cursor-pointer"
                  >
                    <CalendarDays className="w-4 h-4 mr-2" />
                    Propose meeting
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={statusUpdating}
                    onClick={() => setStatus("won")}
                    className="cursor-pointer"
                  >
                    <Check className="w-4 h-4 mr-2 text-emerald-600" />
                    Mark as booked
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={statusUpdating}
                    onClick={() => setStatus("lost")}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Close inquiry
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  disabled={statusUpdating}
                  onClick={() => setStatus("replied")}
                  className="cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reopen inquiry
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Chip strip — date / guests / budget / location at a glance */}
        {(dateChip || guestChip || budgetChip || inquiry.location) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2 max-w-3xl mx-auto pl-12">
            {dateChip ? <Chip>📅 {dateChip}</Chip> : null}
            {guestChip ? <Chip>👥 {guestChip}</Chip> : null}
            {budgetChip ? <Chip>💵 {budgetChip}</Chip> : null}
            {inquiry.location ? <Chip>📍 {inquiry.location}</Chip> : null}
          </div>
        )}
      </div>

      {/* ─── Chat thread (scrolling area) ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-1.5">
          {/* Pinned: the original inquiry, rendered as the host's
              "opening message" so the thread starts with their ask. */}
          {inquiry.special_requests && (
            <div className="max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-secondary mt-2">
              <p className="text-[10px] uppercase tracking-wider opacity-60 mb-1">
                Inquiry from {hostName}
              </p>
              <p>{inquiry.special_requests}</p>
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
            groupMessages(messages, {
              isMe: (m) =>
                m.sender_role === "vendor" || m.sender_role === "agent",
              senderKey: (m) =>
                m.sender_role === "agent" ? "vendor" : m.sender_role,
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
              const isAi = m.sender_role === "agent";
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
                  {isAi ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-80 mb-1">
                      <Sparkles className="w-3 h-3" />
                      Sent by AI
                    </span>
                  ) : null}
                  <p>{m.body}</p>
                  {m.attachments && m.attachments.length > 0 && (
                    <MessageAttachments attachments={m.attachments} />
                  )}
                </div>
              );
            })
          )}

          {/* Review as a system bubble at the end of the thread */}
          {review && (
            <div className="my-4">
              <InquiryReviewCard review={review} onResponseSaved={load} />
            </div>
          )}
        </div>
      </div>

      {/* ─── Sticky composer ─────────────────────────────────────────── */}
      <div
        className="sticky bottom-0 px-4 md:px-6 py-3 backdrop-blur-md"
        style={{
          background: "rgba(255,253,250,0.92)",
          borderTop: "0.5px solid rgba(255,138,76,0.18)",
        }}
      >
        <div className="max-w-3xl mx-auto">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingFiles.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-secondary rounded-full text-xs"
                >
                  {f.name}
                  <button
                    type="button"
                    onClick={() =>
                      setPendingFiles((prev) => prev.filter((_, j) => j !== i))
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
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || pendingFiles.length >= MAX_FILES}
              aria-label="Attach files"
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 text-muted-foreground disabled:opacity-50"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <TemplatePicker
              vendorId={inquiry?.vendor_id ?? null}
              onPick={(body) =>
                setComposer((prev) =>
                  prev.trim() ? `${prev}\n\n${body}` : body,
                )
              }
            />
            <Textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              rows={1}
              placeholder="iMessage"
              className="resize-none min-h-[40px] max-h-32 rounded-2xl"
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
                sending || (!composer.trim() && pendingFiles.length === 0)
              }
              aria-label="Send"
              className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 h-10 w-10 p-0"
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
        </>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-foreground/75"
      style={{
        background: "rgba(255,138,76,0.10)",
        border: "0.5px solid rgba(255,138,76,0.22)",
      }}
    >
      {children}
    </span>
  );
}

