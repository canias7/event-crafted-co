import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Loader2,
  Send,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  LifeBuoy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/lib/realtime";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { customerNavItems, vendorNavItems } from "@/data/navItems";

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
}

export const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "account", label: "Account" },
  { value: "billing", label: "Billing" },
  { value: "booking", label: "Booking" },
  { value: "vendor_issue", label: "Vendor issue" },
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Other" },
];

export const STATUS_META: Record<
  SupportTicket["status"],
  { label: string; tone: string; Icon: typeof Clock }
> = {
  open: { label: "Open", tone: "bg-accent/15 text-accent border-accent/30", Icon: AlertCircle },
  in_progress: { label: "In progress", tone: "bg-secondary text-foreground border-border", Icon: Clock },
  resolved: { label: "Resolved", tone: "bg-accent/10 text-accent border-accent/20", Icon: CheckCircle2 },
  closed: { label: "Closed", tone: "bg-muted text-muted-foreground border-border", Icon: XCircle },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ticketsTable = () => (supabase as any).from("support_tickets");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgsTable = () => (supabase as any).from("support_messages");

export default function SupportPage() {
  const { user, profile, isApprovedVendor } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const navItems = isApprovedVendor ? vendorNavItems : customerNavItems;

  const activeTicketId = params.get("ticket");
  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === activeTicketId) ?? null,
    [tickets, activeTicketId],
  );

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await ticketsTable()
      .select("id, subject, category, status, priority, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setTickets((data as SupportTicket[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openTicket(id: string) {
    params.set("ticket", id);
    setParams(params, { replace: true });
  }

  function clearTicket() {
    params.delete("ticket");
    setParams(params, { replace: true });
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Support" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-editorial text-2xl">Support</h1>
            <p className="text-sm text-muted-foreground">
              Tickets to the Vendora team — bugs, billing, account help
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            onClick={() => setNewOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New ticket
          </Button>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          {activeTicket ? (
            <TicketThread
              ticket={activeTicket}
              userId={user.id}
              onBack={clearTicket}
              onChange={load}
            />
          ) : loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-sm" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <LifeBuoy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-editorial text-2xl mb-2">No tickets yet</p>
              <p className="text-sm text-muted-foreground mb-6">
                When you need help, this is where you talk to us. We
                typically reply within a business day.
              </p>
              <Button
                type="button"
                onClick={() => setNewOpen(true)}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Open your first ticket
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => {
                const sm = STATUS_META[t.status];
                const Icon = sm.Icon;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openTicket(t.id)}
                      className="w-full text-left card-soft p-4 hover:border-foreground/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-display text-base leading-tight">
                            {t.subject}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 capitalize">
                            {t.category.replace("_", " ")} · updated{" "}
                            <span className="tnum">
                              {new Date(t.updated_at).toLocaleDateString()}
                            </span>
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border shrink-0 ${sm.tone}`}
                        >
                          <Icon className="w-2.5 h-2.5" />
                          {sm.label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />

      <NewTicketDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        userId={user.id}
        onCreated={(id) => {
          load();
          openTicket(id);
        }}
      />
    </div>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  onCreated: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [submitting, setSubmitting] = useState(false);

  const subjectValid = subject.trim().length > 0;
  const bodyValid = body.trim().length > 0;
  const formValid = subjectValid && bodyValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setSubmitting(true);
    const { data: ticket, error: tErr } = await ticketsTable()
      .insert({
        user_id: userId,
        subject: subject.trim(),
        category,
        priority,
      })
      .select("id")
      .single();
    if (tErr || !ticket) {
      setSubmitting(false);
      toast.error(tErr?.message ?? "Couldn't open ticket");
      return;
    }
    const { error: mErr } = await msgsTable().insert({
      ticket_id: (ticket as { id: string }).id,
      sender_id: userId,
      sender_role: "user",
      body: body.trim(),
    });
    setSubmitting(false);
    if (mErr) {
      toast.error(mErr.message);
      return;
    }
    onOpenChange(false);
    setSubject("");
    setBody("");
    setCategory("other");
    setPriority("normal");
    onCreated((ticket as { id: string }).id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">New ticket</DialogTitle>
          <DialogDescription>
            Tell us what's going on. We typically reply within a business day.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-cat">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="t-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-pri">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as typeof priority)}
              >
                <SelectTrigger id="t-pri">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-subj">Subject</Label>
            <Input
              id="t-subj"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-body">Details</Label>
            <Textarea
              id="t-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="What happened, what you tried, what you'd like."
              required
            />
          </div>
          <DialogFooter className="pt-1 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !formValid}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              Open ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketThread({
  ticket,
  userId,
  onBack,
  onChange,
}: {
  ticket: SupportTicket;
  userId: string;
  onBack: () => void;
  onChange: () => void;
}) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  async function loadMessages() {
    const { data } = await msgsTable()
      .select("id, ticket_id, sender_id, sender_role, body, created_at")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    setMessages((data as SupportMessage[]) ?? []);
  }

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  // Realtime via shared user-scoped channel.
  const realtimeConfig = useMemo(
    () => ({
      table: "support_messages",
      event: "INSERT" as const,
      filter: `ticket_id=eq.${ticket.id}`,
    }),
    [ticket.id],
  );
  useRealtime(realtimeConfig, () => loadMessages());

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    const { error } = await msgsTable().insert({
      ticket_id: ticket.id,
      sender_id: userId,
      sender_role: "user",
      body: body.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBody("");
    loadMessages();
  }

  async function closeTicket() {
    setClosing(true);
    const { error } = await ticketsTable()
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);
    setClosing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ticket closed");
    onChange();
  }

  const sm = STATUS_META[ticket.status];
  const SIcon = sm.Icon;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All tickets
      </button>
      <div className="card-soft p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-editorial text-3xl leading-tight mb-1">
              {ticket.subject}
            </h2>
            <p className="text-xs text-muted-foreground capitalize">
              {ticket.category.replace("_", " ")} · {ticket.priority} priority
              · opened{" "}
              <span className="tnum">
                {new Date(ticket.created_at).toLocaleDateString()}
              </span>
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border shrink-0 ${sm.tone}`}
          >
            <SIcon className="w-2.5 h-2.5" />
            {sm.label}
          </span>
        </div>
      </div>

      <ul className="space-y-3">
        {messages.map((m) => {
          const isAdmin = m.sender_role === "admin";
          return (
            <li
              key={m.id}
              className={`rounded-sm p-4 ${
                isAdmin
                  ? "bg-accent/10 border border-accent/20"
                  : "bg-card border border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {isAdmin ? "Vendora team" : "You"}
                </p>
                <p className="text-[10px] text-muted-foreground tnum">
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {m.body}
              </p>
            </li>
          );
        })}
      </ul>

      {ticket.status !== "closed" ? (
        <form onSubmit={send} className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Reply to the team…"
          />
          <div className="flex justify-between gap-2 flex-wrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeTicket}
              disabled={closing}
              className="rounded-full"
            >
              {closing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Close ticket
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={sending || !body.trim()}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              Send reply
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-center text-xs text-muted-foreground py-4">
          This ticket is closed. Open a new one if you have a follow-up.
        </p>
      )}
    </div>
  );
}
