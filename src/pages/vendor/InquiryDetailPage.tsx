import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Check,
  X,
  RotateCcw,
  Send,
  Loader2,
  Star,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Inquiry {
  id: string;
  host_id: string;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  special_requests: string | null;
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
}

interface ReviewWithResponse {
  id: string;
  vendor_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  response: { body: string; updated_at: string } | null;
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
  const [responseDraft, setResponseDraft] = useState("");
  const [responseEditing, setResponseEditing] = useState(false);
  const [savingResponse, setSavingResponse] = useState(false);

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
    const all = (msgs as Message[]) ?? [];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reviewRow } = await (supabase as any)
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
      setResponseDraft(normalized.response?.body ?? "");
    } else {
      setReview(null);
      setResponseDraft("");
    }

    setLoading(false);
  }

  async function saveResponse() {
    if (!review || !responseDraft.trim()) return;
    setSavingResponse(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (supabase as any).from("review_responses");
    const { error } = review.response
      ? await tbl.update({ body: responseDraft.trim() }).eq("review_id", review.id)
      : await tbl.insert({
          review_id: review.id,
          vendor_id: review.vendor_id,
          body: responseDraft.trim(),
        });
    setSavingResponse(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Response saved");
    setResponseEditing(false);
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

  // Realtime: re-fetch on messages or inquiry status change.
  useEffect(() => {
    if (!inquiryId) return;
    const channel = supabase
      .channel(`vendor-inquiry-${inquiryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `inquiry_id=eq.${inquiryId}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "inquiries",
          filter: `id=eq.${inquiryId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

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

  async function sendMessage() {
    if (!composer.trim() || !inquiryId || !user) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      inquiry_id: inquiryId,
      sender_id: user.id,
      sender_role: "vendor",
      body: composer.trim(),
      sent_at: new Date().toISOString(),
    });
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

        {/* Review (only when host has posted one) */}
        {review && (
          <div className="bg-card border border-border rounded-sm p-6">
            <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="font-label text-muted-foreground">
                  Host review
                </p>
                <span className="text-xs text-muted-foreground tnum">
                  {new Date(review.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-1">
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
                <span className="ml-1.5 text-sm font-medium tnum">
                  {review.rating}
                </span>
              </div>
            </div>
            {review.body ? (
              <p className="text-sm leading-relaxed text-foreground/85">
                "{review.body}"
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No written feedback.
              </p>
            )}

            <div className="mt-5 pt-5 border-t border-border">
              {review.response && !responseEditing ? (
                <>
                  <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
                    <p className="font-label text-accent flex items-center gap-1.5">
                      <MessageCircle className="w-3 h-3" />
                      Your response
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => setResponseEditing(true)}
                    >
                      Edit
                    </Button>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/85">
                    {review.response.body}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-label text-muted-foreground mb-2">
                    {review.response ? "Edit your response" : "Respond"}
                  </p>
                  <Textarea
                    value={responseDraft}
                    onChange={(e) => setResponseDraft(e.target.value)}
                    rows={3}
                    placeholder="Thanks for the kind words…"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    {review.response && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          setResponseEditing(false);
                          setResponseDraft(review.response?.body ?? "");
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={saveResponse}
                      disabled={savingResponse || !responseDraft.trim()}
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      {savingResponse ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Saving…
                        </>
                      ) : review.response ? (
                        "Save"
                      ) : (
                        "Post response"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
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
          <div className="flex justify-end mt-3">
            <Button
              onClick={sendMessage}
              disabled={sending || !composer.trim()}
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
    </div>
  );
}
