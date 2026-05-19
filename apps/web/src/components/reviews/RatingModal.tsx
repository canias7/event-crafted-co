// Unified rating modal — used for both conversation ratings (Track A)
// and event reviews (Track B). Caller picks the kind + their role.
//
// Conversation rating:
//   • Released immediately, visible publicly
//   • Both sides can leave one per inquiry
//   • Gated server-side on ≥6 messages in the inquiry's thread
//
// Event review:
//   • Mutual blind reveal — neither side sees the other's until
//     both submit, or 14 days pass after the first submission
//   • Gated server-side on (accepted proposal exists) + (event_date
//     passed > 3 days ago)
//
// Errors from the gate triggers surface as toasts using the
// machine-readable reason strings the trigger raises.

import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const ERROR_LABELS: Record<string, string> = {
  min_messages_required:
    "Chat with this vendor a bit more before leaving a rating.",
  no_accepted_proposal:
    "Event reviews are open after both parties accept a proposal.",
  event_too_recent:
    "Hold off until 3 days after the event so the dust settles.",
  no_event_date:
    "Set an event date on the inquiry first.",
  not_authorized: "You're not allowed to review this inquiry.",
  host_mismatch: "Inquiry mismatch — refresh and try again.",
  vendor_mismatch: "Inquiry mismatch — refresh and try again.",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "conversation" | "event";
  raterRole: "host" | "vendor";
  inquiryId: string;
  vendorId: string;
  hostId: string;
  otherPartyName: string;
  onSuccess?: () => void;
}

export function RatingModal({
  open,
  onOpenChange,
  kind,
  raterRole,
  inquiryId,
  vendorId,
  hostId,
  otherPartyName,
  onSuccess,
}: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEvent = kind === "event";

  async function submit() {
    if (rating < 1) {
      toast.error("Tap a star first.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("reviews").insert({
      inquiry_id: inquiryId,
      vendor_id: vendorId,
      host_id: hostId,
      rating,
      body: body.trim() || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kind,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rater_role: raterRole,
    } as never);
    setSubmitting(false);
    if (error) {
      const code = error.message;
      toast.error(ERROR_LABELS[code] ?? error.message);
      return;
    }
    toast.success(
      isEvent
        ? "Review submitted. It'll go live once the other side reviews too (or in 14 days)."
        : "Rating submitted.",
    );
    setRating(0);
    setBody("");
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">
            {isEvent
              ? `How was your event with ${otherPartyName}?`
              : `Rate ${otherPartyName}'s communication`}
          </DialogTitle>
          <DialogDescription>
            {isEvent
              ? "Your review goes live once both sides review — or after 14 days."
              : "Quick read on how this conversation went so far."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-1.5 py-2">
            {[1, 2, 3, 4, 5].map((n) => {
              const lit = (hovered || rating) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(n)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-9 h-9 ${
                      lit ? "fill-accent text-accent" : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {isEvent ? "What stood out?" : "Anything to add? (optional)"}
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={
                isEvent
                  ? "Tell other hosts what made this vendor great (or not)."
                  : "Responsive, professional, easy to work with..."
              }
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || rating < 1}
            className="rounded-full"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
