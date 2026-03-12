import { useState } from "react";
import {
  LayoutDashboard, Store, CalendarDays, FileText, Mail, CheckSquare,
  ListTodo, CreditCard, Heart, Plus, Calendar, List, AlertTriangle, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { customerTasks as initialTasks } from "@/data/sampleData";

const navItems = [
  { label: "Dashboard", path: "/customer/dashboard", icon: LayoutDashboard },
  { label: "Vendors", path: "/vendors", icon: Store },
  { label: "Appointments", path: "/customer/appointments", icon: CalendarDays },
  { label: "Event Details", path: "/customer/event", icon: FileText },
  { label: "Invitations", path: "/customer/invitations", icon: Mail },
  { label: "Checklist", path: "/customer/checklist", icon: CheckSquare },
  { label: "Tasks", path: "/customer/tasks", icon: ListTodo },
  { label: "Payments", path: "/customer/payments", icon: CreditCard },
  { label: "Favorites", path: "/customer/favorites", icon: Heart },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState("all");

  const filtered = tasks.filter((t) => filter === "all" || t.status === filter);

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-accent";
      case "in-progress": return "bg-accent/60";
      case "overdue": return "bg-destructive";
      default: return "bg-muted-foreground/30";
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            <h1 className="font-display text-xl">Tasks</h1>
            <p className="text-sm text-muted-foreground">{tasks.filter(t => t.status !== "completed").length} pending tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}><List className="w-4 h-4" /></Button>
            <Button variant={view === "calendar" ? "secondary" : "ghost"} size="sm" onClick={() => setView("calendar")}><Calendar className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6 max-w-3xl">
          {/* Overdue banner */}
          {tasks.some(t => t.status === "overdue") && (
            <div className="bg-destructive/10 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">You have overdue tasks</p>
                <p className="text-xs text-muted-foreground">{tasks.filter(t => t.status === "overdue").length} task(s) past due date</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            {["all", "pending", "in-progress", "overdue", "completed"].map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "secondary"}
                size="sm"
                className="rounded-full capitalize h-8"
                onClick={() => setFilter(f)}
              >
                {f.replace("-", " ")}
              </Button>
            ))}
          </div>

          {/* Smart tasks suggestion */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <p className="font-label text-accent mb-3">Suggested Tasks</p>
            <div className="flex flex-wrap gap-2">
              {["Send save-the-dates", "Book rehearsal dinner venue", "Schedule dress fitting", "Order wedding favors"].map((s, i) => (
                <Button key={i} variant="outline" size="sm" className="rounded-full h-8 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> {s}
                </Button>
              ))}
            </div>
          </div>

          {/* Task list */}
          <div className="space-y-2">
            {filtered.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-4 rounded-xl bg-card card-shadow">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor(task.status)}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{task.category}</p>
                </div>
                <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "outline" : "secondary"} className="text-[10px]">
                  {task.priority}
                </Badge>
                <span className={`text-xs tnum font-medium ${task.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>
                  {task.dueDate}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
