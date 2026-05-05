import { useEffect, useMemo, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { transformedImageUrl } from "@/lib/storage";
import { formatDate } from "@/lib/format";

// Long-form editorial article reader. Single source of truth for
// content the marketing/SEO team writes about: planning guides, city
// deep-dives, vendor spotlights, etc. URL is /guides/{slug}.
//
// The page renders Article schema.org JSON-LD with author, datePublished,
// and headline so Google can attribute to a Vendora-authored piece —
// this is the structural piece that programmatic-SEO results need to
// rank, since flat result pages without supporting editorial don't
// build the topical authority Google rewards.

interface Article {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  body: string;
  hero_path: string | null;
  category_slug: string | null;
  city_slug: string | null;
  event_type_slug: string | null;
  author_name: string | null;
  read_minutes: number;
  published_at: string;
}

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function EditorialArticlePage() {
  const { slug } = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("editorial_articles")
        .select(
          "id, slug, title, subtitle, excerpt, body, hero_path, category_slug, city_slug, event_type_slug, author_name, read_minutes, published_at",
        )
        .eq("slug", slug)
        .not("published_at", "is", null)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setArticle(data as Article);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const heroUrl = useMemo(
    () =>
      article?.hero_path
        ? transformedImageUrl("editorial-images", article.hero_path, {
            width: 1600,
          })
        : null,
    [article?.hero_path],
  );

  useDocumentMeta({
    title: article ? `${article.title} — Vendora` : "Vendora",
    description:
      article?.excerpt ?? article?.subtitle ?? "Editorial guide on Vendora.",
    image: heroUrl ?? undefined,
    type: "article",
  });

  if (notFound) {
    return <Navigate to="/real-events" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <article className="pt-32 pb-16 md:pt-36">
        <div className="container mx-auto px-6 md:px-8 max-w-3xl">
          {loading ? (
            <>
              <Skeleton className="h-6 w-24 mb-6" />
              <Skeleton className="h-12 w-full mb-3" />
              <Skeleton className="h-12 w-3/4 mb-8" />
              <Skeleton className="aspect-[16/9] w-full mb-8" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </>
          ) : article ? (
            <>
              <Link
                to="/real-events"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
              >
                <ArrowLeft className="w-3 h-3" />
                Real events
              </Link>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className="font-display text-4xl md:text-6xl leading-[1.0] mb-3"
              >
                {article.title}
              </motion.h1>
              {article.subtitle && (
                <p className="text-lg md:text-xl text-foreground/75 mb-6 leading-relaxed">
                  {article.subtitle}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-10 pb-6 border-b border-border">
                {article.author_name && (
                  <span>By {article.author_name}</span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(article.published_at, "short")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {article.read_minutes} min read
                </span>
              </div>

              {heroUrl && (
                <img
                  src={heroUrl}
                  alt=""
                  className="w-full aspect-[16/9] object-cover rounded-sm mb-10"
                  loading="eager"
                />
              )}

              <div className="prose prose-stone max-w-none prose-headings:font-display prose-headings:tracking-tight prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {article.body}
                </ReactMarkdown>
              </div>

              {/* Cross-link rail — surfaces the matching marketplace
                  pages so editorial → marketplace traffic flows. */}
              {(article.category_slug ||
                article.city_slug ||
                article.event_type_slug) && (
                <div className="mt-12 pt-8 border-t border-border">
                  <p className="font-label text-accent mb-3">Browse vendors</p>
                  <div className="flex flex-wrap gap-2">
                    {article.category_slug && article.city_slug && (
                      <Link
                        to={`/vendors/${article.category_slug}/in/${article.city_slug}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
                      >
                        Vendors mentioned in this guide
                      </Link>
                    )}
                    {article.category_slug && (
                      <Link
                        to={`/vendors/category/${article.category_slug}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
                      >
                        All {article.category_slug}
                      </Link>
                    )}
                    {article.city_slug && (
                      <Link
                        to={`/vendors/in/${article.city_slug}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
                      >
                        All vendors in this city
                      </Link>
                    )}
                    {article.event_type_slug && article.city_slug && (
                      <Link
                        to={`/${article.event_type_slug}-vendors/${article.city_slug}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
                      >
                        {article.event_type_slug.replace("-", " ")} vendors here
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <JsonLd
                data={{
                  "@context": "https://schema.org",
                  "@type": "Article",
                  headline: article.title,
                  description:
                    article.excerpt ?? article.subtitle ?? undefined,
                  image: heroUrl ?? undefined,
                  datePublished: article.published_at,
                  author: article.author_name
                    ? { "@type": "Person", name: article.author_name }
                    : { "@type": "Organization", name: "Vendora" },
                  publisher: {
                    "@type": "Organization",
                    name: "Vendora",
                    logo: {
                      "@type": "ImageObject",
                      url: "https://vendora.app/og.jpg",
                    },
                  },
                }}
              />
            </>
          ) : null}
        </div>
      </article>

      <Footer />
    </div>
  );
}
