import { useState } from "react";
import { Star, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

// Vendor-side review card on the inquiry detail page. Shows the host's
// rating + body, and lets the vendor post or edit a public response.
// Manages its own form state so the parent only has to pass the review
// + an onChange callback for refreshing.

export interface ReviewWithResponse {
  id: string;
  vendor_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  response: { body: string; updated_at: string } | null;
}

interface Props {
  review: ReviewWithResponse;
  onResponseSaved: () => void;
}

export function InquiryReviewCard({ review, onResponseSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.response?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    const tbl = supabase.from("review_responses");
    const { error } = review.response
      ? await tbl.update({ body: draft.trim() }).eq("review_id", review.id)
      : await tbl.insert({
          review_id: review.id,
          vendor_id: review.vendor_id,
          body: draft.trim(),
        });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Response saved");
    setEditing(false);
    onResponseSaved();
  }

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="font-label text-muted-foreground">Host review</p>
          <span className="text-xs text-muted-foreground tnum">
            {formatDate(review.created_at, "short")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${
                i < review.rating
                  ? "fill-accent text-accent"
                  : "text-muted-foreground/30"
              }`}
            />
          ))}
          <span className="ml-1.5 text-sm font-medium tnum">
            {review.rating}
          </span>
        </div>
      </div>
      {review.body ? (
        <p className="text-sm leading-relaxed text-foreground/85">
          "{review.body}"
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No written feedback.
        </p>
      )}

      <div className="mt-5 pt-5 border-t border-border">
        {review.response && !editing ? (
          <>
            <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
              <p className="font-label text-accent flex items-center gap-1.5">
                <MessageCircle className="w-3 h-3" />
                Your response
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => {
                  setDraft(review.response?.body ?? "");
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85">
              {review.response.body}
            </p>
          </>
        ) : (
          <>
            <p className="font-label text-muted-foreground mb-2">
              {review.response ? "Edit your response" : "Respond"}
            </p>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Thanks for the kind words…"
            />
            <div className="flex justify-end gap-2 mt-2">
              {review.response && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setEditing(false);
                    setDraft(review.response?.body ?? "");
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={save}
                disabled={saving || !draft.trim()}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Saving…
                  </>
                ) : review.response ? (
                  "Save"
                ) : (
                  "Post response"
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
