import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Users,
  Edit2,
  X,
  Download,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { customerNavItems as navItems } from "@/data/navItems";

interface Guest {
  id: string;
  name: string;
  rsvp_status: "attending" | "declined" | "maybe" | null;
  table_id: string | null;
}

interface TableRow {
  id: string;
  name: string;
  capacity: number;
  shape: "round" | "rect";
  display_order: number;
  notes: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tablesTable = () => (supabase as any).from("event_tables");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guestsTable = () => (supabase as any).from("event_guests");

export default function SeatingChartPage() {
  const { user } = useAuth();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableRow | null>(null);

  // Drag state for both desktop and mobile (mobile uses tap-to-pick).
  const [pickedGuestId, setPickedGuestId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | "unassigned" | null>(
    null,
  );

  async function load() {
    if (!user) return;
    setLoading(true);
    const [guestRes, tableRes] = await Promise.all([
      guestsTable()
        .select("id, name, rsvp_status, table_id")
        .eq("host_id", user.id)
        .order("name", { ascending: true }),
      tablesTable()
        .select("id, name, capacity, shape, display_order, notes")
        .eq("host_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    setGuests((guestRes.data as Guest[]) ?? []);
    setTables((tableRes.data as TableRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const guestsByTable = useMemo(() => {
    const m = new Map<string, Guest[]>();
    for (const g of guests) {
      const key = g.table_id ?? "_unassigned";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(g);
    }
    return m;
  }, [guests]);

  const unassigned = guestsByTable.get("_unassigned") ?? [];
  const totalAttending = guests.filter((g) => g.rsvp_status === "attending").length;

  async function assignGuest(guestId: string, tableId: string | null) {
    // Optimistic update
    const prev = guests;
    setGuests((p) =>
      p.map((g) => (g.id === guestId ? { ...g, table_id: tableId } : g)),
    );
    setPickedGuestId(null);
    setDropTargetId(null);

    const { error } = await guestsTable()
      .update({ table_id: tableId })
      .eq("id", guestId);
    if (error) {
      setGuests(prev);
      toast.error(error.message);
    }
  }

  async function deleteTable(t: TableRow) {
    const seated = guestsByTable.get(t.id)?.length ?? 0;
    if (
      seated > 0 &&
      !window.confirm(
        `${seated} guests are seated at "${t.name}". Delete the table and return them to the unassigned list?`,
      )
    ) {
      return;
    }
    const { error } = await tablesTable().delete().eq("id", t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Table removed");
    load();
  }

  function exportCsv() {
    if (tables.length === 0 && guests.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const rows = ["table,seat,guest,rsvp"];
    const tableMap = new Map(tables.map((t) => [t.id, t.name]));
    // Seated first, grouped by table
    for (const t of tables) {
      const seated = (guestsByTable.get(t.id) ?? []).slice();
      seated.forEach((g, i) => {
        rows.push(
          [
            JSON.stringify(t.name),
            i + 1,
            JSON.stringify(g.name),
            g.rsvp_status ?? "",
          ].join(","),
        );
      });
    }
    // Unassigned at the end
    unassigned.forEach((g) => {
      rows.push(
        ["", "", JSON.stringify(g.name), g.rsvp_status ?? ""].join(","),
      );
    });
    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendora-seating-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Seating exported");
    // Reuse mapping silently — keep TS happy.
    void tableMap;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display text-xl">Seating chart</h1>
              <p className="text-sm text-muted-foreground">
                Drag guests onto tables · {totalAttending} attending,{" "}
                {unassigned.length} unassigned
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={tables.length === 0 && guests.length === 0}
                className="rounded-full"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTable(null);
                  setTableEditorOpen(true);
                }}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New table
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading…
            </div>
          ) : guests.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">No guests yet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Add guests on the Guests page first — they'll show up here so
                you can drag them onto tables.
              </p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[260px_1fr] gap-6">
              {/* Unassigned panel */}
              <aside className="bg-card border border-border rounded-sm p-4 max-h-[calc(100vh-180px)] overflow-y-auto sticky top-24">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-label text-muted-foreground">Unassigned</p>
                  <span className="text-xs tnum text-muted-foreground">
                    {unassigned.length}
                  </span>
                </div>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTargetId("unassigned");
                  }}
                  onDragLeave={() => setDropTargetId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/guest-id");
                    if (id) assignGuest(id, null);
                  }}
                  onClick={() => {
                    if (pickedGuestId) assignGuest(pickedGuestId, null);
                  }}
                  className={`min-h-[120px] rounded-sm transition-colors ${
                    dropTargetId === "unassigned"
                      ? "bg-accent/10 ring-1 ring-accent"
                      : ""
                  }`}
                >
                  {unassigned.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Everyone's seated.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {unassigned.map((g) => (
                        <GuestPill
                          key={g.id}
                          guest={g}
                          isPicked={pickedGuestId === g.id}
                          onPick={() =>
                            setPickedGuestId(pickedGuestId === g.id ? null : g.id)
                          }
                        />
                      ))}
                    </ul>
                  )}
                </div>
                {pickedGuestId && (
                  <p className="text-xs text-accent mt-3 leading-relaxed">
                    Tap a table or "Unassigned" to drop the picked guest.
                  </p>
                )}
              </aside>

              {/* Tables grid */}
              <section>
                {tables.length === 0 ? (
                  <div className="border border-dashed border-border rounded-sm p-12 text-center">
                    <p className="font-display text-xl mb-2">No tables yet</p>
                    <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto leading-relaxed">
                      Add a table to start arranging seats. You can edit names
                      and capacities later.
                    </p>
                    <Button
                      onClick={() => {
                        setEditingTable(null);
                        setTableEditorOpen(true);
                      }}
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add a table
                    </Button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {tables.map((t) => {
                      const seated = guestsByTable.get(t.id) ?? [];
                      const overCapacity = seated.length > t.capacity;
                      return (
                        <div
                          key={t.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDropTargetId(t.id);
                          }}
                          onDragLeave={() => setDropTargetId(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData("text/guest-id");
                            if (id) assignGuest(id, t.id);
                          }}
                          onClick={() => {
                            if (pickedGuestId)
                              assignGuest(pickedGuestId, t.id);
                          }}
                          className={`rounded-sm border p-4 bg-card transition-colors ${
                            dropTargetId === t.id
                              ? "border-accent bg-accent/5"
                              : overCapacity
                                ? "border-destructive/40"
                                : "border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="font-display text-base truncate">
                                {t.name}
                              </p>
                              <p className="text-xs text-muted-foreground tnum">
                                {seated.length} / {t.capacity} ·{" "}
                                {t.shape === "round" ? "Round" : "Rectangle"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTable(t);
                                  setTableEditorOpen(true);
                                }}
                                aria-label="Edit table"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTable(t);
                                }}
                                aria-label="Delete table"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                          </div>
                          {overCapacity && (
                            <p className="flex items-center gap-1.5 text-xs text-destructive mb-2">
                              <AlertCircle className="w-3 h-3" />
                              Over capacity
                            </p>
                          )}
                          {seated.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border/50 rounded-sm">
                              Drop guests here
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {seated.map((g) => (
                                <GuestPill
                                  key={g.id}
                                  guest={g}
                                  isPicked={pickedGuestId === g.id}
                                  onPick={() =>
                                    setPickedGuestId(
                                      pickedGuestId === g.id ? null : g.id,
                                    )
                                  }
                                />
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <TableEditor
          open={tableEditorOpen}
          onOpenChange={setTableEditorOpen}
          hostId={user.id}
          editing={editingTable}
          nextOrder={
            tables.reduce((m, t) => Math.max(m, t.display_order), -1) + 1
          }
          onSuccess={load}
        />
      )}
    </div>
  );
}

function GuestPill({
  guest,
  isPicked,
  onPick,
}: {
  guest: Guest;
  isPicked: boolean;
  onPick: () => void;
}) {
  const rsvpDot =
    guest.rsvp_status === "attending"
      ? "bg-accent"
      : guest.rsvp_status === "declined"
        ? "bg-muted-foreground/40"
        : guest.rsvp_status === "maybe"
          ? "bg-secondary-foreground/50"
          : "bg-border";
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/guest-id", guest.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs cursor-grab active:cursor-grabbing select-none transition-colors ${
        isPicked
          ? "bg-foreground text-background"
          : "bg-secondary/60 hover:bg-secondary"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rsvpDot}`} />
      <span className="truncate">{guest.name}</span>
      {isPicked && <X className="w-3 h-3 ml-auto shrink-0" />}
    </li>
  );
}

function TableEditor({
  open,
  onOpenChange,
  hostId,
  editing,
  nextOrder,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  editing: TableRow | null;
  nextOrder: number;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [shape, setShape] = useState<"round" | "rect">("round");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? `Table ${nextOrder + 1}`);
      setCapacity((editing?.capacity ?? 8).toString());
      setShape(editing?.shape ?? "round");
    }
  }, [open, editing, nextOrder]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const cap = Number.parseInt(capacity, 10);
    if (!Number.isFinite(cap) || cap < 1 || cap > 30) {
      toast.error("Capacity must be 1–30");
      return;
    }
    setSubmitting(true);
    const payload = { name: name.trim(), capacity: cap, shape };
    const { error } = editing
      ? await tablesTable().update(payload).eq("id", editing.id)
      : await tablesTable().insert({
          ...payload,
          host_id: hostId,
          display_order: nextOrder,
        });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Table updated" : "Table added");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit table" : "New table"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="t-name">Name</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="t-cap">Capacity</Label>
              <Input
                id="t-cap"
                type="number"
                min="1"
                max="30"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-shape">Shape</Label>
              <Select
                value={shape}
                onValueChange={(v) => setShape(v as "round" | "rect")}
              >
                <SelectTrigger id="t-shape">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round">Round</SelectItem>
                  <SelectItem value="rect">Rectangle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
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
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Save" : "Add table"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
