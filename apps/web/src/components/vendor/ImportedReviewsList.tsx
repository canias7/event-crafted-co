import { Star } from "lucide-react";
import { formatDate } from "@/lib/format";

// Display block for "reviews from elsewhere" — third-party imports the
// vendor brought across (Google, Yelp, etc.). Read-only; the vendor
// manages the underlying records via ImportedReviewsManager on their
// dashboard. Hidden when there are no imports.

export interface ImportedReview {
  id: string;
  source: string;
  reviewer_name: string;
  rating: number;
  body: string | null;
  reviewed_at: string | null;
}

interface Props {
  reviews: ImportedReview[];
  vendorName: string;
}

export function ImportedReviewsList({ reviews, vendorName }: Props) {
  if (reviews.length === 0) return null;
  return (
    <div>
      <p className="font-label text-accent mb-4">From around the web</p>
      <h2 className="font-editorial text-4xl mb-2">Reviews from elsewhere</h2>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-xl">
        Imported by {vendorName} from other platforms. Not booked through
        Vendora — but still part of their track record.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {reviews.map((r) => (
          <div
            key={r.id}
            className="rounded-sm border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
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
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                via {r.source.replace("_", " ")}
              </span>
            </div>
            {r.body && (
              <p className="text-sm text-foreground/80 leading-relaxed mb-2 italic line-clamp-4">
                "{r.body}"
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              — {r.reviewer_name}
              {r.reviewed_at && ` · ${formatDate(r.reviewed_at, "short")}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
