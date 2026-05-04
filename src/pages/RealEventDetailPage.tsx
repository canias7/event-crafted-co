import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Lightbox } from "@/components/shared/Lightbox";
import { JsonLd } from "@/components/seo/JsonLd";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { vendorImageUrl } from "@/lib/storage";

interface RealEvent {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  story: string | null;
  cover_path: string | null;
  gallery_paths: string[];
  event_type: string | null;
  event_date: string | null;
  location: string | null;
  published_at: string;
  vendor: {
    id: string;
    business_name: string | null;
    category: string | null;
  } | null;
}

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function RealEventDetailPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState<RealEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("real_events")
        .select(
          "id, slug, title, intro, story, cover_path, gallery_paths, event_type, event_date, location, published_at, vendor:vendor_profiles!real_events_vendor_id_fkey(id, business_name, category)",
        )
        .eq("slug", slug)
        .not("published_at", "is", null)
        .not("host_consent_given_at", "is", null)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setEvent(data as RealEvent);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useDocumentMeta({
    title: event
      ? `${event.title} — Real event on Vendora`
      : "Real event — Vendora",
    description:
      event?.intro ??
      "An editorial gallery from a real Vendora booking.",
    image: event?.cover_path
      ? vendorImageUrl(event.cover_path, { width: 1200 })
      : undefined,
    type: "article",
  });

  if (notFound) return <Navigate to="/real-events" replace />;

  if (loading || !event) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <section className="pt-32 pb-16">
          <div className="container mx-auto px-6 md:px-8 max-w-4xl space-y-6">
            <Skeleton className="aspect-[16/9] w-full rounded-sm" />
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const lightboxImages =
    event.gallery_paths.length > 0
      ? event.gallery_paths.map((p) => ({
          src: vendorImageUrl(p, { width: 1600 }),
          alt: event.title,
        }))
      : [];

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cover */}
      {event.cover_path && (
        <section className="relative h-[60svh] min-h-[420px] w-full overflow-hidden">
          <img
            src={vendorImageUrl(event.cover_path, { width: 1920 })}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/35 via-foreground/15 to-background" />
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-foreground/55 to-transparent pointer-events-none" />
        </section>
      )}

      <section className="py-12 md:py-16 -mt-32 relative z-10">
        <div className="container mx-auto px-6 md:px-8 max-w-4xl">
          <Link
            to="/real-events"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-background/80 hover:text-background mb-6 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All real events
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring }}
            className="bg-background rounded-sm p-8 md:p-12 border border-border"
          >
            <p className="font-label text-accent tracking-[0.4em] mb-4 capitalize">
              — {event.event_type?.replace("_", " ") ?? "Event"}
            </p>
            <h1 className="font-display text-4xl md:text-5xl leading-[1.05] mb-5">
              {event.title}
            </h1>
            <div className="flex items-center gap-5 text-sm text-muted-foreground mb-8 flex-wrap">
              {event.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {event.location}
                </span>
              )}
              {event.event_date && (
                <span className="inline-flex items-center gap-1.5 tnum">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {new Date(event.event_date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
            {event.intro && (
              <p className="text-lg md:text-xl text-foreground/80 leading-relaxed mb-8 italic font-light">
                {event.intro}
              </p>
            )}
            {event.story && (
              <div className="prose prose-sm sm:prose-base max-w-none text-foreground/80 leading-relaxed whitespace-pre-line">
                {event.story}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Gallery */}
      {event.gallery_paths.length > 0 && (
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-6 md:px-8 max-w-6xl">
            <p className="font-label text-accent mb-6 tracking-[0.4em]">
              — GALLERY
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {event.gallery_paths.map((p, i) => (
                <motion.button
                  type="button"
                  key={p}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...spring, delay: Math.min(i * 0.04, 0.4) }}
                  onClick={() => setLightboxIndex(i)}
                  className={`group overflow-hidden rounded-sm bg-muted block ${
                    i % 6 === 0 ? "col-span-2 row-span-2 aspect-[4/3]" : "aspect-square"
                  }`}
                  aria-label={`Open photo ${i + 1}`}
                >
                  <img
                    src={vendorImageUrl(p, {
                      width: i % 6 === 0 ? 1200 : 600,
                    })}
                    alt=""
                    loading={i < 4 ? "eager" : "lazy"}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                  />
                </motion.button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Vendor credit */}
      {event.vendor && (
        <section className="py-12 md:py-16 border-t border-border">
          <div className="container mx-auto px-6 md:px-8 max-w-3xl text-center">
            <p className="font-label text-muted-foreground mb-3 tracking-[0.4em]">
              — CURATED BY
            </p>
            <h2 className="font-display text-3xl mb-2">
              {event.vendor.business_name}
            </h2>
            {event.vendor.category && (
              <p className="text-sm text-muted-foreground mb-6">
                {event.vendor.category} on Vendora
              </p>
            )}
            <Link
              to={`/vendors/${event.vendor.id}`}
              className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
            >
              View vendor profile
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <Lightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: event.title,
          description: event.intro,
          image: event.cover_path
            ? vendorImageUrl(event.cover_path, { width: 1200 })
            : undefined,
          datePublished: event.published_at,
          author: event.vendor?.business_name
            ? {
                "@type": "Organization",
                name: event.vendor.business_name,
              }
            : undefined,
        }}
      />

      <Footer />
    </div>
  );
}
