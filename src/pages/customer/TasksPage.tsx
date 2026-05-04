import { useEffect, useState } from "react";
import {
  Plus,
  Check,
  Trash2,
  Loader2,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { PLANNING_HUB_TABS } from "@/data/hubTabs";
import { customerNavItems as navItems } from "@/data/navItems";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tasksTable = () => (supabase as any).from("event_tasks");

// Per-event-type task starter packs. Mirrors the per-category checklist
// templates already shipped on /customer/checklist. Each task has a
// rough due-date offset (in days before the event) that we apply when
// the host has an event_date set; otherwise the date is left null and
// they pick later.
interface TaskTemplate {
  title: string;
  category: string;
  priority: "low" | "medium" | "high";
  daysBeforeEvent: number;
}

const taskTemplates: Record<string, TaskTemplate[]> = {
  wedding: [
    { title: "Book ceremony venue", category: "Venue", priority: "high", daysBeforeEvent: 365 },
    { title: "Hire photographer", category: "Photography", priority: "high", daysBeforeEvent: 300 },
    { title: "Send save-the-dates", category: "Invitations", priority: "high", daysBeforeEvent: 240 },
    { title: "Book catering", category: "Catering", priority: "high", daysBeforeEvent: 180 },
    { title: "Book florist", category: "Florals", priority: "medium", daysBeforeEvent: 150 },
    { title: "Order wedding attire", category: "Attire", priority: "high", daysBeforeEvent: 150 },
    { title: "Send formal invitations", category: "Invitations", priority: "high", daysBeforeEvent: 90 },
    { title: "Confirm vendor timelines", category: "Coordination", priority: "high", daysBeforeEvent: 30 },
    { title: "Final dress / suit fitting", category: "Attire", priority: "high", daysBeforeEvent: 14 },
    { title: "Confirm final headcount with caterer", category: "Catering", priority: "high", daysBeforeEvent: 7 },
  ],
  birthday: [
    { title: "Pick a date and venue", category: "Venue", priority: "high", daysBeforeEvent: 60 },
    { title: "Send invitations", category: "Invitations", priority: "high", daysBeforeEvent: 30 },
    { title: "Order cake", category: "Food", priority: "high", daysBeforeEvent: 21 },
    { title: "Confirm catering / menu", category: "Catering", priority: "high", daysBeforeEvent: 14 },
    { title: "Book entertainment / DJ", category: "Entertainment", priority: "medium", daysBeforeEvent: 30 },
    { title: "Buy decorations", category: "Decor", priority: "low", daysBeforeEvent: 14 },
    { title: "Final RSVP follow-ups", category: "Coordination", priority: "medium", daysBeforeEvent: 5 },
  ],
  holiday_dinner: [
    { title: "Plan the menu", category: "Menu", priority: "high", daysBeforeEvent: 21 },
    { title: "Order ingredients / catering", category: "Catering", priority: "high", daysBeforeEvent: 14 },
    { title: "Send invitations", category: "Invitations", priority: "medium", daysBeforeEvent: 21 },
    { title: "Order florals / centerpieces", category: "Florals", priority: "low", daysBeforeEvent: 7 },
    { title: "Set the table / linens", category: "Decor", priority: "low", daysBeforeEvent: 1 },
    { title: "Music / playlist", category: "Atmosphere", priority: "low", daysBeforeEvent: 3 },
  ],
  baby_shower: [
    { title: "Pick venue / host", category: "Venue", priority: "high", daysBeforeEvent: 60 },
    { title: "Send invitations", category: "Invitations", priority: "high", daysBeforeEvent: 30 },
    { title: "Plan menu / catering", category: "Catering", priority: "high", daysBeforeEvent: 21 },
    { title: "Order cake / desserts", category: "Food", priority: "medium", daysBeforeEvent: 14 },
    { title: "Plan games / activities", category: "Activities", priority: "low", daysBeforeEvent: 14 },
    { title: "Order decorations", category: "Decor", priority: "low", daysBeforeEvent: 7 },
    { title: "Finalize favors", category: "Favors", priority: "low", daysBeforeEvent: 7 },
  ],
  engagement: [
    { title: "Pick venue + date", category: "Venue", priority: "high", daysBeforeEvent: 45 },
    { title: "Hire photographer", category: "Photography", priority: "high", daysBeforeEvent: 30 },
    { title: "Send invitations", category: "Invitations", priority: "high", daysBeforeEvent: 21 },
    { title: "Order catering", category: "Catering", priority: "high", daysBeforeEvent: 14 },
    { title: "Florals + decor", category: "Decor", priority: "medium", daysBeforeEvent: 14 },
  ],
  anniversary: [
    { title: "Reserve restaurant / venue", category: "Venue", priority: "high", daysBeforeEvent: 30 },
    { title: "Order florals", category: "Florals", priority: "medium", daysBeforeEvent: 7 },
    { title: "Order cake", category: "Food", priority: "medium", daysBeforeEvent: 5 },
    { title: "Plan music", category: "Atmosphere", priority: "low", daysBeforeEvent: 7 },
  ],
  graduation: [
    { title: "Pick venue", category: "Venue", priority: "high", daysBeforeEvent: 45 },
    { title: "Send invitations", category: "Invitations", priority: "high", daysBeforeEvent: 30 },
    { title: "Plan catering", category: "Catering", priority: "high", daysBeforeEvent: 21 },
    { title: "Order cake + decor", category: "Decor", priority: "low", daysBeforeEvent: 10 },
  ],
  corporate: [
    { title: "Reserve venue + AV", category: "Venue", priority: "high", daysBeforeEvent: 60 },
    { title: "Send agenda + invitations", category: "Comms", priority: "high", daysBeforeEvent: 30 },
    { title: "Lock catering", category: "Catering", priority: "high", daysBeforeEvent: 21 },
    { title: "Print name tags / materials", category: "Logistics", priority: "medium", daysBeforeEvent: 7 },
    { title: "Confirm speakers / programming", category: "Programming", priority: "high", daysBeforeEvent: 14 },
    { title: "Photographer", category: "Coverage", priority: "low", daysBeforeEvent: 30 },
  ],
};

const taskTemplateLabel: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  holiday_dinner: "Holiday dinner",
  baby_shower: "Baby shower",
  engagement: "Engagement",
  anniversary: "Anniversary",
  graduation: "Graduation",
  corporate: "Corporate",
};

interface TaskRow {
  id: string;
  title: string;
  category: string | null;
  priority: "low" | "medium" | "high" | null;
  status: "pending" | "in-progress" | "completed" | "overdue";
  due_date: string | null;
  notes: string | null;
}

const priorityStyles: Record<string, string> = {
  low: "bg-secondary text-muted-foreground border-border",
  medium: "bg-accent/15 text-accent border-accent/30",
  high: "bg-destructive/15 text-destructive border-destructive/30",
};

const statusFilters: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in-progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
];

function statusFromRow(t: TaskRow): TaskRow["status"] {
  if (t.status === "completed") return "completed";
  if (
    t.due_date &&
    new Date(t.due_date) < new Date(new Date().toDateString())
  )
    return "overdue";
  return t.status;
}

export default function TasksPage() {
  const { user, activeEvent, profile } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [seeding, setSeeding] = useState<string | null>(null);

  const eventType =
    activeEvent?.event_type ?? profile?.event_type ?? null;
  const eventDateStr =
    activeEvent?.event_date ?? profile?.event_date ?? null;

  async function applyTemplate(key: string) {
    if (!user) return;
    const template = taskTemplates[key];
    if (!template) return;
    setSeeding(key);
    const baseDate = eventDateStr ? new Date(eventDateStr) : null;
    const rows = template.map((t) => {
      const due = baseDate ? new Date(baseDate) : null;
      if (due) due.setDate(due.getDate() - t.daysBeforeEvent);
      return {
        host_id: user.id,
        title: t.title,
        category: t.category,
        priority: t.priority,
        status: "pending" as const,
        due_date: due ? due.toISOString().slice(0, 10) : null,
      };
    });
    const { error } = await tasksTable().insert(rows);
    setSeeding(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `Added ${rows.length} ${taskTemplateLabel[key]} tasks`,
    );
    load();
  }

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await tasksTable()
      .select("id, title, category, priority, status, due_date, notes")
      .eq("host_id", user.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setTasks((data as TaskRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function toggleComplete(t: TaskRow) {
    const next: TaskRow["status"] =
      t.status === "completed" ? "pending" : "completed";
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)),
    );
    const { error } = await tasksTable()
      .update({ status: next })
      .eq("id", t.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await tasksTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  const visibleTasks = tasks
    .map((t) => ({ ...t, status: statusFromRow(t) }))
    .filter((t) => filter === "all" || t.status === filter);

  const overdueCount = tasks.filter((t) => statusFromRow(t) === "overdue").length;
  const pendingCount = tasks.filter(
    (t) => statusFromRow(t) !== "completed",
  ).length;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-display text-xl">Tasks</h1>
              <p className="text-sm text-muted-foreground">
                {pendingCount} pending {pendingCount === 1 ? "task" : "tasks"}
              </p>
            </div>
            <Button
              onClick={() => setAddOpen(true)}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New task
            </Button>
          </div>
          <SubNavTabs tabs={PLANNING_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 space-y-6 max-w-3xl">
          {overdueCount > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-sm p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="text-sm">
                <span className="font-medium">
                  {overdueCount} overdue
                </span>{" "}
                <span className="text-muted-foreground">— catch up before they pile up.</span>
              </p>
            </div>
          )}

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {statusFilters.map((opt) => {
              const count =
                opt.value === "all"
                  ? tasks.length
                  : tasks.filter((t) => statusFromRow(t) === opt.value).length;
              return (
                <Button
                  key={opt.value}
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilter(opt.value)}
                  className={`rounded-full whitespace-nowrap h-8 text-xs ${
                    filter === opt.value
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                  <span className="ml-2 tnum opacity-70">{count}</span>
                </Button>
              );
            })}
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-sm" />
              ))}
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="text-center py-16 px-6 bg-card border border-border rounded-sm">
              <Calendar className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
              <p className="font-display text-xl mb-2">
                {tasks.length === 0
                  ? "No tasks yet"
                  : "Nothing matches that filter"}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6 leading-relaxed">
                {tasks.length === 0
                  ? "Track everything you owe yourself and your vendors before the event."
                  : "Try a different status filter above."}
              </p>
              {tasks.length === 0 && (
                <>
                  {eventType && taskTemplates[eventType] && (
                    <Button
                      onClick={() => applyTemplate(eventType)}
                      disabled={seeding !== null}
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90 mb-3"
                    >
                      {seeding === eventType ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Use {taskTemplateLabel[eventType]} template
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto mt-3">
                    {Object.keys(taskTemplates)
                      .filter((k) => k !== eventType)
                      .map((k) => (
                        <Button
                          key={k}
                          variant="outline"
                          size="sm"
                          onClick={() => applyTemplate(k)}
                          disabled={seeding !== null}
                          className="rounded-full text-xs h-8"
                        >
                          {seeding === k && (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          )}
                          {taskTemplateLabel[k]}
                        </Button>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    or{" "}
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      className="text-accent hover:underline"
                    >
                      add your own
                    </button>
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-4 rounded-sm border border-border bg-card group"
                >
                  <button
                    onClick={() => toggleComplete(t)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      t.status === "completed"
                        ? "border-accent bg-accent"
                        : "border-muted hover:border-accent/50"
                    }`}
                    aria-label={
                      t.status === "completed"
                        ? "Mark incomplete"
                        : "Mark complete"
                    }
                  >
                    {t.status === "completed" && (
                      <Check className="w-3 h-3 text-accent-foreground" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        t.status === "completed"
                          ? "line-through text-muted-foreground"
                          : ""
                      }`}
                    >
                      {t.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      {t.due_date && (
                        <span className="tnum">
                          Due {t.due_date}
                        </span>
                      )}
                      {t.category && (
                        <>
                          <span>·</span>
                          <span>{t.category}</span>
                        </>
                      )}
                      {t.status === "overdue" && (
                        <Badge
                          variant="outline"
                          className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]"
                        >
                          Overdue
                        </Badge>
                      )}
                    </div>
                  </div>

                  {t.priority && (
                    <Badge
                      variant="outline"
                      className={`${priorityStyles[t.priority]} text-[10px] uppercase tracking-wider`}
                    >
                      {t.priority}
                    </Badge>
                  )}

                  <button
                    onClick={() => deleteTask(t.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <AddTaskDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          hostId={user.id}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function AddTaskDialog({
  open,
  onOpenChange,
  hostId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }
    setSubmitting(true);
    const { error } = await tasksTable().insert({
      host_id: hostId,
      title: title.trim(),
      category: category.trim() || null,
      priority,
      due_date: dueDate || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    setCategory("");
    setPriority("medium");
    setDueDate("");
    toast.success("Task added");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Confirm catering menu, send invitations…"
              className="h-10"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-category">Category</Label>
            <Input
              id="task-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Catering, Florals, Guest list…"
              className="h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}
              >
                <SelectTrigger id="task-priority" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
