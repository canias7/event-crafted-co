import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Send, Loader2, Star, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewFormModal } from "@/components/reviews/ReviewFormModal";
import {
  ProposalCard,
  type Proposal,
} from "@/components/proposals/ProposalCard";
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
  vendor: {
    business_name: string;
    category: string;
  } | null;
}

interface ExistingReview {
  id: string;
  rating: number;
  body: string | null;
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
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [review, setReview] = useState<ExistingReview | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [acting, setActing] = useState<"accept" | "reject" | null>(null);

  async function load() {
    if (!inquiryId || !user) return;
    setLoading(true);

    const { data: i, error: iErr } = await supabase
      .from("inquiries")
      .select(
        "id, vendor_id, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, status, created_at, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name, category)",
      )
      .eq("id", inquiryId)
      .maybeSingle();

    if (iErr || !i) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setInquiry(i as unknown as Inquiry);

    const { data: msgs } = await supabase
      .from("messages")
      .select(
        "id, body, sender_role, is_draft, draft_status, sent_at, created_at",
      )
      .eq("inquiry_id", inquiryId)
      .eq("is_draft", false)
      .order("created_at", { ascending: true });

    setMessages((msgs as Message[]) ?? []);

    // Existing review (if any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: r } = await (supabase as any)
      .from("reviews")
      .select("id, rating, body")
      .eq("inquiry_id", inquiryId)
      .maybeSingle();
    setReview((r as ExistingReview | null) ?? null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: props } = await (supabase as any)
      .from("proposals")
      .select(
        "id, title, line_items, subtotal_cents, deposit_cents, terms, status, sent_at",
      )
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false });
    setProposals((props as Proposal[]) ?? []);

    setLoading(false);
  }

  async function respondProposal(p: Proposal, action: "accepted" | "rejected") {
    setActing(action === "accepted" ? "accept" : "reject");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("proposals")
      .update({ status: action, responded_at: new Date().toISOString() })
      .eq("id", p.id);
    setActing(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      action === "accepted" ? "Proposal accepted — you're booked." : "Proposal declined",
    );
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId, user]);

  // Live updates: re-fetch when this inquiry's messages or status change.
  useEffect(() => {
    if (!inquiryId) return;
    const channel = supabase
      .channel(`host-inquiry-${inquiryId}`)
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

  async function sendMessage() {
    if (!composer.trim() || !inquiryId || !user) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      inquiry_id: inquiryId,
      sender_id: user.id,
      sender_role: "host",
      body: composer.trim(),
      sent_at: new Date().toISOString(),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setComposer("");
    load();
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen bg-background">
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
            <h1 className="font-display text-2xl mb-2">Inquiry not found</h1>
            <p className="text-sm text-muted-foreground">
              This inquiry doesn't exist or you don't have access.
            </p>
          </div>
        </main>
        <MobileNav items={navItems} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
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
                <div className="bg-card border border-border rounded-sm p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                      <p className="font-label text-muted-foreground">To</p>
                      <h1 className="font-display text-2xl">
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
                  <div className="bg-card border border-accent/30 bg-accent/5 rounded-sm p-6">
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
                        onClick={() => setReviewModalOpen(true)}
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
                        onAccept={() => respondProposal(p, "accepted")}
                        onReject={() => respondProposal(p, "rejected")}
                      />
                    ))}
                  </div>
                )}

                {/* Thread */}
                <div className="bg-card border border-border rounded-sm p-6 space-y-4">
                  <p className="font-label text-muted-foreground">
                    Conversation
                  </p>
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No messages yet — your inquiry has been sent and the
                      vendor will reply soon.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const isHost = m.sender_role === "host";
                      const senderLabel = isHost
                        ? "You"
                        : (inquiry.vendor?.business_name ?? "Vendor");
                      return (
                        <div
                          key={m.id}
                          className={`p-4 rounded-sm ${
                            isHost
                              ? "bg-accent/10 ml-8 sm:ml-16"
                              : "bg-secondary/60 mr-8 sm:mr-16"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium">
                              {senderLabel}
                            </span>
                            <span className="text-xs text-muted-foreground tnum">
                              {new Date(
                                m.sent_at ?? m.created_at,
                              ).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {m.body}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer */}
                <div className="bg-card border border-border rounded-sm p-6">
                  <p className="font-label text-muted-foreground mb-3">Reply</p>
                  <Textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    rows={4}
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
              </>
            )
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {inquiry && user && (
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
      )}
    </div>
  );
}
