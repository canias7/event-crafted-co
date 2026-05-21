// HILUX activity log — chronological feed of what HILUX has done
// across the vendor's listings. Two event types in one stream:
//   - reply: a direct_messages row where is_hilux_generated = true
//   - escalation: a notifications row where type = 'hilux_escalation'
// Both link straight to the relevant thread. Right now we only show
// activity from listings the caller owns (RLS gates both queries).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  ExternalLink,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

type ActivityEvent =
  | {
      kind: "reply";
      id: string;
      threadId: string;
      body: string;
      createdAt: string;
      businessName: string | null;
    }
  | {
      kind: "escalation";
      id: string;
      threadId: string | null;
      body: string;
      createdAt: string;
      title: string;
    };

const LIMIT = 25;

export function HiluxActivityLog() {
  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setEvents(null);

    // 1) HILUX-generated direct messages for this user's listings.
    //    The select goes through direct_threads → vendor_profiles to
    //    let us label each row with the business name. RLS already
    //    restricts to threads where the caller is a vendor team
    //    member, so we don't need a separate ownership filter.
    const repliesPromise = supabase
      .from("direct_messages")
      .select(
        "id, thread_id, body, created_at, direct_threads!inner(id, vendor_id, vendor_profiles!inner(business_name, user_id))",
      )
      .eq("is_hilux_generated", true)
      .eq("direct_threads.vendor_profiles.user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    // 2) Escalation notifications fired for this user. RLS already
    //    restricts notifications to the caller.
    const escalationsPromise = supabase
      .from("notifications")
      .select("id, title, body, link, created_at")
      .eq("user_id", user.id)
      .eq("type", "hilux_escalation")
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    const [{ data: replies }, { data: escalations }] = await Promise.all([
      repliesPromise,
      escalationsPromise,
    ]);

    const replyEvents: ActivityEvent[] = (
      (replies ?? []) as Array<{
        id: string;
        thread_id: string;
        body: string;
        created_at: string;
        direct_threads: {
          vendor_profiles: { business_name: string | null };
        };
      }>
    ).map((r) => ({
      kind: "reply" as const,
      id: r.id,
      threadId: r.thread_id,
      body: r.body,
      createdAt: r.created_at,
      businessName: r.direct_threads?.vendor_profiles?.business_name ?? null,
    }));

    const escalationEvents: ActivityEvent[] = (
      (escalations ?? []) as Array<{
        id: string;
        title: string;
        body: string;
        link: string | null;
        created_at: string;
      }>
    ).map((e) => {
      const match = e.link?.match(/thread=([^&]+)/);
      return {
        kind: "escalation" as const,
        id: e.id,
        threadId: match ? match[1] : null,
        body: e.body,
        createdAt: e.created_at,
        title: e.title,
      };
    });

    const merged = [...replyEvents, ...escalationEvents].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    setEvents(merged.slice(0, LIMIT));
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <div className="relative z-10 px-6 md:px-10 mt-4">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255, 138, 76, 0.15)" }}
          >
            <MessageSquare className="w-5 h-5" style={{ color: "#ff8a4c" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] uppercase tracking-[0.2em] mb-1"
              style={{ color: "rgba(255, 138, 76, 0.85)" }}
            >
              Activity · Last 25 events
            </p>
            <h3 className="font-editorial text-2xl text-black leading-tight">
              What HILUX has been doing.
            </h3>
            <p className="text-sm text-black/60 mt-1">
              Every reply HILUX sends and every conversation it escalates to
              you, newest first. Click any row to jump to the thread.
            </p>
          </div>
        </div>

        {events === null ? (
          <div className="flex items-center gap-2 text-sm text-black/50 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-black/55 py-6">
            Nothing yet. Once HILUX is enabled and a host sends a message,
            its replies will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-black/10">
            {events.map((event) => {
              const href =
                event.threadId != null
                  ? `/vendor/inbox?thread=${event.threadId}`
                  : "/vendor/inbox";
              const when = formatDistanceToNow(new Date(event.createdAt), {
                addSuffix: true,
              });
              if (event.kind === "reply") {
                return (
                  <li key={event.id} className="py-3">
                    <Link
                      to={href}
                      className="flex items-start gap-3 group hover:opacity-90 transition-opacity"
                    >
                      <Bot
                        className="w-4 h-4 mt-0.5 shrink-0"
                        style={{ color: "#ff8a4c" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] text-black/55">
                          <span className="uppercase tracking-wider font-medium">
                            Replied
                          </span>
                          {event.businessName ? (
                            <>
                              <span>·</span>
                              <span className="truncate">
                                {event.businessName}
                              </span>
                            </>
                          ) : null}
                          <span>·</span>
                          <span>{when}</span>
                        </div>
                        <p className="text-sm text-black/85 mt-0.5 line-clamp-2">
                          {event.body}
                        </p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 mt-1 text-black/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  </li>
                );
              }
              return (
                <li key={event.id} className="py-3">
                  <Link
                    to={href}
                    className="flex items-start gap-3 group hover:opacity-90 transition-opacity"
                  >
                    <AlertTriangle
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "#d97706" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-black/55">
                        <span className="uppercase tracking-wider font-medium text-amber-700">
                          Escalated to you
                        </span>
                        <span>·</span>
                        <span>{when}</span>
                      </div>
                      <p className="text-sm text-black/85 mt-0.5 line-clamp-2">
                        {event.body}
                      </p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 mt-1 text-black/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
