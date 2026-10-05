import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { useCategoryNames } from "@/lib/categoryNames";

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

// Kept as a key (not text) so the message follows a language switch.
type FormError =
  | { key: "ratingRequired" }
  | { key: "submit"; message: string };

export default function PublicReviewPage() {
  const { token } = useParams();
  const { t } = useTranslation("review");
  const categories = useCategoryNames();
  const [ctx, setCtx] = useState<RequestContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

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
    title: ctx ? t("meta.titleVendor", { vendor: ctx.vendor_name }) : t("meta.title"),
    description: t("meta.description"),
    type: "website",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || rating < 1) {
      setError({ key: "ratingRequired" });
      return;
    }
    // Whitespace-only bodies are noise. Normalize here so we send
    // null to the RPC instead of "   " — keeps reviewers from
    // spam-submitting "5★ + blank" pretending to be content.
    const trimmedBody = body.trim();
    setError(null);
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc(
      "submit_review_via_token",
      {
        p_token: token,
        p_rating: rating,
        p_body: trimmedBody || null,
        p_reviewer_name: name.trim() || null,
      },
    );
    setSubmitting(false);
    if (rpcError) {
      setError({ key: "submit", message: rpcError.message });
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
        <h1 className="font-editorial text-3xl mb-2">{t("notFound.title")}</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t("notFound.body")}
        </p>
        <Button
          asChild
          className="mt-6 rounded-full"
          variant="outline"
        >
          <Link to="/">{t("notFound.back")}</Link>
        </Button>
      </div>
    );
  }

  if (ctx.status === "completed" || done) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-accent mb-4" />
          <h1 className="font-editorial text-4xl mb-2">{t("done.title")}</h1>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
            {t("done.body", { vendor: ctx.vendor_name })}
          </p>
          {ctx.vendor_slug && (
            <Button
              asChild
            >
              <Link to={`/v/${ctx.vendor_slug}`}>{t("done.viewProfile")}</Link>
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
        <h1 className="font-editorial text-3xl mb-2">{t("revoked.title")}</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t("revoked.body")}
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
              {t("form.eyebrow")}
            </p>
            <h1 className="font-editorial text-4xl mb-2">
              {t("form.title", { vendor: ctx.vendor_name })}
            </h1>
            <p className="text-sm text-muted-foreground capitalize">
              {ctx.vendor_category
                ? categories.sub(ctx.vendor_category)
                : ctx.vendor_category}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="text-center">
              <Label className="block mb-3">{t("form.rating")}</Label>
              <div
                className="inline-flex gap-1.5"
                role="radiogroup"
                aria-label={t("form.ratingAria")}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setRating(star)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setRating(Math.min(5, (rating || 0) + 1));
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                        e.preventDefault();
                        setRating(Math.max(1, (rating || star) - 1));
                      } else if (e.key === "Home") {
                        e.preventDefault();
                        setRating(1);
                      } else if (e.key === "End") {
                        e.preventDefault();
                        setRating(5);
                      }
                    }}
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={t("form.star", { count: star })}
                    className="p-1 hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
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
              <Label htmlFor="rev-body">{t("form.body")}</Label>
              <Textarea
                id="rev-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("form.bodyPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rev-name">{t("form.name")}</Label>
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
                <span className="leading-relaxed">
                  {error.key === "submit"
                    ? t("errors.submit", { message: error.message })
                    : t("errors.ratingRequired")}
                </span>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || rating < 1}
              className="w-full"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("form.submit")}
            </Button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
