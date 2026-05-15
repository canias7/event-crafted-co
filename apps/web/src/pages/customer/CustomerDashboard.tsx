import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Store, MessageSquare, ListTodo, CreditCard, Clock, ArrowRight, Plus,
  Calendar, CalendarDays, Mail, CheckSquare, Sparkles, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StatCard } from "@/components/shared/StatCard";
import { customerNavItems as navItems } from "@/data/navItems";
import { formatDate, formatCents } from "@/lib/format";
import { checklistItems, customerTasks } from "@/data/sampleData";
import { useAuth } from "@/hooks/useAuth";
import { CoBookedRail } from "@/components/vendor/CoBookedRail";
import { supabase } from "@/integrations/supabase/client";

const completedCount = checklistItems.filter((c) => c.completed).length;
const progressPct = Math.round((completedCount / checklistItems.length) * 100);

const eventTypeLabel: Record<string, string> = {
  wedding: "wedding",
  birthday: "birthday",
  holiday_dinner: "holiday dinner",
  other: "event",
};

interface InquiryStats {
  total: number;
  awaiting: number;
  replied: number;
  booked: number;
}

interface DashboardWidgets {
  guestsTotal: number;
  guestsAttending: number;
  guestsResponded: number;
  budgetSpent: number;
  budgetTotal: number;
  checklistDone: number;
  checklistTotal: number;
  tasksOpen: number;
  tasksOverdue: number;
}

function fmtMoney(c: number | null) {
  return formatCents(c);
}

export default function CustomerDashboard() {
  const { t } = useTranslation();
  const { profile, activeEvent, user } = useAuth();
  const [stats, setStats] = useState<InquiryStats>({
    total: 0,
    awaiting: 0,
    replied: 0,
    booked: 0,
  });
  const [widgets, setWidgets] = useState<DashboardWidgets>({
    guestsTotal: 0,
    guestsAttending: 0,
    guestsResponded: 0,
    budgetSpent: 0,
    budgetTotal: 0,
    checklistDone: 0,
    checklistTotal: 0,
    tasksOpen: 0,
    tasksOverdue: 0,
  });

  // Multi-role: anyone non-admin can host events; show the onboarding
  // banner until they've completed it once.
  const showOnboardingBanner =
    !!profile && profile.role !== "admin" && !profile.onboarded_at;
  // Prefer the active host_events row; fall back to legacy profile event_*
  // for hosts whose data hasn't been migrated yet.
  const eventType = activeEvent?.event_type ?? profile?.event_type ?? null;
  const eventDateStr = activeEvent?.event_date ?? profile?.event_date ?? null;
  const eventLabel = eventType ? eventTypeLabel[eventType] : "event";

  const eventDate = eventDateStr ? new Date(eventDateStr) : null;
  const daysUntil = eventDate
    ? Math.ceil(
        (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
    : null;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // Inquiries
      const { data: inqData } = await supabase
        .from("inquiries")
        .select("status")
        .eq("host_id", user.id);
      if (cancelled) return;
      const rows = inqData ?? [];
      setStats({
        total: rows.length,
        awaiting: rows.filter(
          (r) => r.status === "new" || r.status === "drafted",
        ).length,
        replied: rows.filter((r) => r.status === "replied").length,
        booked: rows.filter((r) => r.status === "won").length,
      });

      // Widgets — single batch of host-scoped queries.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const today = new Date().toISOString().slice(0, 10);
      const [guests, budget, checklist, tasks] = await Promise.all([
        sb
          .from("event_guests")
          .select("rsvp_status")
          .eq("host_id", user.id),
        sb
          .from("budget_items")
          .select("amount_cents, paid_cents")
          .eq("host_id", user.id),
        sb
          .from("checklist_items")
          .select("completed")
          .eq("host_id", user.id),
        sb
          .from("event_tasks")
          .select("status, due_date")
          .eq("host_id", user.id),
      ]);
      if (cancelled) return;

      const guestRows = (guests.data ?? []) as Array<{
        rsvp_status: string | null;
      }>;
      const budgetRows = (budget.data ?? []) as Array<{
        amount_cents: number | null;
        paid_cents: number | null;
      }>;
      const checklistRows = (checklist.data ?? []) as Array<{
        completed: boolean;
      }>;
      const taskRows = (tasks.data ?? []) as Array<{
        status: string | null;
        due_date: string | null;
      }>;

      setWidgets({
        guestsTotal: guestRows.length,
        guestsAttending: guestRows.filter((g) => g.rsvp_status === "attending")
          .length,
        guestsResponded: guestRows.filter((g) => g.rsvp_status != null).length,
        budgetSpent: budgetRows.reduce(
          (s, r) => s + (r.paid_cents ?? 0),
          0,
        ),
        budgetTotal: budgetRows.reduce(
          (s, r) => s + (r.amount_cents ?? 0),
          0,
        ),
        checklistDone: checklistRows.filter((c) => c.completed).length,
        checklistTotal: checklistRows.length,
        tasksOpen: taskRows.filter((t) => t.status !== "completed").length,
        tasksOverdue: taskRows.filter(
          (t) =>
            t.status !== "completed" &&
            t.due_date != null &&
            t.due_date < today,
        ).length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const greeting = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={t("dashboard.customer.title")} backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        {/* Header */}
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            <h1 className="font-editorial text-3xl">
              {t("dashboard.common.welcome_back")}, {greeting}
            </h1>
            <p className="text-sm text-muted-foreground">
              {daysUntil != null && daysUntil >= 0 ? (
                <>
                  {t("dashboard.customer.event_in_days", {
                    event: eventLabel,
                    count: daysUntil,
                  })}
                </>
              ) : eventType ? (
                t("dashboard.customer.event_planning", { event: eventLabel })
              ) : (
                t("dashboard.common.let_us_plan")
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {eventDateStr && (
              <Badge
                variant="outline"
                className="hidden sm:flex items-center gap-1.5 py-1.5 px-3"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="tnum">
                  {formatDate(eventDateStr, "short")}
                </span>
              </Badge>
            )}
            <NotificationBell variant="light" />
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-8">
          {showOnboardingBanner && (
            <div className="rounded-sm border border-accent/30 bg-accent/5 p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base mb-1">
                  {t("dashboard.customer.tell_us_about_event")}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("dashboard.customer.tell_us_setup_desc")}
                </p>
              </div>
              <Link to="/customer/onboarding">
                <Button size="sm" className="rounded-full whitespace-nowrap">
                  {t("dashboard.customer.complete_setup")}
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* Stats — top row tracks the planning at-a-glance */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t("dashboard.customer.stat_days_until")}
              value={daysUntil != null && daysUntil >= 0 ? daysUntil : "—"}
              icon={Clock}
              accent
            />
            <StatCard
              label={t("dashboard.customer.stat_inquiries")}
              value={stats.total}
              icon={MessageSquare}
            />
            <StatCard
              label={t("dashboard.customer.stat_awaiting")}
              value={stats.awaiting}
              icon={Clock}
            />
            <StatCard
              label={t("dashboard.customer.stat_booked")}
              value={stats.booked}
              icon={Store}
            />
          </div>

          {/* Live planning widgets — guest RSVP, budget, checklist, tasks */}
          {(widgets.guestsTotal > 0 ||
            widgets.checklistTotal > 0 ||
            widgets.budgetTotal > 0 ||
            widgets.tasksOpen > 0) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {widgets.guestsTotal > 0 && (
                <Link
                  to="/customer/guests"
                  className="block bg-card rounded-2xl p-5 card-shadow hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <Mail className="w-3.5 h-3.5" />
                    <p className="font-label text-xs">
                      {t("dashboard.customer.widget_guests")}
                    </p>
                  </div>
                  <p className="font-display text-2xl tnum mb-1">
                    {widgets.guestsResponded}
                    <span className="text-base text-muted-foreground font-light">
                      {" "}
                      / {widgets.guestsTotal}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.customer.widget_attending", {
                      count: widgets.guestsAttending,
                    })}
                  </p>
                </Link>
              )}
              {widgets.budgetTotal > 0 && (
                <Link
                  to="/customer/payments"
                  className="block bg-card rounded-2xl p-5 card-shadow hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <CreditCard className="w-3.5 h-3.5" />
                    <p className="font-label text-xs">
                      {t("dashboard.customer.widget_spent")}
                    </p>
                  </div>
                  <p className="font-display text-2xl tnum mb-1">
                    {formatCents(widgets.budgetSpent)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.customer.widget_planned", {
                      amount: formatCents(widgets.budgetTotal),
                    })}
                  </p>
                </Link>
              )}
              {widgets.checklistTotal > 0 && (
                <Link
                  to="/customer/checklist"
                  className="block bg-card rounded-2xl p-5 card-shadow hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <CheckSquare className="w-3.5 h-3.5" />
                    <p className="font-label text-xs">
                      {t("dashboard.customer.widget_checklist")}
                    </p>
                  </div>
                  <p className="font-display text-2xl tnum mb-1">
                    {Math.round(
                      (widgets.checklistDone / widgets.checklistTotal) * 100,
                    )}
                    %
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.customer.widget_done_ratio", {
                      done: widgets.checklistDone,
                      total: widgets.checklistTotal,
                    })}
                  </p>
                </Link>
              )}
              {widgets.tasksOpen > 0 && (
                <Link
                  to="/customer/tasks"
                  className="block bg-card rounded-2xl p-5 card-shadow hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <ListTodo className="w-3.5 h-3.5" />
                    <p className="font-label text-xs">
                      {t("dashboard.customer.widget_open_tasks")}
                    </p>
                  </div>
                  <p className="font-display text-2xl tnum mb-1">
                    {widgets.tasksOpen}
                  </p>
                  <p
                    className={`text-xs ${
                      widgets.tasksOverdue > 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {widgets.tasksOverdue > 0
                      ? t("dashboard.common.overdue", {
                          count: widgets.tasksOverdue,
                        })
                      : t("dashboard.common.on_track")}
                  </p>
                </Link>
              )}
            </div>
          )}

          {/* Recommended for you (collaborative-filtering signal) */}
          {user && (
            <div className="bg-card rounded-2xl p-5 card-shadow">
              <CoBookedRail
                recommendedFor={user.id}
                eyebrow="Vendora suggests"
                title="You might also love"
                limit={6}
              />
            </div>
          )}

          {/* Quick actions */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <p className="font-label text-muted-foreground mb-3">
              {t("dashboard.common.quick_actions")}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: t("dashboard.customer.qa_browse_vendors"), path: "/vendors", icon: Store },
                { label: t("dashboard.customer.qa_microsite"), path: "/customer/microsite", icon: Globe },
                { label: t("dashboard.customer.qa_book_appt"), path: "/customer/appointments", icon: CalendarDays },
                { label: t("dashboard.customer.qa_invite"), path: "/customer/invitations", icon: Mail },
                { label: t("dashboard.customer.qa_add_task"), path: "/customer/tasks", icon: Plus },
                { label: t("dashboard.customer.qa_add_check"), path: "/customer/checklist", icon: CheckSquare },
              ].map((action) => (
                <Link key={action.path + action.label} to={action.path}>
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                    <Button variant="outline" size="sm" className="h-9 rounded-lg">
                      <action.icon className="w-3.5 h-3.5 mr-1.5" />
                      {action.label}
                    </Button>
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Checklist progress */}
            <div className="bg-card rounded-2xl p-5 card-shadow">
              <div className="flex items-center justify-between mb-4">
                <p className="font-label text-muted-foreground">
                  {t("dashboard.customer.section_checklist")}
                </p>
                <Link to="/customer/checklist" className="text-xs text-accent font-medium">
                  {t("dashboard.common.view_all")}
                </Link>
              </div>
              <div className="mb-3">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-display tnum">{completedCount}</span>
                  <span className="text-sm text-muted-foreground">of {checklistItems.length} completed</span>
                </div>
                <Progress value={progressPct} className="h-2" />
              </div>
              <div className="space-y-2 mt-4">
                {checklistItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 text-sm">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      item.completed ? "border-accent bg-accent" : "border-muted"
                    }`}>
                      {item.completed && <span className="text-accent-foreground text-[10px]">✓</span>}
                    </div>
                    <span className={item.completed ? "text-muted-foreground line-through" : ""}>{item.name}</span>
                    <span className="ml-auto font-label text-muted-foreground">{item.category}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks due soon */}
            <div className="bg-card rounded-2xl p-5 card-shadow">
              <div className="flex items-center justify-between mb-4">
                <p className="font-label text-muted-foreground">
                  {t("dashboard.customer.section_tasks")}
                </p>
                <Link to="/customer/tasks" className="text-xs text-accent font-medium">
                  {t("dashboard.common.view_all")}
                </Link>
              </div>
              <div className="space-y-3">
                {customerTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.status === "overdue" ? "bg-destructive" :
                      task.status === "completed" ? "bg-accent" :
                      task.status === "in-progress" ? "bg-accent/60" : "bg-muted-foreground/30"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{task.category}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs tnum font-medium ${task.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>
                        {task.dueDate}
                      </p>
                      <Badge variant={
                        task.priority === "high" ? "destructive" : "secondary"
                      } className="text-[10px] mt-1">
                        {task.priority}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Payment summary */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <div className="flex items-center justify-between mb-4">
              <p className="font-label text-muted-foreground">Recent Payments</p>
              <Link to="/customer/payments" className="text-xs text-accent font-medium">View all</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-label text-muted-foreground">Vendor</th>
                    <th className="text-left py-2 font-label text-muted-foreground">Service</th>
                    <th className="text-left py-2 font-label text-muted-foreground">Amount</th>
                    <th className="text-left py-2 font-label text-muted-foreground">Status</th>
                    <th className="text-right py-2 font-label text-muted-foreground">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { vendor: "Luminara Photography", service: "Wedding Package", amount: "$3,250", status: "paid", due: "Jun 1" },
                    { vendor: "The Grand Atelier", service: "Venue Deposit", amount: "$4,500", status: "paid", due: "May 15" },
                    { vendor: "Bloom & Petal", service: "Floral Arrangement", amount: "$1,800", status: "pending", due: "Jul 10" },
                    { vendor: "Savor & Co.", service: "Catering Deposit", amount: "$2,900", status: "overdue", due: "Jun 22" },
                  ].map((p, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 font-medium">{p.vendor}</td>
                      <td className="py-3 text-muted-foreground">{p.service}</td>
                      <td className="py-3 tnum font-medium">{p.amount}</td>
                      <td className="py-3">
                        <Badge variant={p.status === "paid" ? "secondary" : p.status === "overdue" ? "destructive" : "outline"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right tnum text-muted-foreground">{p.due}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
