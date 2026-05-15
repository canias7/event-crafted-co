import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/format";

// Group planning channel — Slack-for-your-event. One channel per
// host (auto-created on first message). Members are the host + any
// planning_collaborators. Realtime via the shared user-scoped
// channel from RealtimeProvider.

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string | null;
}

export function PlanningChannelCard({ hostId }: { hostId: string }) {
  const { user } = useAuth();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Find or create the channel for this host.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from("event_channels")
        .select("id")
        .eq("host_id", hostId)
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (existing) {
        setChannelId((existing as { id: string }).id);
      } else if (user?.id === hostId) {
        // Lazy-create only when the host visits — collaborators don't
        // create channels.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created } = await (supabase as any)
          .from("event_channels")
          .insert({ host_id: hostId })
          .select("id")
          .single();
        if (cancelled) return;
        if (created) setChannelId((created as { id: string }).id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hostId, user?.id]);

  async function loadMessages() {
    if (!channelId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("event_channel_messages")
      .select(
        "id, sender_id, body, created_at, sender:profiles!event_channel_messages_sender_id_fkey(display_name)",
      )
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);
    type Row = Message & { sender: { display_name: string | null } | null };
    const rows = (data as Row[] | null) ?? [];
    setMessages(
      rows.map((r) => ({
        id: r.id,
        sender_id: r.sender_id,
        body: r.body,
        created_at: r.created_at,
        sender_name: r.sender?.display_name ?? null,
      })),
    );
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  useEffect(() => {
    if (channelId) loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Realtime via the shared user-scoped channel.
  const realtimeConfig = useMemo(
    () =>
      channelId
        ? {
            table: "event_channel_messages",
            event: "INSERT" as const,
            filter: `channel_id=eq.${channelId}`,
          }
        : null,
    [channelId],
  );
  useRealtime(realtimeConfig, () => loadMessages());

  async function send() {
    if (!user || !channelId || !body.trim()) return;
    setSending(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("event_channel_messages")
      .insert({
        channel_id: channelId,
        sender_id: user.id,
        body: body.trim(),
      });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBody("");
  }

  if (loading) return null;

  if (!channelId) {
    return (
      <div className="card-soft p-5 text-sm text-muted-foreground text-center">
        <MessageSquare className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
        Group channel will appear here when the host opens it.
      </div>
    );
  }

  return (
    <div className="card-soft flex flex-col h-[500px]">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-accent" />
        <p className="font-display text-base">Planning channel</p>
        <span className="ml-auto text-xs text-muted-foreground">
          {messages.length} messages
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-12">
            Start the conversation. Everyone on the planning team can see this.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-sm px-3 py-2 text-sm ${
                    mine
                      ? "bg-foreground text-background"
                      : "bg-secondary/60"
                  }`}
                >
                  {!mine && (
                    <p className="text-[10px] text-muted-foreground mb-0.5">
                      {m.sender_name ?? "Someone"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      mine ? "text-background/60" : "text-muted-foreground"
                    }`}
                  >
                    {formatRelative(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-3 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={1}
          placeholder="Write to the planning team…"
          className="flex-1 min-h-9 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          type="button"
          onClick={send}
          disabled={sending || !body.trim()}
          size="icon"
          className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-9 w-9 flex-shrink-0"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
