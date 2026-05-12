import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Inbox, Sparkles, MessageCircle, Star, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/lib/realtime";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const notifTable = () => supabase.from("notifications");

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const typeIcons: Record<string, typeof Inbox> = {
  inquiry_created: Inbox,
  inquiry_status: Sparkles,
  message_received: MessageCircle,
  review_posted: Star,
  review_response: MessageCircle,
};

interface Props {
  /** Tailwind color classes for the trigger when on dark backgrounds. */
  variant?: "light" | "dark";
}

export function NotificationBell({ variant = "dark" }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  // Versioned cancel guard so a rapid realtime burst (or unmount mid-
  // fetch) can't setState on the wrong result.
  const loadVersion = useRef(0);

  async function load() {
    if (!user) return;
    const myVersion = ++loadVersion.current;
    setLoading(true);
    const { data, error } = await notifTable()
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (myVersion !== loadVersion.current) return;
    if (error) {
      // Don't toast — the bell is ambient UI, no need to bother the
      // user. Log so we'd notice if the inbox stops loading at scale.
      console.error("[NotificationBell] load failed", error.message);
      setLoading(false);
      return;
    }
    setItems((data as Notification[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    load();
    return () => {
      loadVersion.current = -1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime: refresh when a new notification lands or marks change.
  // Routes through the shared user-scoped channel from RealtimeProvider
  // so this doesn't open its own websocket-channel slot.
  const realtimeConfig = useMemo(
    () =>
      user
        ? { table: "notifications", filter: `user_id=eq.${user.id}` as const }
        : null,
    [user?.id],
  );
  useRealtime(realtimeConfig, () => load());

  if (!user) return null;

  const unreadCount = items.filter((i) => !i.read_at).length;

  async function markAllRead() {
    if (!user || unreadCount === 0) return;
    const ids = items.filter((i) => !i.read_at).map((i) => i.id);
    setItems((prev) =>
      prev.map((i) =>
        ids.includes(i.id) ? { ...i, read_at: new Date().toISOString() } : i,
      ),
    );
    await notifTable()
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
  }

  async function markRead(id: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, read_at: new Date().toISOString() } : i,
      ),
    );
    await notifTable()
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
  }

  const triggerColor =
    variant === "light"
      ? "text-muted-foreground hover:text-foreground"
      : "text-background/85 hover:text-background";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${triggerColor}`}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-medium flex items-center justify-center tnum">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 rounded-sm overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-display text-sm">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs rounded-full"
              onClick={markAllRead}
            >
              <Check className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground mt-1">
                We'll let you know when something happens.
              </p>
            </div>
          ) : (
            items.map((n) => {
              const Icon = typeIcons[n.type] ?? Bell;
              const isUnread = !n.read_at;
              const inner = (
                <div
                  className={`flex gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors ${
                    isUnread ? "bg-accent/5" : ""
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isUnread
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${
                        isUnread ? "font-medium" : ""
                      }`}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1 tnum">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  {isUnread && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 mt-2" />
                  )}
                </div>
              );
              return n.link ? (
                <Link
                  key={n.id}
                  to={n.link}
                  onClick={() => {
                    if (isUnread) markRead(n.id);
                    setOpen(false);
                  }}
                  className="block"
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={n.id}
                  onClick={() => {
                    if (isUnread) markRead(n.id);
                  }}
                  className="block w-full text-left"
                >
                  {inner}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
