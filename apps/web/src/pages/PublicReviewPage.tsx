import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Star, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

// Public review submission via tokenized link sent by the vendor.
// Reviewer doesn't need an account; we resolve host identity from
// the originating inquiry server-side. Unsupported on real_event-
// only flows where there's no inquiry_id (the RPC requires either).

interface RequestContext {
  request_id: string;
  status: "sent" | "completed" | "expired" | "revoked";
  recipient_name: string | null;
  vendor_id: string;
  vendor_name: string;
  vendor_category: string;
  vendor_slug: string | null;
}

export default function PublicReviewPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState<RequestContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc(
        "get_review_request_context",
        { p_token: token },
      );
      if (cancelled) return;
      setCtx((data as RequestContext | null) ?? null);
      setLoading(false);
      if (data?.recipient_name) setName(data.recipient_name);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useDocumentMeta({
    title: ctx ? `Review ${ctx.vendor_name} — Vendora` : "Leave a review — Vendora",
    description: "Share your experience and help others choose the right vendor.",
    type: "website",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || rating < 1) {
      setError("Please choose a star rating");
      return;
    }
    setError(null);
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc(
      "submit_review_via_token",
      {
        p_token: token,
        p_rating: rating,
        p_body: body || null,
        p_reviewer_name: name || null,
      },
    );
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setDone(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
        <h1 className="font-editorial text-3xl mb-2">Link not found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This review link is invalid or has been removed. If you
          received it from a vendor, ask them to send a new one.
        </p>
        <Button
          asChild
          className="mt-6 rounded-full"
          variant="outline"
        >
          <Link to="/">Back to Vendora</Link>
        </Button>
      </div>
    );
  }

  if (ctx.status === "completed" || done) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-accent mb-4" />
          <h1 className="font-editorial text-4xl mb-2">Thanks for the review</h1>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
            Your review of {ctx.vendor_name} is live. It helps other
            hosts find vendors they can trust.
          </p>
          {ctx.vendor_slug && (
            <Button
              asChild
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Link to={`/v/${ctx.vendor_slug}`}>View profile</Link>
            </Button>
          )}
        </main>
        <Footer />
      </div>
    );
  }

  if (ctx.status === "revoked") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
        <h1 className="font-editorial text-3xl mb-2">Link no longer active</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The vendor has revoked this review link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <p className="font-label text-accent mb-3 inline-flex items-center gap-1.5">
              <Star className="w-3 h-3" />
              Leave a review
            </p>
            <h1 className="font-editorial text-4xl mb-2">
              How was {ctx.vendor_name}?
            </h1>
            <p className="text-sm text-muted-foreground capitalize">
              {ctx.vendor_category}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="text-center">
              <Label className="block mb-3">Your rating</Label>
              <div
                className="inline-flex gap-1.5"
                role="radiogroup"
                aria-label="Star rating"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setRating(star)}
                    aria-label={`${star} star${star === 1 ? "" : "s"}`}
                    aria-pressed={rating === star}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-9 h-9 ${
                        star <= rating
                          ? "fill-accent text-accent"
                          : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rev-body">Tell others about your experience (optional)</Label>
              <Textarea
                id="rev-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What stood out? What worked well? What should others know?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rev-name">Your name (optional)</Label>
              <Input
                id="rev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/20 rounded-sm p-2.5 text-destructive/85">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || rating < 1}
              className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit review
            </Button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
