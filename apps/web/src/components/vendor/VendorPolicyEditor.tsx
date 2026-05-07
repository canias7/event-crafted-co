import { useEffect, useRef, useState } from "react";
import { ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
// VendorPolicyBadges on the public profile. The inline "Save terms"
// button is gone now — fields auto-persist 600ms after the last
// change so the listing builder only needs the global Save / Publish
// buttons in the header.

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
  const [depositPct, setDepositPct] = useState("");
  const [cancellation, setCancellation] = useState<string>(NONE);
  const [rescheduleWindow, setRescheduleWindow] = useState("");
  const [notes, setNotes] = useState("");
  // True once the initial load has populated state. The auto-save
  // useEffect waits for this to flip before firing, so the load
  // itself doesn't trigger a redundant write.
  const hydrated = useRef(false);

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
    // Wait one paint tick before flipping the hydrated guard so the
    // controlled-input setters above don't fire the auto-save.
    requestAnimationFrame(() => {
      hydrated.current = true;
    });
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  // Debounced auto-save — fires 600ms after the last change so we
  // don't spam writes while the vendor is still typing.
  useEffect(() => {
    if (!canEdit || !hydrated.current || !vendorId) return;
    const handle = setTimeout(async () => {
      const payload = {
        deposit_pct: depositPct
          ? Math.max(0, Math.min(100, Number.parseInt(depositPct, 10)))
          : null,
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
      if (error) toast.error(error.message);
    }, 600);
    return () => clearTimeout(handle);
  }, [canEdit, vendorId, depositPct, cancellation, rescheduleWindow, notes]);

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
        <div className="space-y-3">
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
        </div>
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
