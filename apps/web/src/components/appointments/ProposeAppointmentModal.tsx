import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "consultation", label: "Consultation" },
  { value: "walkthrough", label: "Walkthrough" },
  { value: "tasting", label: "Tasting" },
  { value: "fitting", label: "Fitting" },
  { value: "phone_call", label: "Phone call" },
  { value: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Either vendorId or hostId is the OTHER party. The current user is taken
  // from useAuth and slotted in as the appropriate side.
  vendorId: string;
  hostId: string;
  inquiryId?: string;
  proposedBy: "host" | "vendor";
  onSuccess?: () => void;
}

function defaultDateTime() {
  // Default to tomorrow 10am local time, formatted for datetime-local input.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProposeAppointmentModal({
  open,
  onOpenChange,
  vendorId,
  hostId,
  inquiryId,
  proposedBy,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const [kind, setKind] = useState("consultation");
  const [scheduledAt, setScheduledAt] = useState(defaultDateTime());
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setKind("consultation");
      setScheduledAt(defaultDateTime());
      setDuration("60");
      setLocation("");
      setNotes("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    if (!scheduledAt) {
      toast.error("Pick a date and time");
      return;
    }
    // Block past datetimes. The datetime-local input's min attr stops
    // most clicks, but it's bypassable (typing, paste, DevTools), so
    // re-check at submit. 5 min cushion in case the user picked
    // "right now" and the page sat open.
    if (new Date(scheduledAt).getTime() < Date.now() - 5 * 60_000) {
      toast.error("Pick a future date and time.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("appointments").insert({
      vendor_id: vendorId,
      host_id: hostId,
      inquiry_id: inquiryId ?? null,
      kind,
      // datetime-local is local time without a TZ; let the browser convert to ISO
      // so we send proper UTC to Postgres.
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_minutes: Number.parseInt(duration, 10) || 60,
      location: location.trim() || null,
      notes: notes.trim() || null,
      proposed_by: proposedBy,
      status: "proposed",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Appointment proposed");
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Propose a meeting
          </DialogTitle>
          <DialogDescription className="text-sm">
            {proposedBy === "vendor"
              ? "Suggest a time to meet — the host will accept or decline."
              : "Suggest a time to meet — the vendor will accept or decline."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kind">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                min="15"
                step="15"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="when">When</Label>
            <Input
              id="when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              // Browser-level guard — submit() also re-checks since
              // min on datetime-local is bypassable.
              min={(() => {
                const d = new Date();
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                return d.toISOString().slice(0, 16);
              })()}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="Address, Zoom link, or phone number"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Anything to prepare or bring."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
              Send proposal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
