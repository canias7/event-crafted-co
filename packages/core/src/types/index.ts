// Cross-platform domain types. Mirrors the shapes Supabase returns
// for the tables the web + mobile apps both consume. Generated
// supabase types live in apps/web/src/integrations/supabase/types.ts
// (still web-owned for now); these are the hand-written wrappers
// that round off the rough edges (display_name on profiles, etc.).

export type AppRole = "host" | "vendor";

export interface VendorProfile {
  id: string;
  business_name: string | null;
  category: string | null;
  bio: string | null;
  base_price_cents: number | null;
  location: string | null;
  verified_at: string | null;
  application_status: "draft" | "pending" | "approved" | "rejected" | null;
  application_review_notes: string | null;
  intro_video_url: string | null;
  weekly_digest_enabled: boolean | null;
  slug: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  logo_url: string | null;
}

export interface InquiryRow {
  id: string;
  vendor_id: string;
  host_id: string;
  status: "new" | "drafted" | "replied" | "won" | "lost" | "expired";
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  quality_score: number | null;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  vendor_id: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface VendorPackageRow {
  id: string;
  vendor_id: string;
  name: string;
  price_cents: number;
  is_active: boolean;
  display_order: number;
}

export interface VendorPortfolioImageRow {
  id: string;
  vendor_id: string;
  storage_path: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}
