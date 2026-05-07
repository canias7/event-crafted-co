import { useEffect, useState } from "react";
import { Plus, Check, Trash2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { PLANNING_HUB_TABS } from "@/data/hubTabs";
import { customerNavItems as navItems } from "@/data/navItems";

const checklistTable = () => supabase.from("checklist_items");

// Template starter sets by event type. Vendora is a multi-event marketplace
// (weddings + birthdays + holiday dinners + showers + corporate + more), so
// the templates cover the breadth of what hosts plan.
const templates: Record<string, string[]> = {
  wedding: [
    "Venue",
    "Ceremony officiant",
    "Photographer",
    "Videographer",
    "Florist",
    "Catering",
    "DJ / band",
    "Cake / baker",
    "Invitations",
    "Guest list",
    "Makeup & hair",
    "Attire",
    "Decorations",
    "Transportation",
    "Wedding party gifts",
    "Accommodation block",
  ],
  birthday: [
    "Venue",
    "Catering",
    "Cake",
    "Decorations",
    "DJ / entertainment",
    "Invitations",
    "Guest list",
    "Favors",
    "Photographer",
  ],
  holiday_dinner: [
    "Menu / catering",
    "Tablescape & linens",
    "Florals / centerpieces",
    "Place cards",
    "Music / playlist",
    "Invitations",
    "Beverage program",
    "Lighting / candles",
  ],
  baby_shower: [
    "Venue / host",
    "Catering",
    "Cake / desserts",
    "Decorations",
    "Games",
    "Favors",
    "Invitations",
    "Guest list",
    "Photographer",
  ],
  engagement: [
    "Venue",
    "Photographer",
    "Catering",
    "Decorations",
    "Invitations",
    "Guest list",
  ],
  anniversary: [
    "Venue / restaurant",
    "Catering",
    "Florals",
    "Cake",
    "Music",
    "Decorations",
    "Invitations",
  ],
  graduation: [
    "Venue",
    "Catering",
    "Decorations",
    "Cake",
    "Photographer",
    "Invitations",
    "Favors",
  ],
  corporate: [
    "Venue",
    "Catering",
    "AV equipment",
    "Speaker / programming",
    "Name tags",
    "Invitations",
    "Transportation",
    "Photographer",
  ],
};

const templateLabel: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  holiday_dinner: "Holiday dinner",
  baby_shower: "Baby shower",
  engagement: "Engagement",
  anniversary: "Anniversary",
  graduation: "Graduation",
  corporate: "Corporate",
};

interface ChecklistRow {
  id: string;
  name: string;
  category: string | null;
  completed: boolean;
  display_order: number;
}

export default function ChecklistPage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await checklistTable()
      .select("id, name, category, completed, display_order")
      .eq("host_id", user.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data as ChecklistRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function toggleItem(item: ChecklistRow) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, completed: !i.completed } : i,
      ),
    );
    const { error } = await checklistTable()
      .update({ completed: !item.completed })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function addItem() {
    if (!user || !newItem.trim()) return;
    setAdding(true);
    const order = items.reduce((m, i) => Math.max(m, i.display_order), 0) + 1;
    const { error } = await checklistTable().insert({
      host_id: user.id,
      name: newItem.trim(),
      category: "Custom",
      display_order: order,
    });
    setAdding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewItem("");
    load();
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await checklistTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function applyTemplate(key: string) {
    if (!user) return;
    setSeeding(key);
    const names = templates[key];
    const startOrder =
      items.reduce((m, i) => Math.max(m, i.display_order), 0) + 1;
    const rows = names.map((name, i) => ({
      host_id: user.id,
      name,
      category: templateLabel[key],
      display_order: startOrder + i,
    }));
    const { error } = await checklistTable().insert(rows);
    setSeeding(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${templateLabel[key]} template added`);
    load();
  }

  const completed = items.filter((i) => i.completed).length;
  const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;
  const suggested = profile?.event_type ?? null;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-display text-xl">Event checklist</h1>
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? "Track everything you need for the big day"
                : `${completed} of ${items.length} items completed`}
            </p>
          </div>
          <SubNavTabs tabs={PLANNING_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 space-y-6 max-w-2xl">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-sm" />
          ) : (
            <>
              {/* Progress */}
              {items.length > 0 && (
                <div className="bg-card rounded-sm border border-border p-5">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-2xl font-display tnum">{pct}%</span>
                    <span className="text-sm text-muted-foreground">
                      {completed}/{items.length} completed
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              )}

              {/* Empty state with template suggestions */}
              {items.length === 0 && (
                <div className="bg-card border border-border rounded-sm p-8 text-center">
                  <Sparkles className="w-8 h-8 mx-auto text-accent mb-3" />
                  <p className="font-display text-xl mb-2">
                    Start with a template
                  </p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
                    Pick the template closest to your event — you can edit,
                    delete, or add anything after.
                  </p>
                  {suggested && templates[suggested] && (
                    <Button
                      onClick={() => applyTemplate(suggested)}
                      disabled={seeding !== null}
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90 mb-3"
                    >
                      {seeding === suggested ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Use {templateLabel[suggested]} template
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {Object.keys(templates)
                      .filter((k) => k !== suggested)
                      .map((k) => (
                        <Button
                          key={k}
                          variant="outline"
                          size="sm"
                          className="rounded-full h-8"
                          onClick={() => applyTemplate(k)}
                          disabled={seeding !== null}
                        >
                          {seeding === k ? (
                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                          ) : null}
                          {templateLabel[k]}
                        </Button>
                      ))}
                  </div>
                </div>
              )}

              {/* Add item */}
              <div className="flex gap-2">
                <Input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  placeholder="Add an item…"
                  className="h-11 flex-1"
                  disabled={adding}
                />
                <Button
                  onClick={addItem}
                  disabled={adding || !newItem.trim()}
                  className="h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 px-4"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-sm border border-border bg-card group"
                    >
                      <button
                        onClick={() => toggleItem(item)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          item.completed
                            ? "border-accent bg-accent"
                            : "border-muted hover:border-accent/50"
                        }`}
                      >
                        {item.completed && (
                          <Check className="w-3 h-3 text-accent-foreground" />
                        )}
                      </button>
                      <span
                        className={`flex-1 text-sm ${
                          item.completed
                            ? "line-through text-muted-foreground"
                            : ""
                        }`}
                      >
                        {item.name}
                      </span>
                      {item.category && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] uppercase tracking-wider"
                        >
                          {item.category}
                        </Badge>
                      )}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Delete item"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
