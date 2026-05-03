import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
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

  async function load() {
    if (!inquiryId) return;
    const { data: i } = await supabase
      .from("inquiries")
      .select("*, host:profiles!inquiries_host_id_fkey(display_name)")
      .eq("id", inquiryId)
      .maybeSingle();
    setInquiry(i as any);

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true });
    const all = (msgs as Message[]) ?? [];
    setMessages(all.filter((m) => !m.is_draft));
    const draft = all
      .filter((m) => m.is_draft && m.draft_status === "pending_approval" && m.sender_role === "agent")
      .pop();
    setAiDraft(draft ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

  async function approveDraft() {
    if (!aiDraft) return;
    const { error } = await supabase
      .from("messages")
      .update({ is_draft: false, draft_status: "approved", sent_at: new Date().toISOString() })
      .eq("id", aiDraft.id);
    if (error) return toast.error(error.message);
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
    const { error } = await supabase.from("messages").insert({
      inquiry_id: inquiryId,
      sender_id: user.id,
      sender_role: "vendor",
      body: composer.trim(),
      sent_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    if (editingDraftId) {
      await supabase.from("messages").update({ draft_status: "edited" }).eq("id", editingDraftId);
      setEditingDraftId(null);
    }
    setComposer("");
    load();
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!inquiry) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Inquiry not found</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
        <Link to="/vendor/inbox" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to inbox
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Summary */}
        <div className="bg-card border border-border rounded-2xl p-6 card-shadow">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-label text-muted-foreground">From</p>
              <h1 className="font-display text-2xl">{inquiry.host?.display_name ?? "Host"}</h1>
              <p className="text-sm text-muted-foreground capitalize mt-1">
                {inquiry.event_type.replace("_", " ")} · {inquiry.event_date ?? "TBD"} · {inquiry.guest_count ?? "?"} guests
              </p>
            </div>
            <Badge className="capitalize">{inquiry.status}</Badge>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-6">
            <div>
              <p className="font-label text-muted-foreground">Location</p>
              <p className="text-sm mt-1">{inquiry.location ?? "—"}</p>
            </div>
            <div>
              <p className="font-label text-muted-foreground">Budget</p>
              <p className="text-sm tnum mt-1">{fmtMoney(inquiry.budget_min_cents)} – {fmtMoney(inquiry.budget_max_cents)}</p>
            </div>
            <div>
              <p className="font-label text-muted-foreground">Scores</p>
              <p className="text-sm tnum mt-1">
                Q {inquiry.quality_score ?? "—"} · I {inquiry.intent_score ?? "—"}
              </p>
            </div>
          </div>

          {inquiry.special_requests && (
            <div className="mt-6">
              <p className="font-label text-muted-foreground">Special requests</p>
              <p className="text-sm mt-1 leading-relaxed">{inquiry.special_requests}</p>
            </div>
          )}

          {inquiry.recommended_verification && (
            <div className="mt-4 p-3 rounded-lg bg-secondary/60 text-sm">
              <span className="font-medium">Recommended verification: </span>
              {inquiry.recommended_verification}
            </div>
          )}
        </div>

        {/* Thread */}
        <div className="bg-card border border-border rounded-2xl p-6 card-shadow space-y-4">
          <p className="font-label text-muted-foreground">Conversation</p>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`p-4 rounded-lg ${m.sender_role === "vendor" ? "bg-accent/10 ml-8" : "bg-secondary/60 mr-8"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium capitalize">{m.sender_role}</span>
                  <span className="text-xs text-muted-foreground tnum">
                    {new Date(m.sent_at ?? m.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
              </div>
            ))
          )}
        </div>

        {/* AI Draft Panel */}
        <div className="bg-card border border-accent/40 rounded-2xl p-6 card-shadow">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-accent" />
            <p className="font-label text-accent">AI Draft</p>
          </div>
          {aiDraft ? (
            <>
              <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 text-sm leading-relaxed whitespace-pre-wrap">
                {aiDraft.body}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button onClick={approveDraft} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  Approve & Send
                </Button>
                <Button variant="outline" onClick={editDraft}>Edit</Button>
                <Button variant="ghost" onClick={discardDraft}>Discard</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No AI draft yet</p>
          )}
        </div>

        {/* Composer */}
        <div className="bg-card border border-border rounded-2xl p-6 card-shadow">
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
            <Button onClick={sendMessage} disabled={!composer.trim()}>Send</Button>
          </div>
        </div>
      </div>
    </div>
  );
}