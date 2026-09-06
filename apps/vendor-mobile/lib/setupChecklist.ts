// Vendor setup checklist — the single source of truth for "how far is
// this vendor from being discoverable?". Drives both the "You're almost
// live!" banner on the Profile tab and the full checklist screen at
// /(vendor)/setup.
//
// Every item is computed from data the vendor already saves elsewhere —
// there is no separate "checklist state" to get out of sync. Identity
// fields read from public.profiles with a fallback to the primary
// vendor_profiles row (same fallback the Profile tab uses); listing
// fields read across every vendor_profiles row the user owns.

import { supabase } from "./supabase";

export type SetupRoute = "edit-profile" | "listing" | "calendar" | null;

export interface SetupItem {
  key: string;
  title: string;
  /** One-line explanation shown under the title in the checklist. */
  subtitle: string;
  done: boolean;
  /** Optional items don't count toward the progress number. */
  optional?: boolean;
  /** Where tapping the row takes the vendor. null = status-only row. */
  route: SetupRoute;
}

export interface SetupState {
  items: SetupItem[];
  requiredDone: number;
  requiredTotal: number;
  /** All required items done — the banner hides when this is true. */
  complete: boolean;
  /** Oldest vendor_profiles row id, for listing-builder deep links. */
  primaryListingId: string | null;
  /** Its category — picks the right editor (wizard vs generic form). */
  primaryCategory: string | null;
  /**
   * Portfolio photos across every listing the vendor owns. Not a
   * checklist item — publishing already enforces a floor of 3 — but
   * surfaces the optional "add a few more" nudge once setup is done.
   */
  photoCount: number;
}

function filled(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export async function loadSetupState(userId: string): Promise<SetupState> {
  const [{ data: identityData }, { data: listingData }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("profiles")
      .select("business_name, category, location, bio, logo_url")
      .eq("id", userId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("vendor_profiles")
      .select(
        "id, business_name, category, location, bio, logo_url, base_price_cents, price_min_cents, price_max_cents, custom_pricing, pricing_models, application_status, verified_at, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identity: any = identityData ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listings = (listingData ?? []) as any[];
  const primary = listings[0] ?? null;
  const vendorIds = listings.map((l) => l.id as string);

  // Availability counts as set up once the vendor has touched either
  // mechanism the Calendar tab writes: a recurring weekday rule or a
  // one-off blocked date, on any of their listings.
  let availabilityDone = false;
  let photoCount = 0;
  if (vendorIds.length > 0) {
    const [{ data: rules }, { data: dates }, { count: photos }] =
      await Promise.all([
        supabase
          .from("vendor_availability_rules")
          .select("vendor_id")
          .in("vendor_id", vendorIds)
          .limit(1),
        supabase
          .from("vendor_unavailable_dates")
          .select("vendor_id")
          .in("vendor_id", vendorIds)
          .limit(1),
        supabase
          .from("vendor_portfolio_images")
          .select("id", { count: "exact", head: true })
          .in("vendor_id", vendorIds),
      ]);
    availabilityDone = (rules ?? []).length > 0 || (dates ?? []).length > 0;
    photoCount = photos ?? 0;
  }

  const hasPricing = listings.some(
    (l) =>
      l.price_min_cents != null ||
      l.base_price_cents != null ||
      // custom_pricing is a boolean column — filled() only ever returns
      // true for a non-empty string, so this used to be dead. A vendor
      // who chose "custom quote" and nothing else was told their pricing
      // was unfinished forever, and the checklist never reached complete.
      l.custom_pricing === true ||
      (Array.isArray(l.pricing_models) && l.pricing_models.length > 0),
  );
  const hasPublishedListing = listings.some(
    (l) =>
      l.application_status === "approved" ||
      l.application_status === "pending" ||
      l.application_status === "submitted",
  );

  const items: SetupItem[] = [
    {
      key: "identity",
      title: "Business identity",
      subtitle: "Your business name, shown everywhere on Vendora.",
      done: filled(identity.business_name) || filled(primary?.business_name),
      route: "edit-profile",
    },
    {
      key: "logo",
      title: "Profile photo or logo",
      subtitle: "Put a face on your brand.",
      done: filled(identity.logo_url) || filled(primary?.logo_url),
      route: "edit-profile",
    },
    {
      key: "description",
      title: "Description",
      subtitle: "Tell hosts what makes you great.",
      done: filled(identity.bio) || filled(primary?.bio),
      route: "edit-profile",
    },
    {
      key: "category",
      title: "Category",
      subtitle: "So the right hosts can find you.",
      done:
        filled(identity.category) || listings.some((l) => filled(l.category)),
      route: "listing",
    },
    {
      key: "location",
      title: "Location & service area",
      subtitle: "Where you work — hosts search by area.",
      done:
        filled(identity.location) || listings.some((l) => filled(l.location)),
      route: "listing",
    },
    {
      key: "pricing",
      title: "Starting price",
      subtitle: "A price range helps hosts reach out with confidence.",
      done: hasPricing,
      route: "listing",
    },
    {
      key: "listing",
      title: "Publish a listing",
      subtitle: "Your listing is your storefront on the marketplace.",
      done: hasPublishedListing,
      route: "listing",
    },
    {
      key: "availability",
      title: "Availability",
      subtitle: "Block the dates you can't take bookings.",
      done: availabilityDone,
      route: "calendar",
    },
    // No "Verification" item: verification is granted by the Vendora
    // team from the admin panel — vendors can't apply for it, so a
    // checklist step they can't act on is just noise (user decision).
  ];

  const required = items.filter((i) => !i.optional);
  const requiredDone = required.filter((i) => i.done).length;
  return {
    items,
    requiredDone,
    requiredTotal: required.length,
    complete: requiredDone === required.length,
    primaryListingId: primary?.id ?? null,
    primaryCategory: primary?.category ?? null,
    photoCount,
  };
}
