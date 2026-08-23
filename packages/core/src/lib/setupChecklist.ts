// Vendor setup checklist — the single source of truth for "how far is
// this vendor from being discoverable?". Drives the "You're almost
// live!" banner and the full checklist screen on both the app and the
// website.
//
// Every item is computed from data the vendor already saves elsewhere —
// there is no separate "checklist state" to get out of sync. Identity
// fields read from public.profiles with a fallback to the primary
// vendor_profiles row; listing fields read across every vendor_profiles
// row the user owns.
//
// The Supabase client is injected rather than imported so this can run
// against the web client and either mobile client. `route` is an
// abstract destination — each app maps it to its own path, since the
// listing editor is a screen on mobile and a modal on the web.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryClient = any;

export type SetupRoute = "edit-profile" | "listing" | "calendar" | null;

export interface SetupItem {
  key: string;
  title: string;
  /** One-line explanation shown under the title in the checklist. */
  subtitle: string;
  done: boolean;
  /** Optional items don't count toward the progress number. */
  optional?: boolean;
  /** Where selecting the row takes the vendor. null = status-only row. */
  route: SetupRoute;
}

export interface SetupState {
  items: SetupItem[];
  requiredDone: number;
  requiredTotal: number;
  /** All required items done — the banner hides when this is true. */
  complete: boolean;
  /** Oldest vendor_profiles row id, for listing-editor deep links. */
  primaryListingId: string | null;
  /** Its category — picks the right editor (wizard vs generic form). */
  primaryCategory: string | null;
}

function filled(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export async function loadSetupState(
  supabase: QueryClient,
  userId: string,
): Promise<SetupState> {
  const [{ data: identityData }, { data: listingData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("business_name, category, location, bio, logo_url")
      .eq("id", userId)
      .maybeSingle(),
    supabase
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
  if (vendorIds.length > 0) {
    const [{ data: rules }, { data: dates }] = await Promise.all([
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
    ]);
    availabilityDone = (rules ?? []).length > 0 || (dates ?? []).length > 0;
  }

  const hasPricing = listings.some(
    (l) =>
      l.price_min_cents != null ||
      l.base_price_cents != null ||
      filled(l.custom_pricing) ||
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
  };
}
