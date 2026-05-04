import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, ArrowRight, Users } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { JsonLd } from "@/components/seo/JsonLd";
import { FaqSection } from "@/components/seo/FaqSection";
import { STAFFING_CATEGORY_NAMES } from "@/pages/VendorCategoryPage";
import { supabase } from "@/integrations/supabase/client";

interface StaffingVendor extends Vendor {
  hourly_rate_cents?: number | null;
  min_hours?: number | null;
}

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

const FAQ = [
  {
    q: "When should I book day-of staffing?",
    a: "4-8 weeks before the event for most categories; 12+ weeks for high-demand dates (peak wedding weekends, NYE, holidays). Last-minute bookings are sometimes possible but expect a premium.",
  },
  {
    q: "How is staffing priced?",
    a: "Hourly, with a per-staffer minimum (usually 4-6 hours). Vendors list a base hourly rate; final quotes account for headcount, total hours, gratuity, and travel. Typical ranges on Vendora: bartenders $45-90/hr, waitstaff $35-65/hr, security $50-90/hr, valets $30-55/hr, day-of coordinators $1,500-3,500 flat.",
  },
  {
    q: "Do staff bring their own equipment?",
    a: "Bartenders typically bring tools (shakers, jiggers, openers) but not glassware or alcohol. Valets bring runners + uniforms; security brings radios + IDs. Always confirm in your inquiry — assumptions cost money on the day.",
  },
  {
    q: "What about insurance?",
    a: "Every staffing vendor on Vendora is asked to carry general liability insurance. Look for the insurance verification badge on their profile, or ask them to upload a current COI before you book.",
  },
];

function fmtRate(cents?: number | null) {
  if (!cents) return null;
  return `$${(cents / 100).toFixed(0)}`;
}

export default function StaffingPage() {
  const { vendors, loading } = useVendors();
  const [staffingDetails, setStaffingDetails] = useState<
    Record<string, { hourly_rate_cents: number | null; min_hours: number | null }>
  >({});

  useDocumentMeta({
    title: "Day-of staffing on Vendora — bartenders, waitstaff, security, valet",
    description:
      "Hourly-billed event staff in one place. Bartenders, waitstaff, security, valet, and day-of coordinators — vetted, insured, hourly rates upfront.",
  });

  // Pull hourly rate / min hours for the staffing vendors. useVendors
  // doesn't include them by default to keep that hook lean for the
  // main directory.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("vendor_profiles")
      .select("id, hourly_rate_cents, min_hours")
      .eq("is_staffing", true)
      .then(({ data }: { data: Array<{ id: string; hourly_rate_cents: number | null; min_hours: number | null }> | null }) => {
        if (cancelled) return;
        const map: Record<string, { hourly_rate_cents: number | null; min_hours: number | null }> = {};
        for (const r of data ?? []) {
          map[r.id] = {
            hourly_rate_cents: r.hourly_rate_cents,
            min_hours: r.min_hours,
          };
        }
        setStaffingDetails(map);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byCategory = useMemo(() => {
    const out: Record<string, StaffingVendor[]> = {};
    for (const cat of STAFFING_CATEGORY_NAMES) out[cat] = [];
    for (const v of vendors) {
      if (!STAFFING_CATEGORY_NAMES.includes(v.category)) continue;
      out[v.category].push({
        ...v,
        ...(staffingDetails[v.id] ?? {}),
      });
    }
    // Sort each bucket by hourly rate (cheapest first), then name.
    for (const cat of Object.keys(out)) {
      out[cat].sort((a, b) => {
        const ar = a.hourly_rate_cents ?? Infinity;
        const br = b.hourly_rate_cents ?? Infinity;
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name);
      });
    }
    return out;
  }, [vendors, staffingDetails]);

  const totalCount = STAFFING_CATEGORY_NAMES.reduce(
    (acc, cat) => acc + (byCategory[cat]?.length ?? 0),
    0,
  );

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — DAY-OF STAFFING
          </p>
          <h1 className="font-display text-4xl md:text-6xl leading-[1.0] mb-5">
            Warm bodies on the day,{" "}
            <span className="italic font-light text-accent">
              priced by the hour.
            </span>
          </h1>
          <p className="text-base md:text-lg text-foreground/75 max-w-2xl leading-relaxed">
            Bartenders, waitstaff, security, valet, day-of coordinators —
            the staff that turns a venue into an event. Hourly rates and
            minimum hours are visible up front so you can compare apples
            to apples before sending an inquiry.
          </p>
          {totalCount > 0 && (
            <p className="text-xs text-muted-foreground mt-6 tnum">
              {totalCount} staffing {totalCount === 1 ? "vendor" : "vendors"}{" "}
              live on Vendora today
            </p>
          )}
        </div>
      </section>

      {STAFFING_CATEGORY_NAMES.map((cat) => {
        const items = byCategory[cat] ?? [];
        if (items.length === 0 && !loading) return null;
        return (
          <section key={cat} className="py-12 md:py-16 border-b border-border last:border-b-0">
            <div className="container mx-auto px-6 md:px-8 max-w-5xl">
              <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
                <h2 className="font-display text-3xl">{cat}</h2>
                <span className="text-xs text-muted-foreground tnum">
                  {items.length} {items.length === 1 ? "available" : "available"}
                </span>
              </div>
              {loading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-32 rounded-sm" />
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((v, i) => {
                    const rate = fmtRate(v.hourly_rate_cents);
                    return (
                      <motion.div
                        key={v.id}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ ...spring, delay: Math.min(i * 0.04, 0.3) }}
                      >
                        <Link
                          to={`/vendors/${v.id}`}
                          className="group block rounded-sm border border-border bg-card p-4 hover:border-foreground/40 transition-colors h-full"
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="font-display text-base leading-tight transition-colors group-hover:text-accent">
                                {v.name}
                              </p>
                              {v.location && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {v.location}
                                </p>
                              )}
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-1 group-hover:text-accent transition-colors" />
                          </div>
                          {rate ? (
                            <div className="flex items-baseline gap-3 pt-3 border-t border-border">
                              <p className="font-display text-xl tnum">
                                {rate}
                                <span className="text-xs text-muted-foreground font-light ml-0.5">
                                  /hr
                                </span>
                              </p>
                              {v.min_hours ? (
                                <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1 tnum">
                                  <Clock className="w-3 h-3" />
                                  {v.min_hours}h min
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground pt-3 border-t border-border inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Quote on request
                            </p>
                          )}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {totalCount === 0 && !loading && (
        <section className="py-20">
          <div className="container mx-auto px-6 max-w-md text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
            <p className="font-display text-xl mb-2">No staffing vendors yet</p>
            <p className="text-sm text-muted-foreground">
              We're hand-selecting the first wave. Check back soon — or
              browse the full directory in the meantime.
            </p>
            <Link
              to="/vendors"
              className="inline-block mt-6 text-sm text-accent hover:underline"
            >
              Browse all vendors →
            </Link>
          </div>
        </section>
      )}

      <FaqSection items={FAQ} title="Booking day-of staffing on Vendora" />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />

      <Footer />
    </div>
  );
}
