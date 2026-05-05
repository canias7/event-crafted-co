import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Star, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportedReview {
  id: string;
  source: string;
  reviewer_name: string;
  rating: number;
  body: string | null;
  reviewed_at: string | null;
}

const SOURCES: Array<{ value: string; label: string }> = [
  { value: "knot", label: "The Knot" },
  { value: "yelp", label: "Yelp" },
  { value: "google", label: "Google" },
  { value: "wedding_wire", label: "WeddingWire" },
  { value: "facebook", label: "Facebook" },
  { value: "other", label: "Other" },
];

const sourceColor: Record<string, string> = {
  knot: "bg-[#a08259]/15 text-[#a08259] border-[#a08259]/30",
  yelp: "bg-[#d32323]/10 text-[#d32323] border-[#d32323]/30",
  google: "bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/30",
  wedding_wire: "bg-[#5d3754]/10 text-[#5d3754] border-[#5d3754]/30",
  facebook: "bg-[#1877F2]/10 text-[#1877F2] border-[#1877F2]/30",
  other: "bg-secondary text-muted-foreground border-border",
};

const importedTable = () => supabase.from("imported_reviews");

export function ImportedReviewsManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [reviews, setReviews] = useState<ImportedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await importedTable()
      .select("id, source, reviewer_name, rating, body, reviewed_at")
      .eq("vendor_id", vendorId)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setReviews((data as ImportedReview[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function deleteReview(id: string) {
    setDeletingId(id);
    const { error } = await importedTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReviews((p) => p.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">
            Imported reviews
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Bring reviews from Knot / Yelp / Google so you don't start at
            zero. Marked "imported from {"{source}"}" on your profile —
            we don't claim they're verified by us.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setEditorOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Import a review
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          Loading…
        </div>
      ) : reviews.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center">
          <Sparkles className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Paste in 5-10 of your best existing reviews — your profile
            looks legit out of the gate.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-sm border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-3.5 h-3.5 ${
                          n <= Math.round(r.rating)
                            ? "fill-accent text-accent"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium tnum">
                    {r.rating.toFixed(1)}
                  </span>
                  <Badge
                    className={`text-[10px] uppercase tracking-wide ${
                      sourceColor[r.source] ?? sourceColor.other
                    }`}
                  >
                    {SOURCES.find((s) => s.value === r.source)?.label ??
                      r.source}
                  </Badge>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={deletingId === r.id}
                    onClick={() => deleteReview(r.id)}
                    aria-label="Delete imported review"
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    )}
                  </Button>
                )}
              </div>
              {r.body && (
                <p className="text-sm leading-relaxed text-foreground/85 mb-2 italic">
                  "{r.body}"
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                — {r.reviewer_name}
                {r.reviewed_at &&
                  ` · ${new Date(r.reviewed_at).toLocaleDateString()}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <Editor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          vendorId={vendorId}
          onSuccess={load}
        />
      )}
    </div>
  );
}

function Editor({
  open,
  onOpenChange,
  vendorId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendorId: string;
  onSuccess: () => void;
}) {
  const [source, setSource] = useState("google");
  const [reviewerName, setReviewerName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [reviewedAt, setReviewedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSource("google");
      setReviewerName("");
      setRating(5);
      setBody("");
      setReviewedAt("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewerName.trim()) {
      toast.error("Reviewer name is required");
      return;
    }
    setSubmitting(true);
    const { error } = await importedTable().insert({
      vendor_id: vendorId,
      source,
      reviewer_name: reviewerName.trim(),
      rating,
      body: body.trim() || null,
      reviewed_at: reviewedAt || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Review imported");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Import a review
          </DialogTitle>
          <DialogDescription>
            Paste in an existing review — we'll mark it as imported on
            your profile so hosts know it's not from a Vendora booking.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ir-source">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="ir-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ir-rating">Rating</Label>
              <Select
                value={rating.toString()}
                onValueChange={(v) => setRating(Number.parseFloat(v))}
              >
                <SelectTrigger id="ir-rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n.toFixed(1)} stars
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ir-name">Reviewer name</Label>
            <Input
              id="ir-name"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Sarah M."
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ir-body">Review text</Label>
            <Textarea
              id="ir-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste the original review here."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ir-date">Date (optional)</Label>
            <Input
              id="ir-date"
              type="date"
              value={reviewedAt}
              onChange={(e) => setReviewedAt(e.target.value)}
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
              Add review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
