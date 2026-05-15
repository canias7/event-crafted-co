import { useEffect, useState } from "react";
import {
  Plus,
  CreditCard,
  DollarSign,
  Loader2,
  Trash2,
  X,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetBenchmarkBadge } from "@/components/budget/BudgetBenchmarkBadge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { StatCard } from "@/components/shared/StatCard";
import { customerNavItems as navItems } from "@/data/navItems";
import { BudgetBreakdownChart } from "@/components/budget/BudgetBreakdownChart";

const budgetTable = () => supabase.from("budget_items");

// Categories cover all event types Vendora supports — weddings, birthdays,
// holiday dinners, baby showers, corporate, etc.
const categories = [
  "Venue",
  "Catering",
  "Photography",
  "Videography",
  "Florals",
  "Music & Entertainment",
  "Cake & Bakery",
  "Decorations",
  "Invitations",
  "Attire",
  "Beauty",
  "Transportation",
  "Favors & Gifts",
  "AV / Equipment",
  "Other",
];

interface BudgetRow {
  id: string;
  vendor_id: string | null;
  category: string | null;
  description: string;
  amount_cents: number;
  paid_cents: number;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function status(item: BudgetRow): "paid" | "partial" | "overdue" | "pending" {
  if (item.paid_cents >= item.amount_cents && item.amount_cents > 0)
    return "paid";
  if (item.paid_cents > 0) return "partial";
  if (item.due_date && new Date(item.due_date) < new Date(new Date().toDateString()))
    return "overdue";
  return "pending";
}

const statusStyles: Record<string, string> = {
  paid: "bg-accent/15 text-accent border-accent/30",
  partial: "bg-secondary text-secondary-foreground border-border",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-secondary text-muted-foreground border-border",
};

export default function PaymentsPage() {
  const { user, activeEvent } = useAuth();
  const [items, setItems] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await budgetTable()
      .select(
        "id, vendor_id, category, description, amount_cents, paid_cents, due_date, paid_at, notes",
      )
      .eq("host_id", user.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setItems((data as BudgetRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await budgetTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  function exportCsv() {
    if (items.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const headers = [
      "description",
      "category",
      "amount",
      "paid",
      "outstanding",
      "due_date",
      "status",
    ];
    const escape = (v: string) =>
      `"${String(v).replace(/"/g, '""')}"`;
    const rows = items.map((i) => {
      const outstanding = (i.amount_cents - i.paid_cents) / 100;
      const s = status(i);
      return [
        escape(i.description),
        escape(i.category ?? ""),
        (i.amount_cents / 100).toFixed(2),
        (i.paid_cents / 100).toFixed(2),
        outstanding.toFixed(2),
        i.due_date ?? "",
        s,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendora-budget-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Budget exported");
  }

  async function markPaid(item: BudgetRow) {
    const { error } = await budgetTable()
      .update({
        paid_cents: item.amount_cents,
        paid_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marked paid");
    load();
  }

  const totalBudget = items.reduce((s, i) => s + i.amount_cents, 0);
  const totalPaid = items.reduce((s, i) => s + i.paid_cents, 0);
  const totalOutstanding = totalBudget - totalPaid;
  const overdueCount = items.filter((i) => status(i) === "overdue").length;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            <h1 className="font-editorial text-3xl">Budget</h1>
            <p className="text-sm text-muted-foreground">
              Track every line item across your event
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={items.length === 0}
              className="rounded-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={() => setAddOpen(true)}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New line item
            </Button>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total budget"
              value={dollars(totalBudget)}
              icon={DollarSign}
            />
            <StatCard
              label="Paid"
              value={dollars(totalPaid)}
              icon={CreditCard}
              accent
            />
            <StatCard
              label="Outstanding"
              value={dollars(totalOutstanding)}
              icon={CreditCard}
            />
            <StatCard
              label="Overdue"
              value={overdueCount}
              icon={CreditCard}
            />
          </div>

          {!loading && items.length > 0 && (
            <div className="mb-6">
              <BudgetBreakdownChart rows={items} />
            </div>
          )}

          <div className="card-soft overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 px-6">
                <CreditCard className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
                <p className="font-editorial text-3xl mb-2">
                  No line items yet
                </p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6 leading-relaxed">
                  Add deposits, balances, and miscellaneous expenses to keep
                  your budget honest.
                </p>
                <Button
                  onClick={() => setAddOpen(true)}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New line item
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Description
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Category
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Amount
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Paid
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Due
                      </th>
                      <th className="text-left py-3 px-5 font-label text-muted-foreground">
                        Status
                      </th>
                      <th className="text-right py-3 px-5 font-label text-muted-foreground">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const s = status(item);
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-3 px-5 font-medium">
                            {item.description}
                          </td>
                          <td className="py-3 px-5 text-muted-foreground">
                            {item.category ?? "—"}
                          </td>
                          <td className="py-3 px-5 tnum font-medium">
                            {dollars(item.amount_cents)}
                          </td>
                          <td className="py-3 px-5 tnum text-muted-foreground">
                            {dollars(item.paid_cents)}
                          </td>
                          <td className="py-3 px-5 tnum text-muted-foreground">
                            {item.due_date ?? "—"}
                          </td>
                          <td className="py-3 px-5">
                            <Badge
                              variant="outline"
                              className={statusStyles[s] ?? ""}
                            >
                              {s}
                            </Badge>
                          </td>
                          <td className="py-3 px-5 text-right whitespace-nowrap">
                            {s !== "paid" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs rounded-full mr-1"
                                onClick={() => markPaid(item)}
                              >
                                Mark paid
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => deleteItem(item.id)}
                              aria-label="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />

      {user && (
        <AddBudgetItemDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          hostId={user.id}
          eventLocation={activeEvent?.event_location ?? null}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function AddBudgetItemDialog({
  open,
  onOpenChange,
  hostId,
  eventLocation,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  eventLocation: string | null;
  onSuccess: () => void;
}) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setDescription("");
    setCategory("");
    setAmount("");
    setPaid("");
    setDueDate("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount) {
      toast.error("Description and amount are required");
      return;
    }
    setSubmitting(true);
    const { error } = await budgetTable().insert({
      host_id: hostId,
      description: description.trim(),
      category: category || null,
      amount_cents: Math.round(Number.parseFloat(amount) * 100),
      paid_cents: paid ? Math.round(Number.parseFloat(paid) * 100) : 0,
      due_date: dueDate || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Line item added");
    reset();
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            New line item
          </DialogTitle>
          <DialogDescription className="text-sm">
            Add a deposit, balance, or expense to your budget.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="bdesc">
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Venue deposit, photographer balance…"
              className="h-10"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bcat">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="bcat" className="h-10">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category && (
              <BudgetBenchmarkBadge
                category={category}
                location={eventLocation}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bamt">
                Amount ($) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bamt"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpaid">Paid ($)</Label>
              <Input
                id="bpaid"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder="0"
                className="h-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bdue">Due date</Label>
            <Input
              id="bdue"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10"
            />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding…
                </>
              ) : (
                "Add line item"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
