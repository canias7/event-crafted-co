// Record a payment received outside Vendora (owner's call, Oct 2026):
// cash, Zelle, a check, Venmo, a bank transfer or a card reader of the
// vendor's own. Saved to vendor_outside_payments (account-level, only the
// vendor can see them) and counted in the Overview's revenue alongside
// invoices paid through Vendora. The dialog also lists what's been
// recorded so a mistake can be deleted.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { moneyLocale, siteIsEnglish, siteLocaleOr } from "@/lib/intlLocale";

export const OUTSIDE_PAYMENT_METHODS = [
  "cash",
  "zelle",
  "check",
  "venmo",
  "bank_transfer",
  "card",
  "other",
] as const;
export type OutsidePaymentMethod = (typeof OUTSIDE_PAYMENT_METHODS)[number];

export interface OutsidePayment {
  id: string;
  amount_cents: number;
  received_on: string;
  method: OutsidePaymentMethod;
  client_name: string | null;
  note: string | null;
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "1,250.50" / "$1250" / "1250,5" → cents. Null when it isn't a positive
// amount under $1,000,000 (the table's limit).
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

// received_on is a calendar date: format it without a timezone shift.
export function formatReceivedOn(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(siteLocaleOr("en-US"), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function OutsidePaymentsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a payment is added or deleted so the Overview refetches.
  onChanged: () => void;
}) {
  const { t } = useTranslation("vendorPayments");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayIso());
  const [method, setMethod] = useState<OutsidePaymentMethod>("cash");
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [list, setList] = useState<OutsidePayment[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadList() {
    setLoadingList(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_outside_payments")
      .select("id, amount_cents, received_on, method, client_name, note")
      .order("received_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    setList((data ?? []) as OutsidePayment[]);
    setLoadingList(false);
  }

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReceivedOn(todayIso());
    setMethod("cash");
    setClientName("");
    setNote("");
    setAmountError(false);
    void loadList();
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (cents === null) {
      setAmountError(true);
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_outside_payments").insert({
      amount_cents: cents,
      received_on: receivedOn || todayIso(),
      method,
      client_name: clientName.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(t("outside.save_failed"));
      return;
    }
    toast.success(t("outside.saved", { amount: formatMoney(cents) }));
    setAmount("");
    setClientName("");
    setNote("");
    setAmountError(false);
    void loadList();
    onChanged();
  }

  async function remove(p: OutsidePayment) {
    setDeletingId(p.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_outside_payments").delete().eq("id", p.id);
    setDeletingId(null);
    if (error) {
      toast.error(t("outside.delete_failed"));
      return;
    }
    setList((l) => l.filter((x) => x.id !== p.id));
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-editorial text-xl">{t("outside.title")}</DialogTitle>
          <DialogDescription>{t("outside.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <Label htmlFor="op-amount">{t("outside.amount")}</Label>
              <Input
                id="op-amount"
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
              <Label htmlFor="op-date">{t("outside.date")}</Label>
              <Input
                id="op-date"
                type="date"
                max={todayIso()}
                value={receivedOn}
                onChange={(e) => setReceivedOn(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>{t("outside.method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as OutsidePaymentMethod)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTSIDE_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`outside.methods.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="op-client">{t("outside.client")}</Label>
            <Input
              id="op-client"
              maxLength={120}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t("outside.client_placeholder")}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="op-note">{t("outside.note")}</Label>
            <Textarea
              id="op-note"
              maxLength={500}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("outside.note_placeholder")}
              className="mt-1.5"
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {t("outside.save")}
          </Button>
        </form>

        <div className="mt-2 border-t border-border pt-4">
          <p className="font-label m-0 text-accent">{t("outside.recorded")}</p>
          {loadingList ? (
            <div className="py-4 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("outside.none")}</p>
          ) : (
            <ul className="m-0 mt-2 p-0 list-none divide-y divide-border">
              {list.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">
                      {formatMoney(p.amount_cents)}
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        {t(`outside.methods.${p.method}`)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatReceivedOn(p.received_on)}
                      {p.client_name ? ` · ${p.client_name}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(p)}
                    disabled={deletingId === p.id}
                    aria-label={t("outside.delete")}
                    className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                  >
                    {deletingId === p.id ? (
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
