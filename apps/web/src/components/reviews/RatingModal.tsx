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
// Edit mode: when `editing` is set, the modal calls the
// update_review RPC instead of insert. The RPC enforces a 10-minute
// window from the row's original created_at — typo territory only.
//
// Errors from the gate triggers and the edit RPC surface as toasts
// using the machine-readable reason strings raised server-side.

import { useEffect, useState } from "react";
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
    "Event reviews open after both sides confirm the booking — or once a proposal is accepted.",
  event_too_recent:
    "Hold off until 3 days after the event so the dust settles.",
  no_event_date:
    "Set an event date on the inquiry first.",
  not_authorized: "You're not allowed to review this inquiry.",
  host_mismatch: "Inquiry mismatch — refresh and try again.",
  vendor_mismatch: "Inquiry mismatch — refresh and try again.",
  edit_window_expired:
    "Edits are only allowed in the first 10 minutes after submission.",
  invalid_rating: "Pick a star count between 1 and 5.",
  not_found: "Review not found — it may have been removed.",
};

interface EditingReview {
  id: string;
  rating: number;
  body: string | null;
}

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
  /** When set, the modal edits this existing review via update_review
   *  RPC instead of inserting a new one. The 10-min window is
   *  enforced server-side. */
  editing?: EditingReview;
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
  editing,
}: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEvent = kind === "event";
  const isEditing = !!editing;

  // Prefill when entering edit mode, reset on close.
  useEffect(() => {
    if (open && editing) {
      setRating(editing.rating);
      setBody(editing.body ?? "");
    } else if (!open) {
      setRating(0);
      setBody("");
      setHovered(0);
    }
  }, [open, editing]);

  async function submit() {
    if (rating < 1) {
      toast.error("Tap a star first.");
      return;
    }
    setSubmitting(true);
    const trimmedBody = body.trim();
    let errorCode: string | null = null;
    if (editing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("update_review", {
        p_id: editing.id,
        p_rating: rating,
        p_body: trimmedBody,
        p_photo_urls: null,
      });
      if (error) errorCode = error.message;
    } else {
      const { error } = await supabase.from("reviews").insert({
        inquiry_id: inquiryId,
        vendor_id: vendorId,
        host_id: hostId,
        rating,
        body: trimmedBody || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kind,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rater_role: raterRole,
      } as never);
      if (error) errorCode = error.message;
    }
    setSubmitting(false);
    if (errorCode) {
      toast.error(ERROR_LABELS[errorCode] ?? errorCode);
      return;
    }
    toast.success(
      isEditing
        ? "Review updated."
        : isEvent
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
            {isEditing
              ? isEvent
                ? "Edit your event review"
                : "Edit your conversation rating"
              : isEvent
                ? `How was your event with ${otherPartyName}?`
                : `Rate ${otherPartyName}'s communication`}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Edits are only allowed in the first 10 minutes after submission."
              : isEvent
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
            {isEditing ? "Save edit" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
