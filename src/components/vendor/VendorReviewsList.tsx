import { Star } from "lucide-react";

// Review block on the vendor detail page. Falls back to a curated
// `samples` list when there are no real reviews yet — gives newer
// vendors a polished page until their first booking review lands.

export interface RealReview {
  id: string;
  rating: number;
  body: string | null;
  photo_urls: string[] | null;
  created_at: string;
  host: { display_name: string | null } | null;
  response: { body: string } | null;
  inquiry: { event_type: string; event_date: string | null } | null;
}

export interface SampleReview {
  name: string;
  event: string;
  rating: number;
  text: string;
}

interface Props {
  realReviews: RealReview[];
  samples: SampleReview[];
  averageRating: number;
  totalCount: number;
  vendorName: string;
}

function StarRow({ rating, total = 5 }: { rating: number; total?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < Math.round(rating)
              ? "fill-accent text-accent"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export function VendorReviewsList({
  realReviews,
  samples,
  averageRating,
  totalCount,
  vendorName,
}: Props) {
  return (
    <div>
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="font-label text-accent mb-4">Reviews</p>
          <h2 className="font-display text-3xl">
            <span className="tnum">{averageRating.toFixed(1)}</span>{" "}
            <span className="text-muted-foreground font-light">·</span>{" "}
            <span className="text-muted-foreground font-light tnum">
              {totalCount} {totalCount === 1 ? "review" : "reviews"}
            </span>
          </h2>
        </div>
        <StarRow rating={averageRating} />
      </div>
      <div className="space-y-8">
        {realReviews.length > 0
          ? realReviews.map((r) => (
              <div
                key={r.id}
                className="border-t border-border pt-8 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: r.rating }).map((_, j) => (
                    <Star
                      key={j}
                      className="w-3.5 h-3.5 fill-accent text-accent"
                    />
                  ))}
                </div>
                {r.body && (
                  <p className="text-foreground/85 leading-relaxed mb-4">
                    "{r.body}"
                  </p>
                )}
                {r.photo_urls && r.photo_urls.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {r.photo_urls.map((url, i) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="aspect-square rounded-sm overflow-hidden bg-muted block hover:opacity-80 transition-opacity"
                      >
                        <img
                          src={url}
                          alt={`Photo ${i + 1} from ${r.host?.display_name ?? "host"}'s review`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">
                    {r.host?.display_name ?? "Anonymous host"}
                  </p>
                  {r.inquiry && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {r.inquiry.event_type.replace("_", " ")}
                      {r.inquiry.event_date && (
                        <>
                          {" · "}
                          <span className="tnum">{r.inquiry.event_date}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
                {r.response && (
                  <div className="mt-4 ml-6 pl-4 border-l-2 border-accent/40">
                    <p className="font-label text-accent mb-1.5">
                      Response from {vendorName}
                    </p>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {r.response.body}
                    </p>
                  </div>
                )}
              </div>
            ))
          : samples.map((r, i) => (
              <div
                key={i}
                className="border-t border-border pt-8 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: r.rating }).map((_, j) => (
                    <Star
                      key={j}
                      className="w-3.5 h-3.5 fill-accent text-accent"
                    />
                  ))}
                </div>
                <p className="text-foreground/85 leading-relaxed mb-4">
                  "{r.text}"
                </p>
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.event}</p>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
