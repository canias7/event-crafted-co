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
  is_draft: boolean;
  draft_status: string | null;
  sent_at: string | null;
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
  const [aiDraft, setAiDraft] = useState<Message | null>(null);
  const [composer, setComposer] = useState("");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
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

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true });
    const all = ((msgs as unknown) as Message[]) ?? [];
    setMessages(all.filter((m) => !m.is_draft));
    const draft = all
      .filter(
        (m) =>
          m.is_draft &&
          m.draft_status === "pending_approval" &&
          m.sender_role === "agent",
      )
      .pop();
    setAiDraft(draft ?? null);

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
    const { data: props } = await supabase
      .from("proposals")
      .select(
        "id, title, line_items, subtotal_cents, deposit_cents, terms, contract_body, status, sent_at, signed_at, signed_name",
      )
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false });
    setProposals((props as Proposal[]) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

  // Realtime: re-fetch on messages or inquiry status change. Two
  // listeners on the shared user-scoped channel — the provider de-dupes
  // by table+event so this stays cheap.
  const messagesConfig = useMemo(
    () =>
      inquiryId
        ? { table: "messages", filter: `inquiry_id=eq.${inquiryId}` }
        : null,
    [inquiryId],
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
    await supabase
      .from("inquiries")
      .update({ status: "replied" })
      .eq("id", inquiryId);
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

  async function approveDraft() {
    if (!aiDraft) return;
    const { error } = await supabase
      .from("messages")
      .update({
        is_draft: false,
        draft_status: "approved",
        sent_at: new Date().toISOString(),
      })
      .eq("id", aiDraft.id);
    if (error) return toast.error(error.message);
    await transitionToReplied();
    toast.success("Reply sent");
    load();
  }

  async function discardDraft() {
    if (!aiDraft) return;
    const { error } = await supabase
      .from("messages")
      .update({ draft_status: "discarded" })
      .eq("id", aiDraft.id);
    if (error) return toast.error(error.message);
    setAiDraft(null);
    toast.success("Draft discarded");
  }

  function editDraft() {
    if (!aiDraft) return;
    setComposer(aiDraft.body);
    setEditingDraftId(aiDraft.id);
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
    if ((!composer.trim() && pendingFiles.length === 0) || !inquiryId || !user)
      return;
    setSending(true);
    const uploaded =
      pendingFiles.length > 0
        ? await uploadAttachments(pendingFiles, inquiryId, (n, m) =>
            toast.error(`${n}: ${m}`),
          )
        : [];
    const { error } = await supabase.from("messages").insert({
      inquiry_id: inquiryId,
      sender_id: user.id,
      sender_role: "vendor",
      body: composer.trim() || "(attachment)",
      sent_at: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: uploaded,
    } as any);
    if (error) {
      setSending(false);
      return toast.error(error.message);
    }
    if (editingDraftId) {
      await supabase
        .from("messages")
        .update({ draft_status: "edited" })
        .eq("id", editingDraftId);
      setEditingDraftId(null);
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
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
        <Link
          to="/vendor/inbox"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to inbox
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Summary */}
        <div className="bg-card border border-border rounded-sm p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-label text-muted-foreground">From</p>
              <h1 className="font-display text-2xl">
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
                <ul className="space-y-1.5 bg-secondary/40 rounded-sm p-3 text-sm">
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
            <div className="mt-4 p-3 rounded-sm bg-secondary/60 text-sm">
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
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        )}

        {/* Album CTA — surfaces once the inquiry is booked */}
        {inquiry.status === "won" && (
          <AlbumCta
            inquiryId={inquiry.id}
            vendorId={inquiry.vendor_id}
            hostId={inquiry.host_id}
          />
        )}

        {/* Review (only when host has posted one) */}
        {review && (
          <InquiryReviewCard review={review} onResponseSaved={load} />
        )}

        {/* Thread */}
        <div className="bg-card border border-border rounded-sm p-6 space-y-4">
          <p className="font-label text-muted-foreground">Conversation</p>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No messages yet.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`p-4 rounded-sm ${
                  m.sender_role === "vendor" || m.sender_role === "agent"
                    ? "bg-accent/10 ml-8"
                    : "bg-secondary/60 mr-8"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium capitalize">
                    {m.sender_role === "agent" ? "you (AI)" : m.sender_role}
                  </span>
                  <span className="text-xs text-muted-foreground tnum">
                    {new Date(m.sent_at ?? m.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {m.body}
                </p>
                {m.attachments && m.attachments.length > 0 && (
                  <MessageAttachments attachments={m.attachments} />
                )}
              </div>
            ))
          )}
        </div>

        {/* AI Draft Panel */}
        <div className="bg-card border border-accent/40 rounded-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-accent" />
            <p className="font-label text-accent">AI Draft</p>
          </div>
          {aiDraft ? (
            <>
              <div className="p-4 rounded-sm bg-accent/5 border border-accent/20 text-sm leading-relaxed whitespace-pre-wrap">
                {aiDraft.body}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  onClick={approveDraft}
                  className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Approve & Send
                </Button>
                <Button
                  variant="outline"
                  onClick={editDraft}
                  className="rounded-full"
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  onClick={discardDraft}
                  className="rounded-full"
                >
                  Discard
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No AI draft yet</p>
          )}
        </div>

        {/* Composer */}
        <div className="bg-card border border-border rounded-sm p-6">
          <p className="font-label text-muted-foreground mb-3">
            {editingDraftId ? "Edit AI draft & send" : "Reply"}
          </p>
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

function AlbumCta({
  inquiryId,
  vendorId,
  hostId,
}: {
  inquiryId: string;
  vendorId: string;
  hostId: string;
}) {
  const [existing, setExisting] = useState<{
    id: string;
    share_token: string;
    published_at: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("event_albums")
      .select("id, share_token, published_at")
      .eq("inquiry_id", inquiryId)
      .maybeSingle()
      .then(({ data }: { data: typeof existing }) => {
        if (cancelled) return;
        setExisting(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inquiryId]);

  async function create() {
    setCreating(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("event_albums").insert({
      vendor_id: vendorId,
      inquiry_id: inquiryId,
      host_id: hostId,
      title: "Event album",
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Album created — finish setup on your profile");
    navigate("/vendor/profile");
  }

  if (loading) return null;

  return (
    <div className="bg-card border border-accent/30 rounded-sm p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-label text-accent">Photo album</p>
          <p className="text-sm text-foreground/85 mt-1">
            {existing
              ? existing.published_at
                ? "Album is live — share the link with the host."
                : "Album draft started — finish setup on your profile."
              : "Deliver the gallery to the host with a single shareable link."}
          </p>
        </div>
        {existing ? (
          existing.published_at ? (
            <a
              href={`/album/${existing.share_token}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                View album
              </Button>
            </a>
          ) : (
            <Link to="/vendor/profile">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Edit album
              </Button>
            </Link>
          )
        ) : (
          <Button
            size="sm"
            onClick={create}
            disabled={creating}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 mr-1.5" />
            )}
            Create album
          </Button>
        )}
      </div>
    </div>
  );
}
