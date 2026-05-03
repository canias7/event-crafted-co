import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, ArrowRight } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

interface LocationGroup {
  label: string;
  vendors: Vendor[];
}

// Splits a location string like "Brooklyn, NY" into a normalized label.
// Falls back to the whole string when the comma split doesn't help.
function normalizeLocation(loc: string): string {
  const trimmed = loc.trim();
  if (!trimmed) return "";
  // Title-case "brooklyn, ny" → "Brooklyn, NY". Tolerant of mixed case.
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    return parts[0]
      .split(" ")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }
  // City + state: title-case city, uppercase 2-letter state
  const city = parts[0]
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
  const state = parts[1].length === 2 ? parts[1].toUpperCase() : parts[1];
  return `${city}, ${state}`;
}

export default function VendorLocationsPage() {
  const { vendors, loading } = useVendors();

  useDocumentMeta({
    title: "Vendors by location — Vendora",
    description:
      "Browse Vendora vendors by city. Photographers, florists, venues, caterers, planners — find the team near your event.",
  });

  const groups = useMemo<LocationGroup[]>(() => {
    const map = new Map<string, Vendor[]>();
    for (const v of vendors) {
      const key = normalizeLocation(v.location ?? v.distance ?? "");
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries())
      .map(([label, list]) => ({ label, vendors: list }))
      .sort((a, b) => b.vendors.length - a.vendors.length);
  }, [vendors]);

  const totalLocations = groups.length;
  const uncategorized = vendors.filter(
    (v) => !normalizeLocation(v.location ?? v.distance ?? ""),
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border pt-32 pb-12">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — VENDORS BY LOCATION
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-[1.05] mb-4">
            Find your team{" "}
            <span className="italic font-light text-accent">near you.</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {totalLocations} {totalLocations === 1 ? "city" : "cities"} on Vendora
            today. Tap any city to filter the directory.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          {loading && groups.length === 0 ? (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-32 rounded-sm" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <MapPin className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-display text-xl mb-2">
                No location data yet
              </p>
              <p className="text-sm text-muted-foreground">
                Vendors haven't filled in their location field yet — check
                back as the directory grows.
              </p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {groups.map((g, i) => (
                  <motion.div
                    key={g.label}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...spring, delay: Math.min(i * 0.04, 0.3) }}
                  >
                    <Link
                      to={`/vendors?location=${encodeURIComponent(g.label)}`}
                      className="group block rounded-sm border border-border bg-card p-5 hover:border-foreground/30 transition-colors h-full"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="font-display text-lg leading-tight transition-colors group-hover:text-accent">
                          {g.label}
                        </p>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:text-accent transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground tnum mb-3">
                        {g.vendors.length}{" "}
                        {g.vendors.length === 1 ? "vendor" : "vendors"}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set(g.vendors.map((v) => v.category)))
                          .slice(0, 4)
                          .map((cat) => (
                            <span
                              key={cat}
                              className="text-[10px] tracking-wide uppercase font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full"
                            >
                              {cat}
                            </span>
                          ))}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
              {uncategorized > 0 && (
                <p className="text-xs text-muted-foreground text-center mt-8">
                  {uncategorized}{" "}
                  {uncategorized === 1 ? "vendor hasn't" : "vendors haven't"}{" "}
                  set a location yet.{" "}
                  <Link to="/vendors" className="text-accent">
                    Browse all
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
