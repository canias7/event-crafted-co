import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Users,
  ListChecks,
  Inbox,
  ArrowRight,
  Loader2,
  MapPin,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { PLANNING_HUB_TABS } from "@/data/hubTabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { customerNavItems as navItems } from "@/data/navItems";

interface PlannerEvent {
  event_id: string;
  name: string | null;
  event_type: string;
  event_date: string | null;
  event_location: string | null;
  archived_at: string | null;
  guest_count: number;
  tasks_total: number;
  tasks_done: number;
  inquiries_active: number;
  days_until: number | null;
}

interface HostBlock {
  host_id: string;
  host_name: string;
  role: "owner" | "editor" | "viewer";
  collaborator_since: string;
  events: PlannerEvent[];
}

interface Workspace {
  hosts: HostBlock[];
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  holiday_dinner: "Holiday dinner",
  other: "Event",
};

export default function PlannerWorkspacePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingEventId, setSwitchingEventId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (supabase as any).rpc(
      "get_planner_workspace",
    );
    setLoading(false);
    if (error) {
      toast.error(error.message);
      setData({ hosts: [] });
      return;
    }
    setData(result as Workspace);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function switchTo(event: PlannerEvent) {
    setSwitchingEventId(event.event_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("set_active_event", {
      p_event_id: event.event_id,
    });
    setSwitchingEventId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Now planning: ${event.name ?? EVENT_TYPE_LABEL[event.event_type]}`);
    navigate("/customer/dashboard");
  }

  const totalEvents =
    data?.hosts.reduce((acc, h) => acc + h.events.length, 0) ?? 0;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-editorial text-3xl">Planner workspace</h1>
            <p className="text-sm text-muted-foreground">
              All client events you're collaborating on, in one place
            </p>
          </div>
          <SubNavTabs tabs={PLANNING_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-48 rounded-sm" />
              ))}
            </div>
          ) : !data || data.hosts.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <Briefcase className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-editorial text-3xl mb-2">No client events yet</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You'll see this view once a host invites you as a planning
                collaborator. Hosts add you from their{" "}
                <Link to="/customer/planning-team" className="text-accent hover:underline">
                  Planning Team
                </Link>{" "}
                page; you can also invite yourself if you set up a host
                account for a client.
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground tnum">
                {data.hosts.length}{" "}
                {data.hosts.length === 1 ? "client" : "clients"} ·{" "}
                {totalEvents} {totalEvents === 1 ? "event" : "events"}
              </div>
              {data.hosts.map((h) => (
                <section key={h.host_id} className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h2 className="font-display text-2xl">{h.host_name}</h2>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {h.role}
                    </span>
                  </div>
                  {h.events.length === 0 ? (
                    <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
                      No events for this client yet.
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {h.events.map((e) => {
                        const isPast =
                          e.days_until !== null && e.days_until < 0;
                        const isArchived = Boolean(e.archived_at);
                        const taskPct =
                          e.tasks_total > 0
                            ? Math.round((e.tasks_done / e.tasks_total) * 100)
                            : 0;
                        return (
                          <div
                            key={e.event_id}
                            className={`rounded-sm border bg-card p-4 ${
                              isArchived
                                ? "border-border/50 opacity-60"
                                : "border-border"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0">
                                <p className="font-display text-base leading-tight line-clamp-1">
                                  {e.name ??
                                    `${EVENT_TYPE_LABEL[e.event_type] ?? "Event"} for ${h.host_name}`}
                                </p>
                                <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                                  {EVENT_TYPE_LABEL[e.event_type] ?? "Event"}
                                  {isArchived && " · archived"}
                                </p>
                              </div>
                              {e.days_until !== null && !isArchived && (
                                <span
                                  className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 tnum ${
                                    isPast
                                      ? "bg-muted text-muted-foreground"
                                      : e.days_until <= 30
                                        ? "bg-accent text-accent-foreground"
                                        : "bg-secondary text-foreground"
                                  }`}
                                >
                                  {isPast
                                    ? `${Math.abs(e.days_until)}d ago`
                                    : `${e.days_until}d to go`}
                                </span>
                              )}
                            </div>

                            <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                              {e.event_date && (
                                <p className="flex items-center gap-1.5">
                                  <CalendarDays className="w-3 h-3" />
                                  <span className="tnum">
                                    {new Date(`${e.event_date}T00:00:00`).toLocaleDateString(undefined, {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </span>
                                </p>
                              )}
                              {e.event_location && (
                                <p className="flex items-center gap-1.5">
                                  <MapPin className="w-3 h-3" />
                                  <span className="truncate">{e.event_location}</span>
                                </p>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-border mb-3">
                              <Stat icon={Users} label="Guests" value={e.guest_count} />
                              <Stat
                                icon={ListChecks}
                                label="Tasks"
                                value={e.tasks_total > 0 ? `${taskPct}%` : "—"}
                              />
                              <Stat
                                icon={Inbox}
                                label="Open inq."
                                value={e.inquiries_active}
                              />
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => switchTo(e)}
                              disabled={
                                isArchived ||
                                switchingEventId === e.event_id
                              }
                              className="rounded-full w-full"
                            >
                              {switchingEventId === e.event_id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                  Switching…
                                </>
                              ) : (
                                <>
                                  Plan this event
                                  <ArrowRight className="w-3 h-3 ml-1.5" />
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <Icon className="w-3 h-3 text-muted-foreground mx-auto" />
      <p className="font-display text-base tnum mt-1">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
