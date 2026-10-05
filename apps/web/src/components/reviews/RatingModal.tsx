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
import { useTranslation } from "react-i18next";
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

// Reason codes raised server-side, with friendly copy in reviews.json
// (errors.<code>); anything else shows the raw message.
const ERROR_CODES = [
  "min_messages_required",
  "no_accepted_proposal",
  "event_too_recent",
  "no_event_date",
  "not_authorized",
  "host_mismatch",
  "vendor_mismatch",
  "edit_window_expired",
  "invalid_rating",
  "not_found",
];

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
  const { t } = useTranslation("reviews");
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
      toast.error(t("modal.toasts.tapStar"));
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
      toast.error(
        ERROR_CODES.includes(errorCode) ? t(`errors.${errorCode}`) : errorCode,
      );
      return;
    }
    toast.success(
      isEditing
        ? t("modal.toasts.updated")
        : isEvent
          ? t("modal.toasts.eventSubmitted")
          : t("modal.toasts.conversationSubmitted"),
    );
    setRating(0);
    setBody("");
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">
            {isEditing
              ? isEvent
                ? t("modal.editEventTitle")
                : t("modal.editConversationTitle")
              : isEvent
                ? t("eventPrompt", { name: otherPartyName })
                : t("conversationPrompt", { name: otherPartyName })}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("modal.editDescription")
              : isEvent
                ? t("modal.eventDescription")
                : t("modal.conversationDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="flex items-center justify-center gap-1.5 py-2"
            role="radiogroup"
            aria-label={t("modal.starRating")}
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const lit = (hovered || rating) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={t("modal.stars", { count: n })}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(n)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                      e.preventDefault();
                      setRating(Math.min(5, (rating || 0) + 1));
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                      e.preventDefault();
                      setRating(Math.max(1, (rating || n) - 1));
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      setRating(1);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      setRating(5);
                    }
                  }}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
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
              {isEvent ? t("modal.eventLabel") : t("modal.conversationLabel")}
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={
                isEvent
                  ? t("modal.eventPlaceholder")
                  : t("modal.conversationPlaceholder")
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
            {t("modal.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || rating < 1}
            className="rounded-full"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? t("modal.saveEdit") : t("modal.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
