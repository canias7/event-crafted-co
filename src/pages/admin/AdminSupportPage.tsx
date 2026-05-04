import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  Send,
  ArrowLeft,
  CheckCircle2,
  LifeBuoy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/lib/realtime";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { adminNavItems as navItems } from "@/data/navItems";
import {
  STATUS_META,
  type SupportTicket,
  type SupportMessage,
} from "@/pages/SupportPage";

interface AdminTicket extends SupportTicket {
  user: { display_name: string | null; role: string | null } | null;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ticketsTable = () => (supabase as any).from("support_tickets");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgsTable = () => (supabase as any).from("support_messages");

export default function AdminSupportPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("open");

  const activeTicketId = params.get("ticket");
  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === activeTicketId) ?? null,
    [tickets, activeTicketId],
  );

  async function load() {
    setLoading(true);
    let q = ticketsTable()
      .select(
        "id, subject, category, status, priority, created_at, updated_at, user_id, user:profiles!support_tickets_user_id_fkey(display_name, role)",
      )
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setTickets((data as AdminTicket[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-xl">Support</h1>
            <p className="text-sm text-muted-foreground">
              Tickets from hosts + vendors
            </p>
          </div>
          <div className="inline-flex rounded-full border border-border bg-background overflow-hidden text-xs">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 transition-colors ${
                  filter === f.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-4xl">
          {activeTicket ? (
            <AdminTicketThread
              ticket={activeTicket}
              userId={user.id}
              onBack={clearTicket}
              onChange={load}
            />
          ) : loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-sm" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <LifeBuoy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-display text-xl mb-2">Inbox zero</p>
              <p className="text-sm text-muted-foreground">
                No {filter === "all" ? "" : filter.replace("_", " ") + " "}tickets right now.
              </p>
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
                      className="w-full text-left rounded-sm border border-border bg-card p-4 hover:border-foreground/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-display text-base leading-tight">
                            {t.subject}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 capitalize">
                            {t.user?.display_name ?? "Unknown"} ({t.user?.role ?? "user"})
                            {" · "}
                            {t.category.replace("_", " ")}
                            {" · "}
                            <span
                              className={
                                t.priority === "urgent"
                                  ? "text-destructive uppercase tracking-wide"
                                  : t.priority === "high"
                                    ? "text-accent uppercase tracking-wide"
                                    : ""
                              }
                            >
                              {t.priority}
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
    </div>
  );
}

function AdminTicketThread({
  ticket,
  userId,
  onBack,
  onChange,
}: {
  ticket: AdminTicket;
  userId: string;
  onBack: () => void;
  onChange: () => void;
}) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

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
      sender_role: "admin",
      body: body.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBody("");
    // Auto-bump status to in_progress when admin first replies.
    if (ticket.status === "open") {
      await ticketsTable()
        .update({ status: "in_progress" })
        .eq("id", ticket.id);
      onChange();
    }
    loadMessages();
  }

  async function setStatus(next: SupportTicket["status"]) {
    setStatusUpdating(true);
    const update: Record<string, unknown> = { status: next };
    if (next === "resolved" || next === "closed") {
      update.closed_at = new Date().toISOString();
    } else {
      update.closed_at = null;
    }
    const { error } = await ticketsTable()
      .update(update)
      .eq("id", ticket.id);
    setStatusUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${next.replace("_", " ")}`);
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
      <div className="rounded-sm border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="font-display text-2xl leading-tight mb-1">
              {ticket.subject}
            </h2>
            <p className="text-xs text-muted-foreground capitalize">
              {ticket.user?.display_name ?? "Unknown"} ({ticket.user?.role ?? "user"})
              · {ticket.category.replace("_", " ")} · {ticket.priority}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${sm.tone}`}
          >
            <SIcon className="w-2.5 h-2.5" />
            {sm.label}
          </span>
        </div>
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">Set status:</span>
          <Select
            value={ticket.status}
            onValueChange={(v) => setStatus(v as SupportTicket["status"])}
            disabled={statusUpdating}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
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
                  {isAdmin ? "Vendora team" : "User"}
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
            placeholder="Reply to the user…"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStatus("resolved")}
              disabled={statusUpdating}
              className="rounded-full"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Mark resolved
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
          Closed ticket. Reopen by setting status above.
        </p>
      )}
    </div>
  );
}
