import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, Store, CalendarDays, FileText, Mail, CheckSquare,
  ListTodo, CreditCard, Heart, Plus, Trash2, Edit2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { customerNavItems as navItems } from "@/data/navItems";
import { checklistItems as initialItems } from "@/data/sampleData";

const templates: Record<string, string[]> = {
  wedding: ["Venue", "Photographer", "Catering", "Florist", "DJ", "Cake", "Invitations", "Guest List", "Officiant", "Makeup Artist", "Decorations", "Transportation"],
  birthday: ["Venue", "Catering", "Cake", "Decorations", "DJ", "Invitations", "Guest List", "Favors"],
  corporate: ["Venue", "Catering", "AV Equipment", "Speaker", "Name Tags", "Invitations", "Transportation"],
  "baby-shower": ["Venue", "Catering", "Decorations", "Games", "Invitations", "Guest List", "Favors", "Cake"],
};

export default function ChecklistPage() {
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState("");

  const completed = items.filter((i) => i.completed).length;
  const pct = Math.round((completed / items.length) * 100);

  const toggleItem = (id: string) => {
    setItems(items.map((i) => i.id === id ? { ...i, completed: !i.completed } : i));
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems([...items, { id: Date.now().toString(), name: newItem, completed: false, category: "Custom" }]);
    setNewItem("");
  };

  const removeItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            <h1 className="font-display text-xl">Event Checklist</h1>
            <p className="text-sm text-muted-foreground">{completed} of {items.length} items completed</p>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6 max-w-2xl">
          {/* Progress */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-display tnum">{pct}%</span>
              <span className="text-sm text-muted-foreground">{completed}/{items.length} completed</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>

          {/* Templates */}
          <div className="bg-card rounded-2xl p-5 card-shadow">
            <p className="font-label text-muted-foreground mb-3">Quick Templates</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(templates).map((t) => (
                <Button key={t} variant="outline" size="sm" className="rounded-full capitalize h-8"
                  onClick={() => {
                    const newItems = templates[t].map((name, i) => ({
                      id: `tmpl-${Date.now()}-${i}`,
                      name,
                      completed: false,
                      category: "Template",
                    }));
                    setItems(newItems);
                  }}>
                  {t.replace("-", " ")}
                </Button>
              ))}
            </div>
          </div>

          {/* Add item */}
          <div className="flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Add a new item..."
              className="h-11 rounded-lg bg-secondary border-none flex-1"
            />
            <Button onClick={addItem} className="h-11 rounded-lg">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Items */}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-card card-shadow group">
                <button
                  onClick={() => toggleItem(item.id)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    item.completed ? "border-accent bg-accent" : "border-muted hover:border-accent/50"
                  }`}
                >
                  {item.completed && <Check className="w-3 h-3 text-accent-foreground" />}
                </button>
                <span className={`flex-1 text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                  {item.name}
                </span>
                <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
                <button onClick={() => removeItem(item.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
