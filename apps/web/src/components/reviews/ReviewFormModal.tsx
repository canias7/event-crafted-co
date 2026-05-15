import { useEffect, useRef, useState } from "react";
import { Star, Loader2, Upload, X } from "lucide-react";
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

const reviewsTable = () => supabase.from("reviews");

interface ExistingReview {
  id: string;
  rating: number;
  body: string | null;
  photo_urls?: string[];
}

const PHOTO_BUCKET = "review-photos";
const PHOTO_MAX = 4;
const PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRating(existingReview?.rating ?? 0);
      setBody(existingReview?.body ?? "");
      setPhotos(existingReview?.photo_urls ?? []);
    }
  }, [open, existingReview]);

  async function uploadPhotos(files: FileList) {
    const remaining = PHOTO_MAX - photos.length;
    if (remaining <= 0) {
      toast.error(`Up to ${PHOTO_MAX} photos`);
      return;
    }
    const accepted = Array.from(files).slice(0, remaining).filter((f) => {
      if (!PHOTO_TYPES.includes(f.type)) {
        toast.error(`${f.name}: only JPG, PNG, WEBP`);
        return false;
      }
      if (f.size > PHOTO_BYTES) {
        toast.error(`${f.name}: max 5 MB`);
        return false;
      }
      return true;
    });
    if (accepted.length === 0) return;

    setUploading(true);
    const newUrls: string[] = [];
    for (const file of accepted) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filename = `${crypto.randomUUID()}.${ext.toLowerCase()}`;
      const path = `${hostId}/${filename}`;
      const upload = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (upload.error) {
        toast.error(`${file.name}: ${upload.error.message}`);
        continue;
      }
      const { data: pub } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(path);
      newUrls.push(pub.publicUrl);
    }
    setPhotos((prev) => [...prev, ...newUrls]);
    setUploading(false);
  }

  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));
    // Best-effort storage cleanup. Skip if the URL isn't from our bucket.
    const marker = `/${PHOTO_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const path = url.slice(idx + marker.length).split("?")[0];
      supabase.storage.from(PHOTO_BUCKET).remove([path]).then(() => {});
    }
  }

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
      photo_urls: photos,
    };

    const { error } = existingReview
      ? await reviewsTable()
          .update({
            rating,
            body: body.trim() || null,
            photo_urls: photos,
          })
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
      <DialogContent className="sm:max-w-md rounded-2xl">
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Photos (optional)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading || photos.length >= PHOTO_MAX}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full h-7 text-xs"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3 mr-1" />
                    Add photos
                  </>
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={PHOTO_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {photos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Up to {PHOTO_MAX} photos · 5 MB each. JPG / PNG / WEBP.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((url) => (
                  <div
                    key={url}
                    className="relative group aspect-square rounded-sm overflow-hidden bg-muted"
                  >
                    <img
                      src={url}
                      alt="Review photo"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                      aria-label="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
