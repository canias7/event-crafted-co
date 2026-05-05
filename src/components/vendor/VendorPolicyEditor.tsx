import { useEffect, useState } from "react";
import { Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
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
import { VendorPolicyBadges } from "./VendorPolicyBadges";

// Vendor-side editor for the booking-terms surfaced as
// VendorPolicyBadges on the public profile. Loads + saves its own
// row slice so it can drop next to other manager cards without
// touching the parent profile page's giant form.

interface PolicyRow {
  deposit_pct: number | null;
  cancellation_policy: string | null;
  reschedule_window_days: number | null;
  policy_notes: string | null;
}

const NONE = "__none__";

export function VendorPolicyEditor({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [depositPct, setDepositPct] = useState("");
  const [cancellation, setCancellation] = useState<string>(NONE);
  const [rescheduleWindow, setRescheduleWindow] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_profiles")
      .select(
        "deposit_pct, cancellation_policy, reschedule_window_days, policy_notes",
      )
      .eq("id", vendorId)
      .single();
    const row = (data as PolicyRow | null) ?? null;
    setDepositPct(row?.deposit_pct != null ? String(row.deposit_pct) : "");
    setCancellation(row?.cancellation_policy ?? NONE);
    setRescheduleWindow(
      row?.reschedule_window_days != null
        ? String(row.reschedule_window_days)
        : "",
    );
    setNotes(row?.policy_notes ?? "");
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      deposit_pct: depositPct ? Math.max(0, Math.min(100, Number.parseInt(depositPct, 10))) : null,
      cancellation_policy: cancellation === NONE ? null : cancellation,
      reschedule_window_days: rescheduleWindow
        ? Math.max(0, Number.parseInt(rescheduleWindow, 10))
        : null,
      policy_notes: notes.trim() || null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update(payload)
      .eq("id", vendorId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground py-3">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-3">
        <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
          <ShieldOff className="w-3 h-3" />
          Booking terms
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Show hosts your deposit + cancellation policy upfront. Builds
          trust and cuts down on inquiries that aren't a fit.
        </p>
      </div>

      {canEdit ? (
        <form onSubmit={save} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-deposit">Deposit (%)</Label>
              <Input
                id="p-deposit"
                type="number"
                min={0}
                max={100}
                value={depositPct}
                onChange={(e) => setDepositPct(e.target.value)}
                placeholder="25"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-resched">Reschedule window (days)</Label>
              <Input
                id="p-resched"
                type="number"
                min={0}
                value={rescheduleWindow}
                onChange={(e) => setRescheduleWindow(e.target.value)}
                placeholder="30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-cancel">Cancellation policy</Label>
            <Select value={cancellation} onValueChange={setCancellation}>
              <SelectTrigger id="p-cancel">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                <SelectItem value="flexible">
                  Flexible — full refund 30+ days out
                </SelectItem>
                <SelectItem value="moderate">
                  Moderate — partial refund 30+ days out
                </SelectItem>
                <SelectItem value="strict">
                  Strict — non-refundable deposit, balance refundable
                </SelectItem>
                <SelectItem value="non_refundable">
                  Non-refundable — nothing returned
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-notes">Extra context (optional)</Label>
            <Textarea
              id="p-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything specific to call out — date changes, force majeure, etc."
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save terms
            </Button>
          </div>
        </form>
      ) : (
        <VendorPolicyBadges
          depositPct={depositPct ? Number.parseInt(depositPct, 10) : null}
          cancellationPolicy={cancellation === NONE ? null : cancellation}
          rescheduleWindowDays={
            rescheduleWindow ? Number.parseInt(rescheduleWindow, 10) : null
          }
          policyNotes={notes || null}
        />
      )}
    </div>
  );
}
