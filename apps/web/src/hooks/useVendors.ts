import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { vendorImageUrl } from "@/lib/storage";

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
  /** Vendor-uploaded hero — first portfolio image as a public URL.
   *  When present, the directory card and the listing detail page
   *  use this instead of the per-category stock fallback. */
  heroImageUrl?: string | null;
  location?: string;
  /** Computed daily by scan-responder-tiers; null = no signal yet. */
  responderTier?: "fast" | "standard" | null;
  /** Optional vendor intro video — YouTube, Vimeo, or direct file URL. */
  introVideoUrl?: string | null;
  /** Slug for the SEO microsite mirror at /v/<slug>. */
  slug?: string | null;
  /** True when this vendor came from the live DB; false for sampleData fallback. */
  isReal: boolean;
  /** Approved verification kinds (identity / insurance / business_license) — public-safe. */
  verifiedKinds?: string[];
  /** True when subscription_tier === 'studio'. Shows the blue
   *  "verified" check on the vendor's card + profile. Distinct from
   *  verifiedKinds (KYC document verification). */
  studioVerified?: boolean;
  /** Public socials — without leading @. */
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
  /** Booking terms — surfaced as policy badges on the public profile. */
  depositPct?: number | null;
  cancellationPolicy?: string | null;
  rescheduleWindowDays?: number | null;
  policyNotes?: string | null;
  /** Owner's profiles.id — used by the partner-thread RPC and any
   *  surface that needs to know "who runs this listing." Pre-baked
   *  into the cache so consumers don't need a second roundtrip. */
  ownerUserId?: string | null;
}

// Sub-category → bundled image key. Maps every sub in
// categoryTaxonomy.ts to its best-fit hero so cards in the same
// browse view don't repeat. The image keys are defined in
// VendorCard.tsx (imageMap) — adding a new key requires importing
// the asset there too. Falls back to "vendor-venue" when no entry
// exists.
export const categoryImageFallback: Record<string, string> = {
  // Venues — varied venue + setting imagery
  "Event Venues": "vendor-venue",
  "Outdoor Spaces": "feature-lounge",
  "Private Dining Spaces": "hero-dinner",
  "Corporate / Conference Spaces": "hero-corporate",
  // Food & Beverage — food, cocktails, cakes, street food
  Catering: "vendor-catering",
  "Bartending / Mobile Bars": "hero-nye",
  "Desserts & Cakes": "hero-birthday",
  "Food Trucks / Specialty": "hero-fiesta",
  // Entertainment — performance + stage energy
  DJs: "vendor-dj",
  "Live Music": "hero-cinematic",
  Performers: "hero-gala",
  "Hosts / MCs": "hero-wedding",
  // Media — coverage / event documentation
  Photography: "vendor-photographer",
  Videography: "feature-florals",
  "Photo Booths": "hero-engagement",
  // Design & Decor — florals, beauty, styling
  "Event Coordinators": "feature-lounge",
  Florists: "vendor-florist",
  Beauty: "vendor-makeup",
  "Decor Rentals": "feature-florals",
  "Grooming Services": "hero-corporate",
  // Rentals — infrastructure
  "Furniture Rentals": "feature-lounge",
  "Tents & Outdoor": "hero-beach",
  "Lighting & AV Equipment": "hero-cinematic",
  "Dance Floors & Staging": "hero-gala",
  Transportation: "hero-nye",
  // Experiences
  Tastings: "hero-dinner",
  "Specialty Services": "hero-fiesta",
  // Corporate Services
  Staffing: "feature-lounge",
  "Speakers / Hosts": "hero-corporate",
  Security: "hero-cinematic",
  Valet: "hero-nye",
};

interface VendorProfileRow {
  id: string;
  user_id: string;
  business_name: string | null;
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
  instagram_handle: string | null;
  tiktok_handle: string | null;
  deposit_pct: number | null;
  cancellation_policy: string | null;
  reschedule_window_days: number | null;
  policy_notes: string | null;
  // Owner's brand identity, embedded via vendor_brands (the public-safe
  // view over profiles). Listings created via the wizard ship with
  // business_name + bio null, so display falls back to the brand here.
  // Multi-listing vendors who set per-listing values still win.
  // subscription_tier is on the brand row now too (per migration
  // 20260524000200) — that's where the studio-verified badge reads
  // from; the column on vendor_profiles is deprecated.
  brand: {
    business_name: string | null;
    bio: string | null;
    subscription_tier: string | null;
  } | null;
}

function normalizeDb(row: VendorProfileRow): Vendor {
  const effectiveName =
    row.business_name?.trim() || row.brand?.business_name?.trim() || "";
  const effectiveBio = row.bio?.trim() || row.brand?.bio?.trim() || null;
  const description =
    effectiveBio ||
    row.portfolio_summary?.slice(0, 140).trim() ||
    `${row.category} on Vendora.`;
  return {
    id: row.id,
    name: effectiveName,
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
    instagramHandle: row.instagram_handle ?? null,
    tiktokHandle: row.tiktok_handle ?? null,
    depositPct: row.deposit_pct ?? null,
    cancellationPolicy: row.cancellation_policy ?? null,
    rescheduleWindowDays: row.reschedule_window_days ?? null,
    policyNotes: row.policy_notes ?? null,
    ownerUserId: row.user_id,
    isReal: true,
    studioVerified: row.brand?.subscription_tier === "studio",
  };
}

// Live cache, hydrated from the DB. Starts empty — we only show real vendors.
let cache: Vendor[] = [];
let hydrated = false;
let inFlight: Promise<Vendor[]> | null = null;

/**
 * Reset the module-level cache so the next consumer triggers a
 * fresh fetch. Use after a write that should be reflected in the
 * directory — e.g. a vendor publishing their listing. Pair with a
 * full-page navigation (window.location.assign) since this only
 * affects the next mount of useVendors.
 */
export function invalidateVendorsCache() {
  cache = [];
  hydrated = false;
  inFlight = null;
}

async function fetchVendors(): Promise<Vendor[]> {
  if (hydrated) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // Public directory only shows approved applications. RLS enforces
      // this server-side too; the client filter is a small redundancy
      // that keeps the network response tight.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_profiles")
        .select(
          "id, user_id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, responder_tier, intro_video_url, slug, instagram_handle, tiktok_handle, deposit_pct, cancellation_policy, reschedule_window_days, policy_notes, brand:vendor_brands!vendor_profiles_user_id_fkey(business_name, bio, subscription_tier)",
        )
        .eq("application_status", "approved")
        .order("verified_at", { ascending: false, nullsFirst: false });
      if (!error && data) {
        const vendors = (data as VendorProfileRow[]).map(normalizeDb);

        // Override startingPrice with the lowest active package price for
        // each vendor. Falls back to base_price_cents (already set above)
        // when a vendor hasn't built out packages yet.
        const { data: pkgs } = await supabase
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

        // Batch-fetch reviews so the directory's "Most reviewed" /
        // "Highest rated" sort options aren't no-ops. Aggregate
        // client-side: count + simple avg per vendor_id. RLS lets
        // anonymous reads through for reviews tied to approved
        // vendors so the public directory can power the sort.
        //
        // Filter to rater_role='host' so vendor-side conversation
        // ratings of hosts don't pollute the vendor's own card. Both
        // kinds (event + conversation) feed the listing-card rating
        // since the card surfaces one number, not two.
        const approvedIds = vendors.map((v) => v.id);
        if (approvedIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: revs } = await (supabase as any)
            .from("reviews")
            .select("vendor_id, rating")
            .eq("rater_role", "host")
            .in("vendor_id", approvedIds);
          if (revs && revs.length > 0) {
            const agg: Record<string, { sum: number; count: number }> = {};
            for (const r of revs as Array<{
              vendor_id: string;
              rating: number;
            }>) {
              const e = agg[r.vendor_id] ?? { sum: 0, count: 0 };
              e.sum += r.rating;
              e.count += 1;
              agg[r.vendor_id] = e;
            }
            for (const v of vendors) {
              const e = agg[v.id];
              if (e) {
                v.reviews = e.count;
                v.rating = e.sum / e.count;
              }
            }
          }
        }

        // Batch-fetch verification badges so cards can render the
        // shield iconography without an N+1 fetch.
        // vendor_public_badges is a Postgres view; views aren't in the
        // generated types, so the cast is required.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: badges } = await (supabase as any)
          .from("vendor_public_badges")
          .select("vendor_id, kinds");
        if (badges && badges.length > 0) {
          const byVendor: Record<string, string[]> = {};
          for (const row of badges as Array<{
            vendor_id: string;
            kinds: string[];
          }>) {
            byVendor[row.vendor_id] = row.kinds;
          }
          for (const v of vendors) {
            if (byVendor[v.id]) v.verifiedKinds = byVendor[v.id];
          }
        }

        // Batch-fetch hero photos — first portfolio image per vendor
        // (lowest display_order, earliest created_at) so the
        // directory card matches what the vendor actually uploaded.
        // No image → fall back to the per-category stock art via
        // categoryImageFallback (already in `v.image`).
        const { data: photos } = await supabase
          .from("vendor_portfolio_images")
          .select("vendor_id, storage_path, display_order, created_at")
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (photos && photos.length > 0) {
          const heroByVendor: Record<string, string> = {};
          for (const row of photos as Array<{
            vendor_id: string;
            storage_path: string;
          }>) {
            // First row per vendor wins thanks to the order above.
            if (!heroByVendor[row.vendor_id]) {
              heroByVendor[row.vendor_id] = vendorImageUrl(
                row.storage_path,
                { width: 1000 },
              );
            }
          }
          for (const v of vendors) {
            if (heroByVendor[v.id]) v.heroImageUrl = heroByVendor[v.id];
          }
        }

        cache = vendors;
      }
    } catch {
      // Leave cache empty on failure; UI shows empty state.
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
