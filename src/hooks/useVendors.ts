import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { vendors as sampleVendors } from "@/data/sampleData";

export interface Vendor {
  id: string;
  name: string;
  category: string;
  description: string;
  rating: number;
  reviews: number;
  startingPrice: number;
  distance: string;
  availability: string;
  image: string;
  location?: string;
  /** Computed daily by scan-responder-tiers; null = no signal yet. */
  responderTier?: "fast" | "standard" | null;
  /** Optional vendor intro video — YouTube, Vimeo, or direct file URL. */
  introVideoUrl?: string | null;
  /** Slug for the SEO microsite mirror at /v/<slug>. */
  slug?: string | null;
  /** True when this vendor came from the live DB; false for sampleData fallback. */
  isReal: boolean;
}

const categoryImageFallback: Record<string, string> = {
  Photographer: "vendor-photographer",
  Videographer: "vendor-photographer",
  Florist: "vendor-florist",
  Catering: "vendor-catering",
  Baker: "vendor-catering",
  DJ: "vendor-dj",
  Venue: "vendor-venue",
  "Makeup Artist": "vendor-makeup",
  "Event Planner": "vendor-venue",
  Decorator: "vendor-florist",
};

interface VendorProfileRow {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  base_price_cents: number | null;
  location: string | null;
  service_radius_miles: number | null;
  portfolio_summary: string | null;
  verified_at: string | null;
  responder_tier: "fast" | "standard" | null;
  intro_video_url: string | null;
  slug: string | null;
}

function normalizeDb(row: VendorProfileRow): Vendor {
  const description =
    row.bio?.trim() ||
    row.portfolio_summary?.slice(0, 140).trim() ||
    `${row.category} on Vendora.`;
  return {
    id: row.id,
    name: row.business_name,
    category: row.category,
    description,
    rating: 0,
    reviews: 0,
    startingPrice:
      row.base_price_cents != null ? Math.round(row.base_price_cents / 100) : 0,
    distance: row.location ?? "",
    availability: row.verified_at ? "available" : "limited",
    image: categoryImageFallback[row.category] ?? "vendor-venue",
    location: row.location ?? undefined,
    responderTier: row.responder_tier ?? null,
    introVideoUrl: row.intro_video_url ?? null,
    slug: row.slug ?? null,
    isReal: true,
  };
}

const sampleVendorsTagged: Vendor[] = sampleVendors.map((v) => ({
  ...v,
  isReal: false,
}));

// Live cache, hydrated from the DB. Starts as the sampleData fallback so the
// directory has something to render immediately while the network request is
// in flight (and gracefully covers offline/cert/cold-DB cases).
let cache: Vendor[] = sampleVendorsTagged;
let hydrated = false;
let inFlight: Promise<Vendor[]> | null = null;

async function fetchVendors(): Promise<Vendor[]> {
  if (hydrated) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // Cast through any: responder_tier is added by a forward migration
      // not yet reflected in Lovable's auto-generated types.ts.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, responder_tier, intro_video_url, slug",
        )
        .order("verified_at", { ascending: false, nullsFirst: false });
      if (!error && data && data.length > 0) {
        const vendors = (data as VendorProfileRow[]).map(normalizeDb);

        // Override startingPrice with the lowest active package price for
        // each vendor. Falls back to base_price_cents (already set above)
        // when a vendor hasn't built out packages yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pkgs } = await (supabase as any)
          .from("vendor_packages")
          .select("vendor_id, price_cents")
          .eq("is_active", true);
        if (pkgs && pkgs.length > 0) {
          const lowest: Record<string, number> = {};
          for (const row of pkgs as Array<{
            vendor_id: string;
            price_cents: number;
          }>) {
            const existing = lowest[row.vendor_id];
            if (existing == null || row.price_cents < existing) {
              lowest[row.vendor_id] = row.price_cents;
            }
          }
          for (const v of vendors) {
            if (lowest[v.id] != null) {
              v.startingPrice = Math.round(lowest[v.id] / 100);
            }
          }
        }

        cache = vendors;
      }
    } catch {
      // Keep sampleVendorsTagged fallback already in cache.
    }
    hydrated = true;
    inFlight = null;
    return cache;
  })();
  return inFlight;
}

export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>(cache);
  const [loading, setLoading] = useState(!hydrated);

  useEffect(() => {
    if (hydrated) {
      setVendors(cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchVendors().then((vs) => {
      if (cancelled) return;
      setVendors(vs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { vendors, loading };
}

export function useVendor(id: string | undefined) {
  const { vendors, loading } = useVendors();
  const vendor = id ? vendors.find((v) => v.id === id) : undefined;
  return { vendor, loading };
}
