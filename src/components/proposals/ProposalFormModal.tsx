import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proposalsTable = () => (supabase as any).from("proposals");

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Proposal title is required");
      return;
    }
    const validItems = items.filter(
      (it) => it.description.trim() && it.unit_price,
    );
    if (validItems.length === 0) {
      toast.error("Add at least one line item");
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
    });

    if (!error) {
      // Move the inquiry to 'replied' so the pipeline reflects vendor activity
      await supabase
        .from("inquiries")
        .update({ status: "replied" })
        .eq("id", inquiryId)
        .in("status", ["new", "drafted"]);
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
          <DialogTitle className="font-display text-2xl">Send a proposal</DialogTitle>
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
            />
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
            <p className="font-display text-2xl tnum">
              ${(subtotalCents / 100).toLocaleString()}
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
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send proposal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
