import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { vendorImageUrl } from "@/lib/storage";

interface RealEventCard {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  cover_path: string | null;
  event_type: string | null;
  event_date: string | null;
  location: string | null;
  published_at: string;
  vendor: { business_name: string | null; category: string | null } | null;
}

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function RealEventsPage() {
  const [events, setEvents] = useState<RealEventCard[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentMeta({
    title: "Real events on Vendora — every detail, perfectly composed",
    description:
      "Editorial galleries from real Vendora bookings — weddings, milestone birthdays, holiday gatherings. See what's possible.",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("real_events")
        .select(
          "id, slug, title, intro, cover_path, event_type, event_date, location, published_at, vendor:vendor_profiles!real_events_vendor_id_fkey(business_name, category)",
        )
        .not("published_at", "is", null)
        .not("host_consent_given_at", "is", null)
        .not("slug", "is", null)
        .order("published_at", { ascending: false });
      if (cancelled) return;
      setEvents((data as RealEventCard[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — REAL EVENTS
          </p>
          <h1 className="font-display text-4xl md:text-6xl leading-[1.0] mb-5">
            Every detail,{" "}
            <span className="italic font-light text-accent">perfectly composed.</span>
          </h1>
          <p className="text-base md:text-lg text-foreground/75 max-w-2xl leading-relaxed">
            Editorial galleries from real Vendora bookings — weddings,
            milestone birthdays, holiday gatherings. Browse for inspiration
            or to find the vendors behind the events you love.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container mx-auto px-6 md:px-8">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12 max-w-6xl mx-auto">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/5] w-full rounded-sm mb-4" />
                  <Skeleton className="h-5 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-24 max-w-md mx-auto">
              <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-display text-xl mb-2">
                No published events yet
              </p>
              <p className="text-sm text-muted-foreground">
                Vendors are still publishing their first real-event pages.
                Check back soon.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12 max-w-6xl mx-auto">
              {events.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...spring, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <Link to={`/real-events/${e.slug}`} className="group block">
                    <div className="aspect-[4/5] overflow-hidden rounded-sm bg-muted mb-4">
                      {e.cover_path ? (
                        <img
                          src={vendorImageUrl(e.cover_path, { width: 800 })}
                          alt={e.title}
                          loading={i < 6 ? "eager" : "lazy"}
                          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        />
                      ) : null}
                    </div>
                    <p className="font-label text-accent mb-1 capitalize">
                      {e.event_type?.replace("_", " ") ?? "Event"}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                    <h2 className="font-display text-xl leading-tight mb-2 transition-colors group-hover:text-accent">
                      {e.title}
                    </h2>
                    {e.intro && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                        {e.intro}
                      </p>
                    )}
                    {e.vendor?.business_name && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Curated by{" "}
                        <span className="text-foreground/80 font-medium">
                          {e.vendor.business_name}
                        </span>
                      </p>
                    )}
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
