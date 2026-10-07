// Vendor "My Profile" — listings-only identity hub. Posts / reels /
// buzz moved to the host side; vendors only manage listings here.
//
// Header shows avatar / business name / member-since / verified
// badge + rating. Below the header: the vendor's listings rendered
// as the same directory cards the public /vendors directory uses.
// Terminology: this is the vendor's ACCOUNT profile (one per user).
// The rows in the vendor_profiles table are LISTINGS — up to 5
// per account. "Profile" = account; "listing" = marketplace row.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Edit3, Loader2, Share2, User } from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { BrandCardShell } from "@/components/vendor/BrandCardShell";
import { ListingWizardModal } from "@/components/vendor/ListingWizardModal";
import { EditListingModal } from "@/components/vendor/EditListingModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { useVendorPlan } from "@/hooks/useVendorPlan";
import { StudioVerifiedBadge } from "@/components/vendor/StudioVerifiedBadge";
import { supabase } from "@/integrations/supabase/client";
import { useCategoryNames } from "@/lib/categoryNames";
import { usePriceLabels } from "@/lib/priceLabels";

interface VendorRow {
  id: string;
  business_name: string | null;
  category: string | null;
  location: string | null;
  bio: string | null;
  base_price_cents: number | null;
  pricing_models: string[] | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  custom_pricing: boolean | null;
  logo_url: string | null;
  verified_at: string | null;
  application_status: string | null;
  slug: string | null;
  created_at: string | null;
}

interface AccountProfile {
  business_name: string | null;
  bio: string | null;
  logo_url: string | null;
  created_at: string | null;
}

export default function VendorMyProfilePage() {
  const { t } = useTranslation("vendorHome");
  const { user } = useAuth();
  // Paid-tier verification badge on the header logo. Reads from
  // profiles.subscription_tier per the per-user subscription model
  // (migration 20260524000000). Verified profile is a Pro-and-up
  // perk under the Free / Pro / Premium plan model ('studio' is
  // Premium's internal slug).
  const { tier } = useVendorPlan(user?.id ?? null);
  const studioVerified = tier === "pro" || tier === "studio";
  // Plan listing cap (Free 1 / Pro 4 / Premium 10, null = unlimited
  // grandfather flag) — drives whether "New listing" shows once
  // listings exist. Server-side trigger enforces the same cap.
  const [listingCap, setListingCap] = useState<number | null>(1);
  const [loading, setLoading] = useState(true);
  const [primary, setPrimary] = useState<VendorRow | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [ratingAvg, setRatingAvg] = useState<number | null>(null);
  const [listings, setListings] = useState<VendorRow[]>([]);
  // First portfolio image per listing → used as the listing card cover
  // so the profile's Listings tab matches the public /vendors directory.
  const [heroByListing, setHeroByListing] = useState<Record<string, string>>({});
  const [listingWizardOpen, setListingWizardOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // Account-level identity — business_name + bio + logo + member-since
    // all live on `profiles` (one per user). The listing rows in
    // vendor_profiles carry per-listing fields like category / location
    // / price and do NOT participate in the header card here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accountRow } = await (supabase as any)
      .from("profiles")
      .select("business_name, bio, logo_url, created_at")
      .eq("id", user.id)
      .maybeSingle();
    setAccount((accountRow as AccountProfile | null) ?? null);

    const { data: vps } = await supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, location, bio, base_price_cents, pricing_models, price_min_cents, price_max_cents, custom_pricing, logo_url, verified_at, application_status, slug, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const vendors = (vps ?? []) as VendorRow[];
    // Approved (live) listings render first, then pending/submitted,
    // then anything else (rejected/null/drafted). Created-at ASC
    // breaks ties so the order is otherwise stable. primary picks up
    // the first approved listing as a side-effect.
    const statusRank = (s: string | null): number =>
      s === "approved"
        ? 0
        : s === "pending" || s === "submitted"
          ? 1
          : 2;
    vendors.sort((a, b) => {
      const r = statusRank(a.application_status) - statusRank(b.application_status);
      if (r !== 0) return r;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
    setListings(vendors);
    const primaryRow = vendors[0] ?? null;
    setPrimary(primaryRow);
    const ids = vendors.map((v) => v.id);

    if (ids.length > 0) {
      const [{ data: revs }, { data: photos }] = await Promise.all([
        supabase
          .from("reviews")
          .select("rating")
          .in("vendor_id", ids)
          // Vendor profile header averages the host's reviews of
          // this vendor — not the vendor's outgoing ratings of
          // hosts. Otherwise the header score lies.
          .eq("rater_role", "host"),
        supabase
          .from("vendor_portfolio_images")
          .select("vendor_id, storage_path, display_order, created_at")
          .in("vendor_id", ids)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);
      const ratings = (revs as Array<{ rating: number }> | null) ?? [];
      setRatingAvg(
        ratings.length === 0
          ? null
          : ratings.reduce((s, r) => s + r.rating, 0) / ratings.length,
      );
      const heroes: Record<string, string> = {};
      for (const row of (photos as Array<{
        vendor_id: string;
        storage_path: string | null;
      }> | null) ?? []) {
        if (!heroes[row.vendor_id] && row.storage_path) {
          const { data: pub } = supabase.storage
            .from("vendor-portfolios")
            .getPublicUrl(row.storage_path);
          heroes[row.vendor_id] = pub.publicUrl;
        }
      }
      setHeroByListing(heroes);
    } else {
      setRatingAvg(null);
      setHeroByListing({});
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Listing cap via RPC (covers the unlimited_listings grandfather
  // flag, which the client can't derive from tier alone). Re-runs
  // when the tier flips so an upgrade unlocks the button live.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any)
      .rpc("user_listing_cap", { p_user_id: user.id })
      .then(({ data }: { data: number | null }) => {
        if (!cancelled) setListingCap(typeof data === "number" ? data : null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, tier]);

  const memberSince = useMemo(() => {
    const stamp = account?.created_at ?? primary?.created_at ?? null;
    if (!stamp) return "—";
    return String(new Date(stamp).getFullYear());
  }, [account?.created_at, primary?.created_at]);

  function openListingWizard() {
    if (!user?.id) return;
    setListingWizardOpen(true);
  }

  async function onShare() {
    if (!primary) return;
    const slugOrId = primary.slug ?? primary.id;
    const url = `${window.location.origin}/vendors/${slugOrId}`;
    const text = t("profile.shareText", {
      name: primary.business_name ?? t("profile.shareFallback"),
    });
    if (
      typeof navigator !== "undefined" &&
      typeof (navigator as Navigator & { share?: unknown }).share === "function"
    ) {
      try {
        await (
          navigator as Navigator & {
            share: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
          }
        ).share({ title: text, text, url });
        return;
      } catch {
        // user-cancelled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("profile.linkCopied"));
    } catch {
      toast.info(url);
    }
  }

  const initials = useMemo(() => {
    const n = account?.business_name ?? user?.email ?? "V";
    return n.trim()[0]?.toUpperCase() ?? "V";
  }, [account?.business_name, user?.email]);

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={vendorNavItems}
        title={t("profile.sidebarTitle")}
        backPath="/vendor/me"
      />
      <main className="min-w-0 flex-1 pb-24 lg:pb-0">
        <div className="backdrop-blur-sm px-5 md:px-8 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-editorial text-3xl">{t("profile.title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("profile.subtitle")}
              </p>
            </div>
            <NotificationBell variant="light" />
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
          {loading && !primary ? (
            <Skeleton className="h-44 w-full rounded-2xl" />
          ) : (
            <HeaderCard
              initials={initials}
              logoUrl={account?.logo_url ?? null}
              businessName={account?.business_name?.trim() || t("profile.yourBusiness")}
              bio={account?.bio ?? null}
              memberSince={memberSince}
              verified={!!primary?.verified_at}
              studioVerified={studioVerified}
              ratingAvg={ratingAvg}
              onShare={onShare}
            />
          )}

          <div>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-md" />
            ) : (
              <ListingsList
                listings={listings}
                heroByListing={heroByListing}
                listingCap={listingCap}
                onAddListing={openListingWizard}
                onEditListing={setEditingVendorId}
              />
            )}
          </div>
        </div>
      </main>
      <MobileNav items={vendorNavItems} />

      {listingWizardOpen && user ? (
        <ListingWizardModal
          userId={user.id}
          onClose={() => setListingWizardOpen(false)}
          onPublished={() => {
            setListingWizardOpen(false);
            load();
          }}
        />
      ) : null}

      {editingVendorId ? (
        <EditListingModal
          vendorId={editingVendorId}
          onClose={() => setEditingVendorId(null)}
          onSaved={() => {
            setEditingVendorId(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function HeaderCard({
  initials,
  logoUrl,
  businessName,
  bio,
  memberSince,
  verified,
  studioVerified,
  ratingAvg,
  onShare,
}: {
  initials: string;
  logoUrl: string | null;
  businessName: string;
  bio: string | null;
  memberSince: string;
  verified: boolean;
  studioVerified: boolean;
  ratingAvg: number | null;
  onShare: () => void;
}) {
  const { t } = useTranslation("vendorHome");
  return (
    <BrandCardShell businessName={businessName} bio={bio}>
      <div className="flex flex-col sm:flex-row gap-5 items-start">
        <div className="relative shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={businessName}
              className="w-24 h-24 rounded-full object-cover bg-secondary"
            />
          ) : (
            // Neutral person silhouette default (no logo set).
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
              <User className="w-12 h-12" strokeWidth={1.5} style={{ color: "#9b948a" }} aria-hidden />
            </div>
          )}
          {verified ? (
            <div className="absolute -right-1 bottom-1 w-7 h-7 rounded-full bg-card border-2 border-background flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-accent" />
            </div>
          ) : null}
          {/* Studio starburst seal — floating just outside the logo,
              no white background. The badge's own blue seal carries
              the visual weight; wrapping it in a white ring made it
              look like a separate UI element. */}
          {studioVerified ? (
            <div className="absolute -right-2 -top-2" aria-hidden>
              <StudioVerifiedBadge />
            </div>
          ) : null}
        </div>
        {/* w-full: in the phone column layout (items-start) a flex child
            otherwise sizes to its text, so a long name overflowed the card. */}
        <div className="w-full sm:w-auto flex-1 min-w-0 pl-16 sm:pl-0">
          <h2 className="font-editorial text-2xl text-foreground break-words">
            {businessName}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-2 max-w-xs">
            <Stat
              label={t("profile.rating")}
              value={ratingAvg != null ? ratingAvg.toFixed(1) : "—"}
            />
            <Stat label={t("profile.joined")} value={memberSince} />
          </div>
        </div>
        <div className="shrink-0 flex flex-col gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            size="sm"
            onClick={onShare}
          >
            <Share2 className="h-3.5 w-3.5 mr-1" />
            {t("profile.share")}
          </Button>
          <Link to="/vendor/edit-profile">
            <Button variant="outline" className="rounded-full" size="sm">
              <Edit3 className="h-3.5 w-3.5 mr-1" />
              {t("profile.editIdentity")}
            </Button>
          </Link>
        </div>
      </div>
    </BrandCardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center sm:items-start">
      <span className="text-lg font-semibold tnum">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ListingsList({
  listings,
  heroByListing,
  listingCap,
  onAddListing,
  onEditListing,
}: {
  listings: VendorRow[];
  heroByListing: Record<string, string>;
  /** Plan cap (Free 1 / Pro 4 / Premium 10); null = unlimited. */
  listingCap: number | null;
  onAddListing: () => void;
  onEditListing: (vendorId: string) => void;
}) {
  const { t } = useTranslation("vendorHome");
  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <p className="text-sm text-muted-foreground mb-3">{t("profile.noListing")}</p>
        <Button onClick={onAddListing}>{t("profile.createListing")}</Button>
      </div>
    );
  }
  const underCap = listingCap === null || listings.length < listingCap;
  return (
    <div>
      {/* Plan-based listing caps: Free 1 / Pro 4 / Premium 10. The
          "New listing" button shows while the account is under its
          cap; at cap it swaps for an upgrade hint. The same cap is
          enforced server-side (trg_enforce_listing_cap). */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-muted-foreground tnum">
          {listingCap === null
            ? t("profile.count", { count: listings.length })
            : listingCap === 1 && listings.length === 1
              ? t("profile.countOfCapOne", { n: listings.length, cap: listingCap })
              : t("profile.countOfCap", { n: listings.length, cap: listingCap })}
        </p>
        {underCap ? (
          <Button size="sm" variant="outline" onClick={onAddListing}>
            {t("profile.newListing")}
          </Button>
        ) : (
          <Link
            to="/vendor/subscription"
            className="text-xs font-medium underline underline-offset-2 text-foreground"
          >
            {t("profile.upgrade")}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
        {listings.map((l) => (
          <ListingDirectoryCard
            key={l.id}
            listing={l}
            heroUrl={heroByListing[l.id] ?? null}
            onEdit={onEditListing}
          />
        ))}
      </div>
    </div>
  );
}

// Listing card as it appears on the public /vendors directory:
// cover photo on top (4:3), name + category · location + price
// below. Status pill in the top-left so the vendor sees whether
// the listing is Live / Pending / Rejected at a glance.
//
// Tap behavior: opens an in-place preview modal (read-only) instead
// of navigating to the public /vendors/<slug> page. Vendors want a
// quick "what does this look like?" without losing the dashboard
// context. The modal exposes the public page as a secondary action
// for vendors who do want to leave.
function ListingDirectoryCard({
  listing,
  heroUrl,
  onEdit,
}: {
  listing: VendorRow;
  heroUrl: string | null;
  onEdit: (vendorId: string) => void;
}) {
  const { t } = useTranslation("vendorHome");
  const priceLabels = usePriceLabels();
  const categoryNames = useCategoryNames();
  const [previewOpen, setPreviewOpen] = useState(false);
  const name = listing.business_name ?? t("profile.listing");
  const price =
    priceLabels.listingPrice(listing.price_min_cents, listing.price_max_cents) || null;
  const pricingModels = priceLabels.pricingModels(listing.pricing_models);
  const statusLabel =
    listing.application_status === "approved"
      ? t("profile.status.live")
      : listing.application_status === "pending"
        ? t("profile.status.pending")
        : listing.application_status === "rejected"
          ? t("profile.status.rejected")
          : t("profile.status.draft");
  const statusTone =
    listing.application_status === "approved"
      ? "bg-primary text-primary-foreground border-transparent"
      : listing.application_status === "rejected"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : listing.application_status === "pending"
          ? "bg-pending text-accent border-transparent"
          : "bg-muted text-foreground border-transparent";
  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="block group text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-sm"
        aria-label={t("profile.previewAria", { name })}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-sm mb-3 bg-muted">
          {heroUrl ? (
            <img
              src={heroUrl}
              alt={name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
              <span className="text-xs">{t("profile.noPhotos")}</span>
            </div>
          )}
          <span
            className={`absolute top-2 left-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone}`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="px-1">
          <p className="text-sm font-medium leading-tight line-clamp-1">{name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {[listing.category ? categoryNames.sub(listing.category) : null, listing.location]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {price ? (
            <p className="text-xs text-foreground mt-0.5 tnum">{price}</p>
          ) : null}
          {pricingModels && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {pricingModels}
            </p>
          )}
        </div>
      </button>
      <ListingPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        listing={listing}
        heroUrl={heroUrl}
        statusLabel={statusLabel}
        statusTone={statusTone}
        price={price}
        onEdit={() => onEdit(listing.id)}
      />
    </>
  );
}

// Read-only preview of a listing — renders the actual public
// /vendors/<slug> page inside an iframe so the vendor sees exactly
// what visitors see (packages, brand card, portfolio grid, FAQ,
// reviews, etc.) without us maintaining a second copy of the layout.
//
// `?preview=1` is a hint the public page can read to suppress
// interactive surfaces (e.g. the "Send inquiry" button) — purely
// optional from this side; the iframe still works without it.
//
// Non-approved listings (draft/pending/rejected) don't have a
// public page yet, so we fall back to a minimal preview that
// surfaces the listing's own fields directly.
function ListingPreviewModal({
  open,
  onOpenChange,
  listing,
  heroUrl,
  statusLabel,
  statusTone,
  price,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: VendorRow;
  heroUrl: string | null;
  statusLabel: string;
  statusTone: string;
  price: string | null;
  onEdit: () => void;
}) {
  const { t } = useTranslation("vendorHome");
  const categoryNames = useCategoryNames();
  const name = listing.business_name ?? t("profile.listing");
  const isApproved = listing.application_status === "approved";
  // The iframe cold-boots the whole app, so it's blank for a beat before
  // React mounts. Show a loader over it until onLoad fires.
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const publicHref = `/vendors/${listing.slug ?? listing.id}`;
  const iframeHref = `${publicHref}?preview=1`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1100px,95vw)] w-[95vw] rounded-3xl p-0 overflow-hidden h-[92vh] flex flex-col">
        {/* Slim header bar so the status + name stay visible above
            the iframe; everything else lives inside the public page. */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone}`}
            >
              {statusLabel}
            </span>
            <DialogTitle className="font-editorial text-base truncate">
              {name}
            </DialogTitle>
            {listing.verified_at ? (
              <CheckCircle2
                className="w-4 h-4 text-accent shrink-0"
                aria-label={t("profile.verified")}
              />
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full shrink-0 mr-8"
            onClick={() => {
              onOpenChange(false);
              onEdit();
            }}
          >
            <Edit3 className="h-3.5 w-3.5 mr-1" />
            {t("profile.editListing")}
          </Button>
        </div>

        <DialogDescription className="sr-only">
          {t("profile.previewDescription")}
        </DialogDescription>

        {/* Body: live public page for approved listings; fallback
            preview for everything else. */}
        {isApproved ? (
          <div className="relative flex-1 min-h-0">
            {!iframeLoaded && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("profile.loadingPreview")}</p>
              </div>
            )}
            <iframe
              src={iframeHref}
              title={t("profile.previewTitle", { name })}
              onLoad={() => setIframeLoaded(true)}
              className="w-full h-full border-0 bg-background"
              // Same-origin so the public page can use its normal
              // Supabase session/cookies; sandbox is implied by the
              // existing CSP rather than spelled out here.
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="relative bg-muted aspect-[16/9]">
              {heroUrl ? (
                <img
                  src={heroUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  {t("profile.noPhotos")}
                </div>
              )}
            </div>
            <div className="px-6 pt-5 pb-6 max-w-3xl mx-auto">
              <p className="font-label text-muted-foreground text-xs mb-1">
                {t("profile.unpublished")}
              </p>
              <h2 className="font-editorial text-3xl break-words">{name}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {[listing.category ? categoryNames.sub(listing.category) : null, listing.location]
                  .filter(Boolean)
                  .join(" · ") || t("profile.noCategoryLocation")}
              </p>
              {price ? (
                <p className="mt-3 text-sm font-medium tnum">{price}</p>
              ) : null}
              {listing.bio ? (
                <p className="mt-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {listing.bio}
                </p>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground italic">
                  {t("profile.noBio")}
                </p>
              )}
              <p className="mt-6 text-xs text-muted-foreground">
                {t("profile.approvalNote")}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
