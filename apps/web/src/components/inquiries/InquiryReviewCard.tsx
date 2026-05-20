import { useEffect, useState } from "react";
import { Star, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

// Mirror of the WITH CHECK clause on review_responses UPDATE:
// `created_at > now() - interval '10 minutes'`. Keep in sync with
// 20260521130000_reviews_audit_r4.sql.
const EDIT_WINDOW_MS = 10 * 60 * 1000;

// Review card on an inquiry detail page. Shows a rating + body left
// by the counterparty, and lets the subject post or edit a public
// response. Used on both sides:
//   • vendor side — responding to host's event review (responderRole='vendor')
//   • host side  — responding to vendor's rating of them (responderRole='host')
//
// Manages its own form state so the parent only has to pass the
// review + an onChange callback for refreshing.

export interface ReviewWithResponse {
  id: string;
  vendor_id: string;
  rating: number;
  body: string | null;
  kind?: "conversation" | "event";
  created_at: string;
  response: {
    body: string;
    /** Anchors the 10-minute edit window — pulled from review_responses.created_at. */
    created_at: string;
    updated_at: string;
  } | null;
}

interface Props {
  review: ReviewWithResponse;
  /** The party writing the response — vendor responding to host's
   *  review, or host responding to vendor's rating. RLS gates which
   *  combinations are allowed; the prop drives labels + insert shape. */
  responderRole?: "host" | "vendor";
  onResponseSaved: () => void;
}

export function InquiryReviewCard({
  review,
  responderRole = "vendor",
  onResponseSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.response?.body ?? "");
  const [saving, setSaving] = useState(false);
  // Refresh every 30s so the "Edit (Nm left)" countdown stays current.
  // Only ticks while a response exists and the window is potentially
  // still open — otherwise there's nothing to update.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!review.response) return;
    const created = new Date(review.response.created_at).getTime();
    const expiresAt = created + EDIT_WINDOW_MS;
    if (Date.now() >= expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [review.response]);

  const editMsLeft = review.response
    ? new Date(review.response.created_at).getTime() + EDIT_WINDOW_MS - now
    : 0;
  const canEdit = editMsLeft > 0;
  const minsLeft = Math.max(1, Math.ceil(editMsLeft / 60_000));

  const incomingLabel =
    responderRole === "vendor"
      ? "Host review"
      : review.kind === "conversation"
        ? "Vendor's chat rating"
        : "Vendor's review";

  async function save() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    const tbl = supabase.from("review_responses");
    const { error } = review.response
      ? await tbl.update({ body: draft.trim() }).eq("review_id", review.id)
      : await tbl.insert({
          review_id: review.id,
          // vendor_id is nullable post-migration — host responses
          // leave it null. responder_user_id is set by trigger.
          vendor_id: responderRole === "vendor" ? review.vendor_id : null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responder_role: responderRole,
          body: draft.trim(),
        } as never);
    setSaving(false);
    if (error) {
      // RLS denies the UPDATE once review_responses.created_at falls
      // outside the 10-minute window. Catch that case and surface
      // friendly copy instead of the raw "violates row-level security
      // policy" string. Bail out of editing so the stale form doesn't
      // sit there inviting another doomed click.
      if (/row-level security/i.test(error.message)) {
        toast.error(
          review.response
            ? "Edit window closed — responses can only be edited within 10 minutes."
            : "You're no longer allowed to respond to this review.",
        );
        setEditing(false);
        onResponseSaved();
        return;
      }
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
          <p className="font-label text-muted-foreground">{incomingLabel}</p>
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
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={() => {
                    setDraft(review.response?.body ?? "");
                    setEditing(true);
                  }}
                >
                  Edit ({minsLeft}m left)
                </Button>
              ) : (
                <span className="text-[10px] text-muted-foreground/70">
                  Edit window closed
                </span>
              )}
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
