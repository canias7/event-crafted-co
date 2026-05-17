import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Check,
  X,
  RotateCcw,
  Send,
  Loader2,
} from "lucide-react";
import { groupMessages } from "@/lib/threadFormatting";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { HostReputationCard } from "@/components/vendor/HostReputationCard";
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

  async function load() {
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
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

  // Realtime: re-fetch on direct_messages for this thread + inquiry
  // status changes. Mobile uses the same model — see ensure_inquiry_thread.
  const messagesConfig = useMemo(
    () =>
      threadId
        ? { table: "direct_messages", filter: `thread_id=eq.${threadId}` }
        : null,
    [threadId],
  );
  useRealtime(messagesConfig, () => load());

  const inquiryConfig = useMemo(
    () =>
      inquiryId
        ? { table: "inquiries", event: "UPDATE" as const, filter: `id=eq.${inquiryId}` }
        : null,
    [inquiryId],
  );
  useRealtime(inquiryConfig, () => load());

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

  return (
    <div className="min-h-screen vendor-canvas">
      <div className="border-b border-border/40 bg-card/60 backdrop-blur px-4 md:px-8 py-5 sticky top-0 z-40">
        <Link
          to="/vendor/inbox"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to inbox
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Summary */}
        <div className="card-soft p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-label text-muted-foreground">From</p>
              <h1 className="font-editorial text-3xl">
                {inquiry.host?.display_name ?? "Host"}
              </h1>
              <p className="text-sm text-muted-foreground capitalize mt-1">
                {inquiry.event_type.replace("_", " ")} ·{" "}
                {inquiry.event_date ?? "TBD"} · {inquiry.guest_count ?? "?"}{" "}
                guests
              </p>
            </div>
            <Badge
              variant="outline"
              className={statusStyles[inquiry.status] ?? ""}
            >
              {statusLabel[inquiry.status] ?? inquiry.status}
            </Badge>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-6">
            <div>
              <p className="font-label text-muted-foreground">Location</p>
              <p className="text-sm mt-1">{inquiry.location ?? "—"}</p>
            </div>
            <div>
              <p className="font-label text-muted-foreground">Budget</p>
              <p className="text-sm tnum mt-1">
                {fmtMoney(inquiry.budget_min_cents)} –{" "}
                {fmtMoney(inquiry.budget_max_cents)}
              </p>
            </div>
            <div>
              <p className="font-label text-muted-foreground">Scores</p>
              <p className="text-sm tnum mt-1">
                Q {inquiry.quality_score ?? "—"} · I{" "}
                {inquiry.intent_score ?? "—"}
              </p>
            </div>
          </div>

          {inquiry.intake_answers &&
            Object.keys(inquiry.intake_answers).length > 0 && (
              <div className="mt-6">
                <p className="font-label text-muted-foreground mb-2">
                  Intake form answers
                </p>
                <ul className="space-y-1.5 bg-secondary/40 rounded-2xl p-3 text-sm">
                  {Object.entries(inquiry.intake_answers).map(([qid, val]) => (
                    <li key={qid} className="leading-relaxed">
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">
                        {qid.slice(0, 8)}…{" "}
                      </span>
                      {Array.isArray(val) ? val.join(", ") : String(val)}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  Question labels: see your published intake form on
                  /vendor/profile.
                </p>
              </div>
            )}

          {inquiry.special_requests && (
            <div className="mt-6">
              <p className="font-label text-muted-foreground">
                Special requests
              </p>
              <p className="text-sm mt-1 leading-relaxed">
                {inquiry.special_requests}
              </p>
            </div>
          )}

          {inquiry.recommended_verification && (
            <div className="mt-4 p-3 rounded-2xl bg-secondary/60 text-sm">
              <span className="font-medium">Recommended verification: </span>
              {inquiry.recommended_verification}
            </div>
          )}

          {/* Status actions */}
          <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-border">
            {!isClosed ? (
              <>
                <Button
                  size="sm"
                  onClick={() => setProposalModalOpen(true)}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Send proposal
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAppointmentModalOpen(true)}
                  className="rounded-full"
                >
                  <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                  Propose meeting
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={statusUpdating}
                  onClick={() => setStatus("won")}
                  className="rounded-full"
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Mark as booked
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={statusUpdating}
                  onClick={() => setStatus("lost")}
                  className="rounded-full"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Close inquiry
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={statusUpdating}
                onClick={() => setStatus("replied")}
                className="rounded-full"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reopen
              </Button>
            )}
          </div>
        </div>

        {/* Host signals — cross-vendor reputation snapshot */}
        <HostReputationCard
          hostId={inquiry.host_id}
          vendorId={inquiry.vendor_id}
          inquiryId={inquiry.id}
        />

        {/* Proposals */}
        {proposals.length > 0 && (
          <div className="space-y-4">
            {proposals.map((p) => (
              <div key={p.id}>
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
          </div>
        )}


        {/* Review (only when host has posted one) */}
        {review && (
          <InquiryReviewCard review={review} onResponseSaved={load} />
        )}

        {/* Thread */}
        <div className="card-soft p-6 space-y-4">
          <p className="font-label text-muted-foreground">Conversation</p>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No messages yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {groupMessages(messages, {
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
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="card-soft p-6">
          <p className="font-label text-muted-foreground mb-3">Reply</p>
          <Textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            rows={5}
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
          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
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
              <TemplatePicker
                vendorId={inquiry?.vendor_id ?? null}
                onPick={(body) =>
                  setComposer((prev) =>
                    prev.trim() ? `${prev}\n\n${body}` : body,
                  )
                }
              />
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
                sending || (!composer.trim() && pendingFiles.length === 0)
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

