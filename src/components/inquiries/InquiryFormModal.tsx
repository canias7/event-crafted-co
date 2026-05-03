import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

interface VendorOption {
  id: string;
  business_name: string;
  category: string;
}

interface InquiryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a vendor by business_name match (case-insensitive). */
  preferredVendorName?: string;
  /** Called after a successful insert with the new inquiry id. */
  onSuccess?: (inquiryId: string) => void;
}

const eventTypes: Array<{ value: EventType; label: string }> = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "other", label: "Other" },
];

export function InquiryFormModal({
  open,
  onOpenChange,
  preferredVendorName,
  onSuccess,
}: InquiryFormModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  const [vendorId, setVendorId] = useState<string>("");
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [location, setLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  function reset() {
    setVendorId("");
    setEventType("wedding");
    setEventDate("");
    setGuestCount("");
    setLocation("");
    setBudgetMin("");
    setBudgetMax("");
    setSpecialRequests("");
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setVendorsLoading(true);
    supabase
      .from("vendor_profiles")
      .select("id, business_name, category")
      .order("business_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(`Couldn't load vendors: ${error.message}`);
          setVendors([]);
        } else {
          const list = (data ?? []) as VendorOption[];
          setVendors(list);
          if (preferredVendorName && !vendorId) {
            const match = list.find(
              (v) =>
                v.business_name.toLowerCase() ===
                preferredVendorName.toLowerCase(),
            );
            if (match) setVendorId(match.id);
          }
        }
        setVendorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preferredVendorName]);

  // Refresh the unavailable-vendor set whenever the chosen event date changes
  // so we can disable booked vendors in the dropdown.
  useEffect(() => {
    if (!open || !eventDate) {
      setUnavailableIds(new Set());
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("vendor_unavailable_dates")
      .select("vendor_id")
      .eq("date", eventDate)
      .then(({ data }: { data: Array<{ vendor_id: string }> | null }) => {
        if (cancelled) return;
        setUnavailableIds(new Set((data ?? []).map((r) => r.vendor_id)));
      });
    return () => {
      cancelled = true;
    };
  }, [open, eventDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    if (!vendorId) {
      toast.error("Please choose a vendor");
      return;
    }

    const guestCountNum = guestCount ? Number.parseInt(guestCount, 10) : null;
    const minCents = budgetMin ? Math.round(Number.parseFloat(budgetMin) * 100) : null;
    const maxCents = budgetMax ? Math.round(Number.parseFloat(budgetMax) * 100) : null;

    if (minCents != null && maxCents != null && minCents > maxCents) {
      toast.error("Budget min must be less than budget max");
      return;
    }

    if (eventDate && unavailableIds.has(vendorId)) {
      toast.error("That vendor isn't available on the date you picked.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase
      .from("inquiries")
      .insert({
        host_id: user.id,
        vendor_id: vendorId,
        event_type: eventType,
        event_date: eventDate || null,
        guest_count: guestCountNum,
        location: location.trim() || null,
        budget_min_cents: minCents,
        budget_max_cents: maxCents,
        special_requests: specialRequests.trim() || null,
        status: "new",
      })
      .select("id")
      .single();
    setSubmitting(false);

    if (error) {
      toast.error(`Couldn't send inquiry: ${error.message}`);
      return;
    }

    toast.success("Inquiry sent — vendor will reply soon");
    onSuccess?.(data.id);
    reset();
    onOpenChange(false);
    navigate("/customer/inquiries");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Send an inquiry</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs leading-relaxed pt-1">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Vendors typically reply within 3 hours via AI-assisted drafts.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Vendor */}
          <div className="space-y-2">
            <Label htmlFor="vendor">
              Vendor <span className="text-destructive">*</span>
            </Label>
            {vendorsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : vendors.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-border rounded-md p-3 bg-secondary/40">
                No vendors are accepting inquiries yet. We're onboarding new
                vendors weekly — check back soon.
              </div>
            ) : (
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="vendor" className="h-10">
                  <SelectValue placeholder="Choose a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => {
                    const blocked = unavailableIds.has(v.id);
                    return (
                      <SelectItem
                        key={v.id}
                        value={v.id}
                        disabled={blocked}
                      >
                        {v.business_name}{" "}
                        <span className="text-muted-foreground">
                          · {v.category}
                        </span>
                        {blocked && (
                          <span className="ml-2 text-xs text-destructive">
                            (booked that day)
                          </span>
                        )}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Event type */}
          <div className="space-y-2">
            <Label htmlFor="event-type">
              Event type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={eventType}
              onValueChange={(v) => setEventType(v as EventType)}
            >
              <SelectTrigger id="event-type" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date + guests */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="event-date">Event date</Label>
              <Input
                id="event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-count">Guest count</Label>
              <Input
                id="guest-count"
                type="number"
                inputMode="numeric"
                min="1"
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                placeholder="120"
                className="h-10"
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, neighborhood, or venue name"
              className="h-10"
            />
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label>Budget range</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="100"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="Min"
                  className="h-10 pl-7"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="100"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="Max"
                  className="h-10 pl-7"
                />
              </div>
            </div>
          </div>

          {/* Special requests */}
          <div className="space-y-2">
            <Label htmlFor="special-requests">
              Tell us about your event
            </Label>
            <Textarea
              id="special-requests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={4}
              placeholder="Color palette, vibe, must-haves, anything else the vendor should know."
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
              disabled={submitting || vendorsLoading || !vendorId}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send inquiry"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
