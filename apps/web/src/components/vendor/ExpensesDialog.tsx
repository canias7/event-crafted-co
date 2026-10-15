// Record a business expense (owner's call, Oct 2026). Saved to
// vendor_expenses as an account-level row (user_id = the vendor, no
// listing), which the Overview's Operating expenses card and the Cash
// flow card's "Money out" already read. The dialog also lists recent
// expenses so a mistake can be deleted.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatReceivedOn } from "@/components/vendor/OutsidePaymentsDialog";
import { moneyLocale, siteIsEnglish } from "@/lib/intlLocale";

// Same set the table was built with (tax-form friendly).
export const EXPENSE_CATEGORIES = [
  "supplies",
  "rentals",
  "labor",
  "travel",
  "mileage",
  "marketing",
  "software",
  "fees",
  "meals",
  "insurance",
  "other",
] as const;
type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

interface Expense {
  id: string;
  amount_cents: number;
  occurred_on: string;
  category: string;
  description: string;
  paid_to: string | null;
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "1,250.50" / "$1250" / "1250,5" → cents; null unless a positive amount
// under $1,000,000.
function parseAmountToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000) return null;
  return cents;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(siteIsEnglish() ? "en-US" : moneyLocale(), {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function ExpensesDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after an expense is added or deleted so the Overview refetches.
  onChanged: () => void;
}) {
  const { t } = useTranslation("vendorPayments");
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [paidTo, setPaidTo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [descError, setDescError] = useState(false);
  const [list, setList] = useState<Expense[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadList() {
    if (!user) return;
    setLoadingList(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_expenses")
      .select("id, amount_cents, occurred_on, category, description, paid_to")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    setList((data ?? []) as Expense[]);
    setLoadingList(false);
  }

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setOccurredOn(todayIso());
    setDescription("");
    setCategory("supplies");
    setPaidTo("");
    setNote("");
    setAmountError(false);
    setDescError(false);
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const cents = parseAmountToCents(amount);
    const desc = description.trim();
    setAmountError(cents === null);
    setDescError(!desc);
    if (cents === null || !desc) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_expenses").insert({
      user_id: user.id,
      created_by: user.id,
      amount_cents: cents,
      occurred_on: occurredOn || todayIso(),
      category,
      description: desc.slice(0, 120),
      paid_to: paidTo.trim() || null,
      notes: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(t("expense_form.save_failed"));
      return;
    }
    toast.success(t("expense_form.saved", { amount: formatMoney(cents) }));
    setAmount("");
    setDescription("");
    setPaidTo("");
    setNote("");
    void loadList();
    onChanged();
  }

  async function remove(x: Expense) {
    setDeletingId(x.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_expenses").delete().eq("id", x.id);
    setDeletingId(null);
    if (error) {
      toast.error(t("expense_form.delete_failed"));
      return;
    }
    setList((l) => l.filter((y) => y.id !== x.id));
    onChanged();
  }

  const categoryLabel = (c: string) =>
    (EXPENSE_CATEGORIES as readonly string[]).includes(c)
      ? t(`expense_form.categories.${c}`)
      : c;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-editorial text-xl">{t("expense_form.title")}</DialogTitle>
          <DialogDescription>{t("expense_form.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <Label htmlFor="ex-amount">{t("expense_form.amount")}</Label>
              <Input
                id="ex-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountError(false);
                }}
                aria-invalid={amountError}
                className="mt-1.5"
              />
              {amountError ? (
                <p className="mt-1 text-xs text-destructive">{t("outside.amount_invalid")}</p>
              ) : null}
            </div>
            <div className="min-w-0">
              <Label htmlFor="ex-date">{t("expense_form.date")}</Label>
              <Input
                id="ex-date"
                type="date"
                max={todayIso()}
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ex-desc">{t("expense_form.what")}</Label>
            <Input
              id="ex-desc"
              maxLength={120}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescError(false);
              }}
              placeholder={t("expense_form.what_placeholder")}
              aria-invalid={descError}
              className="mt-1.5"
            />
            {descError ? (
              <p className="mt-1 text-xs text-destructive">{t("expense_form.what_required")}</p>
            ) : null}
          </div>

          <div>
            <Label>{t("expense_form.category")}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="ex-paidto">{t("expense_form.paid_to")}</Label>
            <Input
              id="ex-paidto"
              maxLength={120}
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
              placeholder={t("expense_form.paid_to_placeholder")}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="ex-note">{t("outside.note")}</Label>
            <Textarea
              id="ex-note"
              maxLength={500}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {t("expense_form.save")}
          </Button>
        </form>

        <div className="mt-2 border-t border-border pt-4">
          <p className="font-label m-0 text-accent">{t("expense_form.recorded")}</p>
          {loadingList ? (
            <div className="py-4 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("outside.none")}</p>
          ) : (
            <ul className="m-0 mt-2 p-0 list-none divide-y divide-border">
              {list.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">
                      {formatMoney(x.amount_cents)}
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        {x.description}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatReceivedOn(x.occurred_on)}
                      {" · "}
                      {categoryLabel(x.category)}
                      {x.paid_to ? ` · ${x.paid_to}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(x)}
                    disabled={deletingId === x.id}
                    aria-label={t("expense_form.delete")}
                    className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                  >
                    {deletingId === x.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
