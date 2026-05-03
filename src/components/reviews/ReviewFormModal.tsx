import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
const reviewsTable = () => (supabase as any).from("reviews");

interface ExistingReview {
  id: string;
  rating: number;
  body: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: string;
  vendorId: string;
  hostId: string;
  vendorName: string;
  existingReview?: ExistingReview | null;
  onSuccess?: () => void;
}

export function ReviewFormModal({
  open,
  onOpenChange,
  inquiryId,
  vendorId,
  hostId,
  vendorName,
  existingReview,
  onSuccess,
}: Props) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(existingReview?.rating ?? 0);
      setBody(existingReview?.body ?? "");
    }
  }, [open, existingReview]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      toast.error("Please pick a star rating");
      return;
    }

    setSubmitting(true);
    const payload = {
      inquiry_id: inquiryId,
      vendor_id: vendorId,
      host_id: hostId,
      rating,
      body: body.trim() || null,
    };

    const { error } = existingReview
      ? await reviewsTable()
          .update({ rating, body: body.trim() || null })
          .eq("id", existingReview.id)
      : await reviewsTable().insert(payload);

    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(existingReview ? "Review updated" : "Review posted");
    onSuccess?.();
    onOpenChange(false);
  }

  const displayed = hoverRating || rating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {existingReview ? "Edit your review" : `Review ${vendorName}`}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed pt-1">
            Reviews are public and help future hosts choose with confidence.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label>Your rating</Label>
            <div
              className="flex gap-1"
              onMouseLeave={() => setHoverRating(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  className="p-1 transition-transform hover:scale-110"
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                >
                  <Star
                    className={`w-7 h-7 transition-colors ${
                      n <= displayed
                        ? "fill-accent text-accent"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-body">Your review (optional)</Label>
            <Textarea
              id="review-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="What did you love? What could've been better?"
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
              disabled={submitting || rating < 1}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {existingReview ? "Saving…" : "Posting…"}
                </>
              ) : existingReview ? (
                "Save review"
              ) : (
                "Post review"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
