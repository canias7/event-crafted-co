import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { formatCents } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const proposalsTable = () => supabase.from("proposals");

interface LineItem {
  description: string;
  quantity: number;
  unit_price: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: string;
  vendorId: string;
  hostId: string;
  defaultTitle?: string;
  onSuccess?: () => void;
}

const blank: LineItem = { description: "", quantity: 1, unit_price: "" };

export function ProposalFormModal({
  open,
  onOpenChange,
  inquiryId,
  vendorId,
  hostId,
  defaultTitle,
  onSuccess,
}: Props) {
  const [title, setTitle] = useState(defaultTitle ?? "Event proposal");
  const [items, setItems] = useState<LineItem[]>([{ ...blank }]);
  const [deposit, setDeposit] = useState("");
  const [terms, setTerms] = useState(
    "50% deposit due on signing. Balance due 14 days before event. Cancellations within 60 days forfeit deposit.",
  );
  const [submitting, setSubmitting] = useState(false);
  const [contractTemplateId, setContractTemplateId] = useState<string | null>(
    null,
  );
  const [contractBody, setContractBody] = useState<string | null>(null);
  const [contractName, setContractName] = useState<string | null>(null);
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; body: string; is_default: boolean }>
  >([]);

  // Pull this vendor's contract templates so we can attach the default
  // automatically and let the vendor swap in another via a select.
  useEffect(() => {
    if (!open || !vendorId) return;
    let cancelled = false;
    supabase
      .from("vendor_contract_templates")
      .select("id, name, body, is_default")
      .eq("vendor_id", vendorId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        const list = data ?? [];
        setTemplates(list);
        const def = list.find((t) => t.is_default);
        if (def) {
          setContractTemplateId(def.id);
          setContractBody(def.body);
          setContractName(def.name);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, vendorId]);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...blank }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotalCents = items.reduce((sum, it) => {
    const unit = Number.parseFloat(it.unit_price) * 100;
    if (Number.isNaN(unit)) return sum;
    return sum + Math.round(unit) * (it.quantity || 1);
  }, 0);

  const validItems = items.filter(
    (it) => it.description.trim() && it.unit_price,
  );
  const titleValid = title.trim().length > 0;
  const formValid = titleValid && validItems.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    // The quantity input has min="1" but that's only a client-side
    // hint — direct typing / paste / DevTools can land 0 or a huge
    // value. Re-check at submit so we don't post invalid line items.
    const badQuantity = validItems.find(
      (it) => it.quantity < 1 || it.quantity > 9999,
    );
    if (badQuantity) {
      toast.error("Quantity on each line must be between 1 and 9999.");
      return;
    }

    const lineItems = validItems.map((it) => ({
      description: it.description.trim(),
      quantity: it.quantity || 1,
      unit_price_cents: Math.round(Number.parseFloat(it.unit_price) * 100),
      amount_cents:
        Math.round(Number.parseFloat(it.unit_price) * 100) * (it.quantity || 1),
    }));

    const subtotal = lineItems.reduce((s, it) => s + it.amount_cents, 0);

    setSubmitting(true);
    const { error } = await proposalsTable().insert({
      inquiry_id: inquiryId,
      vendor_id: vendorId,
      host_id: hostId,
      title: title.trim(),
      line_items: lineItems,
      subtotal_cents: subtotal,
      deposit_cents: deposit
        ? Math.round(Number.parseFloat(deposit) * 100)
        : null,
      terms: terms.trim() || null,
      contract_template_id: contractTemplateId,
      contract_body: contractBody,
    });

    if (!error) {
      // Move the inquiry to 'replied' so the pipeline reflects vendor activity.
      // Failure is non-fatal — the proposal already landed; we just log so the
      // pipeline drift would surface in Sentry instead of disappearing.
      const { error: statusErr } = await supabase
        .from("inquiries")
        .update({ status: "replied" })
        .eq("id", inquiryId)
        .in("status", ["new", "drafted"]);
      if (statusErr) {
        console.error(
          "[Proposal] inquiry status flip failed",
          statusErr.message,
        );
      }
    }

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Proposal sent");
    setItems([{ ...blank }]);
    setDeposit("");
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">Send a proposal</DialogTitle>
          <DialogDescription className="text-sm">
            Builds a structured quote with line items, subtotal, and terms.
            The host will see Accept / Decline buttons.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label htmlFor="prop-title">Proposal title</Label>
            <Input
              id="prop-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10"
              required
              aria-invalid={!titleValid && title.length > 0 || undefined}
            />
            {!titleValid && title.length > 0 && (
              <FieldError>Proposal title is required.</FieldError>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addItem}
                className="rounded-full h-8 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add line
              </Button>
            </div>

            {validItems.length === 0 && (
              <FieldError>
                Add at least one line item with a description and price.
              </FieldError>
            )}

            <div className="space-y-2">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-start"
                >
                  <Input
                    value={item.description}
                    onChange={(e) =>
                      updateItem(i, { description: e.target.value })
                    }
                    placeholder="Description"
                    className="col-span-6 h-10"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(i, {
                        quantity: Number.parseInt(e.target.value) || 1,
                      })
                    }
                    placeholder="Qty"
                    className="col-span-2 h-10"
                  />
                  <div className="col-span-3 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) =>
                        updateItem(i, { unit_price: e.target.value })
                      }
                      placeholder="Unit price"
                      className="h-10 pl-7"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-1 h-10 w-10 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(i)}
                    aria-label="Remove line"
                    disabled={items.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-sm border border-border bg-secondary/40 p-4 flex items-center justify-between">
            <p className="font-label text-muted-foreground">Subtotal</p>
            <p className="font-editorial text-3xl tnum">
              {formatCents(subtotalCents)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prop-deposit">Deposit ($)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="prop-deposit"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="Optional"
                className="h-10 pl-7"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prop-terms">Terms</Label>
            <Textarea
              id="prop-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              placeholder="Deposit timing, cancellation policy, anything legal."
            />
          </div>

          {templates.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="prop-contract">Attach contract (optional)</Label>
              <select
                id="prop-contract"
                value={contractTemplateId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setContractTemplateId(id);
                  if (!id) {
                    setContractBody(null);
                    setContractName(null);
                  } else {
                    const t = templates.find((x) => x.id === id);
                    setContractBody(t?.body ?? null);
                    setContractName(t?.name ?? null);
                  }
                }}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">— No contract attached —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {contractName && (
                <p className="text-xs text-muted-foreground">
                  The host will see "{contractName}" alongside this proposal.
                  Edits to the template later won't change what's already sent.
                </p>
              )}
            </div>
          )}

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
              disabled={submitting || !formValid}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send proposal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
