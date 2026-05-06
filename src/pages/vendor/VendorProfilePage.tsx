import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Edit2,
  Eye,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { PortfolioUploader } from "@/components/vendor/PortfolioUploader";
import { PackageManager } from "@/components/vendor/PackageManager";
import { VendorRecommendationManager } from "@/components/vendor/VendorRecommendationManager";
import { IntakeFormEditor } from "@/components/vendor/IntakeFormEditor";
import { VendorFaqsManager } from "@/components/vendor/VendorFaqsManager";
import { VendorTeamManager } from "@/components/vendor/VendorTeamManager";
import { VendorPolicyEditor } from "@/components/vendor/VendorPolicyEditor";
import { ShowcaseClipsManager } from "@/components/vendor/ShowcaseClipsManager";
import { ImportedReviewsManager } from "@/components/vendor/ImportedReviewsManager";
import { CategoryAttributesEditor } from "@/components/vendor/CategoryAttributesEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_GROUPS } from "@/data/categoryTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { vendorNavItems as navItems } from "@/data/navItems";
import { invalidateVendorsCache } from "@/hooks/useVendors";

// Sub-categories rendered in the dropdown grouped by parent group.
// Source of truth lives in categoryTaxonomy.ts — adding a sub there
// flows through to this dropdown automatically.

interface VendorProfile {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  base_price_cents: number | null;
  location: string | null;
  service_radius_miles: number | null;
  portfolio_summary: string | null;
  verified_at: string | null;
  /** "draft" | "pending" | "approved" | "rejected". When "approved"
   *  the listing is live in the directory; the dashboard renders
   *  the preview card instead of the editor on this tab. */
  application_status: string | null;
  application_review_notes: string | null;
  intro_video_url: string | null;
  weekly_digest_enabled: boolean | null;
  slug: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
}

const VENDOR_PROFILE_COLS =
  "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, application_status, application_review_notes, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle";

export default function VendorProfilePage() {
  const { t } = useTranslation();
  const { user, vendorMemberships } = useAuth();
  const membership = vendorMemberships[0] ?? null;
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  // Listing-only page now — the separate Profile tab was deleted, so
  // VendorProfilePage renders the customer-facing builder regardless
  // of path. Keep the constant true so the conditional renders for
  // category-gated sections, the publish CTA, etc. stay readable.
  const isListing = true;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  // True for the rest of the session after the vendor clicks Publish
  // — shows the post-publish preview card on the Listing tab so they
  // can confirm what just went live + edit / delete in-place.
  const [publishedRecently, setPublishedRecently] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form fields
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [bio, setBio] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [location, setLocation] = useState("");
  const [serviceRadius, setServiceRadius] = useState("");
  const [portfolioSummary, setPortfolioSummary] = useState("");
  const [introVideoUrl, setIntroVideoUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [tiktokHandle, setTiktokHandle] = useState("");

  function applyToForm(p: VendorProfile | null) {
    setBusinessName(p?.business_name ?? "");
    setCategory(p?.category ?? "");
    setBio(p?.bio ?? "");
    setBasePrice(
      p?.base_price_cents != null ? (p.base_price_cents / 100).toString() : "",
    );
    setLocation(p?.location ?? "");
    setServiceRadius(
      p?.service_radius_miles != null ? p.service_radius_miles.toString() : "",
    );
    setPortfolioSummary(p?.portfolio_summary ?? "");
    setIntroVideoUrl(p?.intro_video_url ?? "");
    setSlug(p?.slug ?? "");
    setInstagramHandle(p?.instagram_handle ?? "");
    setTiktokHandle(p?.tiktok_handle ?? "");
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    // Always try user_id first — covers the common case where the
    // signed-in user owns their own vendor row. Membership state can
    // go stale (e.g. cached vendor_id pointing at a deleted profile),
    // so falling back to membership.vendor_id only when user_id
    // returns nothing keeps team-member access working without
    // triggering a phantom "create profile" path that would later
    // collide with the real row on insert.
    (async () => {
      const own = await supabase
        .from("vendor_profiles")
        .select(VENDOR_PROFILE_COLS)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      let data = own.data as VendorProfile | null;
      let error = own.error;
      if (!data && !error && membership?.vendor_id) {
        const team = await supabase
          .from("vendor_profiles")
          .select(VENDOR_PROFILE_COLS)
          .eq("id", membership.vendor_id)
          .maybeSingle();
        if (cancelled) return;
        data = team.data as VendorProfile | null;
        error = team.error;
      }
      // Soft-deleted rows (the listing's Delete button flipped status to
      // 'rejected' with this sentinel because the hard-delete RPC isn't
      // deployed yet) should look gone to the dashboard — show the
      // create-profile flow instead of the rejection banner.
      if (data?.application_review_notes === "__deleted_by_owner__") {
        data = null;
      }
      if (error) {
        toast.error(`Couldn't load your profile: ${error.message}`);
      }
      setProfile(data);
      applyToForm(data);
      // Persist the post-publish preview across reloads + tab
      // switches: if the loaded profile is already approved, drop
      // the user straight onto the preview card. Edit on that card
      // flips this back to false so the form re-mounts.
      setPublishedRecently(data?.application_status === "approved");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, membership?.vendor_id]);

  // Auto-create a draft listing the moment the vendor picks a
  // category on the Listing tab, so the section managers (packages,
  // photos, team, availability, reviews, recommendations, and the
  // category-specific Details editor) become available immediately
  // instead of after a separate Save click. Also recovers any
  // soft-deleted row tied to this user_id by clearing the deletion
  // sentinel and resetting the row to draft state.
  useEffect(() => {
    if (!user || !isListing || !category || profile) return;
    if (loading || saving || creating) return;
    let cancelled = false;
    (async () => {
      setCreating(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ins = await (supabase as any)
        .from("vendor_profiles")
        .insert({
          user_id: user.id,
          business_name: businessName.trim() || "",
          category,
          application_status: "draft",
        })
        .select(VENDOR_PROFILE_COLS)
        .single();
      if (cancelled) {
        setCreating(false);
        return;
      }
      if (ins.data) {
        const created = ins.data as VendorProfile;
        setProfile(created);
        applyToForm(created);
      } else if (ins.error?.code === "23505") {
        // Existing row (likely soft-deleted earlier) — fetch + revive.
        const existing = await supabase
          .from("vendor_profiles")
          .select(VENDOR_PROFILE_COLS)
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) {
          setCreating(false);
          return;
        }
        if (existing.data) {
          const row = existing.data as VendorProfile;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("vendor_profiles")
            .update({
              category,
              application_status: "draft",
              application_review_notes: null,
            })
            .eq("id", row.id);
          const revived: VendorProfile = {
            ...row,
            category,
            application_status: "draft",
            application_review_notes: null,
          };
          setProfile(revived);
          applyToForm(revived);
        }
      }
      setCreating(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isListing, category, profile?.id]);

  async function handleSave(
    e: React.FormEvent,
    opts?: { publish?: boolean },
  ) {
    e.preventDefault();
    if (!user) return;
    if (!businessName.trim() || !category) {
      toast.error("Business name and category are required");
      return;
    }

    const payload = {
      business_name: businessName.trim(),
      category,
      bio: bio.trim() || null,
      base_price_cents: basePrice
        ? Math.round(Number.parseFloat(basePrice) * 100)
        : null,
      location: location.trim() || null,
      service_radius_miles: serviceRadius
        ? Number.parseInt(serviceRadius, 10)
        : null,
      portfolio_summary: portfolioSummary.trim() || null,
      intro_video_url: introVideoUrl.trim() || null,
      // Slug normalization happens server-side via the trigger when
      // omitted; if the vendor sets one, we sanitize lightly here so
      // they get instant feedback in the form.
      slug:
        slug.trim()
          ? slug
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "") || null
          : null,
      // Social handles are stored without the leading "@" so the
      // public SocialEmbedCard can compose URLs cleanly.
      instagram_handle: instagramHandle.trim().replace(/^@+/, "") || null,
      tiktok_handle: tiktokHandle.trim().replace(/^@+/, "") || null,
      // Hitting Publish flips the listing to approved so it shows up
      // in the public directory immediately. Regular Save leaves the
      // existing status untouched (typed as `any` because
      // application_status isn't in the generated supabase types).
      ...(opts?.publish ? { application_status: "approved" } : {}),
    } as Record<string, unknown>;

    if (profile) {
      setSaving(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_profiles")
        .update(payload)
        .eq("id", profile.id);
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(opts?.publish ? "Listing published" : "Profile saved");
      setProfile({ ...profile, ...payload });
      if (opts?.publish) {
        setPublishedRecently(true);
        // Drop the vendors-list cache so the directory + the public
        // detail page pick up the just-approved row on next render
        // without a full page reload.
        invalidateVendorsCache();
        // Wait a tick for the preview to render, then scroll it into view
        // so the post-publish card lands in front of the user without
        // them having to hunt for it.
        setTimeout(() => {
          document
            .getElementById("listing-preview")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
      // Re-geocode if location changed. Fire-and-forget — failure to
      // geocode shouldn't block the save toast.
      if (payload.location) {
        supabase.functions
          .invoke("geocode-vendor", { body: { vendorId: profile.id } })
          .catch(() => {});
      }
    } else {
      setCreating(true);
      const SELECT_COLS =
        "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, application_status, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_profiles")
        .insert({ user_id: user.id, ...payload })
        .select(SELECT_COLS)
        .single();
      // Recover from the rare case where the load query missed an
      // existing row (e.g. RLS hiccup, race with a concurrent tab):
      // a duplicate user_id surfaces as Postgres error 23505, and we
      // can salvage the save by re-fetching the row and updating it
      // in place rather than dropping the vendor's edits on the floor.
      if (error?.code === "23505") {
        const existing = await supabase
          .from("vendor_profiles")
          .select(SELECT_COLS)
          .eq("user_id", user.id)
          .maybeSingle();
        if (existing.data) {
          // Reviving a soft-deleted row: also clear the deletion
          // sentinel + the rejected status so the dashboard treats
          // the listing as live again on next load.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const upd = await (supabase as any)
            .from("vendor_profiles")
            .update({
              ...payload,
              application_review_notes: null,
            })
            .eq("id", (existing.data as VendorProfile).id);
          setCreating(false);
          if (upd.error) {
            toast.error(upd.error.message);
            return;
          }
          const merged = {
            ...(existing.data as VendorProfile),
            ...payload,
          } as VendorProfile;
          setProfile(merged);
          applyToForm(merged);
          if (opts?.publish) {
            setPublishedRecently(true);
            invalidateVendorsCache();
          }
          toast.success(opts?.publish ? "Listing published" : "Profile saved");
          return;
        }
      }
      setCreating(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Profile created");
      setProfile(data as VendorProfile);
      applyToForm(data as VendorProfile);
      if (opts?.publish) {
        setPublishedRecently(true);
        invalidateVendorsCache();
      }
      if (payload.location && data) {
        supabase.functions
          .invoke("geocode-vendor", {
            body: { vendorId: (data as VendorProfile).id },
          })
          .catch(() => {});
      }
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-xl">
                {t("vendor_listing.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("vendor_listing.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {profile?.verified_at && (
                <Badge className="bg-accent/15 text-accent border border-accent/30">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                  {t("vendor_listing.verified")}
                </Badge>
              )}
              {/* Publish — Listing tab only. Submits the same payload
                  as the form's Save button, but with "publish" toast
                  messaging so the affordance reads as the moment the
                  listing goes live to hosts. */}
              {isListing && profile && canEdit && (
                <Button
                  size="sm"
                  className="rounded-full h-8 bg-foreground text-background hover:bg-foreground/90"
                  disabled={saving || creating}
                  onClick={() =>
                    handleSave(
                      { preventDefault: () => {} } as React.FormEvent,
                      { publish: true },
                    )
                  }
                >
                  {(saving || creating) && (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  )}
                  {t("vendor_listing.publish")}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : isListing && publishedRecently && profile ? (
            /* Post-publish state takes over the whole Listing tab —
               form + section managers hide so the vendor sees just
               the live preview card with Eye / Edit / Trash actions.
               Edit returns to the form; Delete drops the row;
               Eye opens the public profile in a new tab. */
            <div id="listing-preview">
              <ListingPreviewCard
                profile={profile}
                saving={deleting}
                onView={() => {
                  // Full-reload navigation — same window, but reboots
                  // the SPA so useVendors fetches fresh and the
                  // just-approved row is in the cache when
                  // VendorDetailPage mounts. Slight white-flash, but
                  // bullet-proof against any stale state from the
                  // dashboard's render tree.
                  window.location.assign(`/vendors/${profile.id}`);
                }}
                onEdit={() => {
                  setPublishedRecently(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onDelete={async () => {
                  if (
                    !window.confirm(
                      `Delete ${profile.business_name}? This removes your listing from the directory and cannot be undone.`,
                    )
                  ) {
                    return;
                  }
                  setDeleting(true);
                  // Call the SECURITY DEFINER RPC instead of a raw
                  // .delete(). The RPC does its own ownership check and
                  // bypasses RLS, so it works in environments where the
                  // DELETE policy migration hasn't run yet (Lovable's
                  // hosted Supabase has been silently dropping the
                  // direct delete without an error). Falls back to the
                  // verified .delete() path if the RPC isn't deployed.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const rpc = await (supabase as any).rpc(
                    "delete_my_vendor_profile",
                    { p_vendor_id: profile.id },
                  );
                  let succeeded = !rpc.error && rpc.data === true;
                  let errorMessage: string | null = rpc.error?.message ?? null;
                  // Function-not-found can come back several ways:
                  //   - Postgres 42883 (function does not exist)
                  //   - PostgREST PGRST202 ("could not find the function …
                  //     in the schema cache") when the migration ran but
                  //     the API hasn't refreshed its cache yet
                  //   - Plain message match for any other variant
                  // In all those cases, fall through to the table-level
                  // delete with row-count verification so we still get a
                  // real result either way.
                  const fnMissing =
                    !!rpc.error &&
                    (rpc.error.code === "42883" ||
                      rpc.error.code === "PGRST202" ||
                      /function .* does not exist/i.test(
                        rpc.error.message ?? "",
                      ) ||
                      /could not find the function/i.test(
                        rpc.error.message ?? "",
                      ) ||
                      /schema cache/i.test(rpc.error.message ?? ""));
                  if (!succeeded && fnMissing) {
                    const direct = await supabase
                      .from("vendor_profiles")
                      .delete()
                      .eq("id", profile.id)
                      .select("id");
                    if (direct.error) {
                      errorMessage = direct.error.message;
                    } else if (direct.data && direct.data.length > 0) {
                      succeeded = true;
                      errorMessage = null;
                    }
                  }
                  // Last-resort soft delete: when neither the RPC nor
                  // a direct delete actually removed the row, flip
                  // application_status off the directory and tag the
                  // row so the dashboard treats it as gone. UPDATE
                  // already has a working RLS policy, so this path
                  // works on the deployed Supabase even without the
                  // newer migrations. The hard delete will land on
                  // the next deploy and clean the row up for real.
                  if (!succeeded) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const soft = await (supabase as any)
                      .from("vendor_profiles")
                      .update({
                        application_status: "rejected",
                        application_review_notes: "__deleted_by_owner__",
                      })
                      .eq("id", profile.id)
                      .select("id");
                    if (!soft.error && soft.data && soft.data.length > 0) {
                      succeeded = true;
                      errorMessage = null;
                    } else if (soft.error) {
                      errorMessage = soft.error.message;
                    } else {
                      errorMessage =
                        "Couldn't delete — your account may not have permission. Refresh the page or contact support if it keeps failing.";
                    }
                  }
                  setDeleting(false);
                  if (!succeeded) {
                    toast.error(errorMessage ?? "Couldn't delete the listing");
                    return;
                  }
                  toast.success("Listing deleted");
                  invalidateVendorsCache();
                  setProfile(null);
                  setPublishedRecently(false);
                  applyToForm(null);
                }}
              />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              {/* Category sits at the top alone — the rest of the
                  Listing form (and the section managers below) only
                  reveals once a sub-category is picked. The dropdown
                  is grouped by main group, same shape as the public
                  Vendors nav on the landing page. */}
              <div className="space-y-2">
                <Label htmlFor="category">
                  {t("vendor_listing.category_label")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={category}
                  onValueChange={setCategory}
                  disabled={!!profile}
                >
                  <SelectTrigger
                    id="category"
                    className="h-11 disabled:opacity-100 disabled:cursor-not-allowed"
                  >
                    <SelectValue
                      placeholder={t("vendor_listing.category_placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_GROUPS.map((group) => (
                      <SelectGroup key={group.slug}>
                        <SelectLabel>{group.name}</SelectLabel>
                        {group.subs.map((sub) => (
                          <SelectItem key={sub} value={sub}>
                            {sub}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground pt-1">
                  {profile
                    ? t("vendor_listing.category_locked")
                    : t("vendor_listing.category_hint")}
                </p>
              </div>

              {isListing && !category && (
                <div className="rounded-sm border border-dashed border-border bg-card/40 p-8 text-center">
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    {t("vendor_listing.category_nudge")}
                  </p>
                </div>
              )}

              {category && (
                <div className="space-y-2">
                  <Label htmlFor="business-name">
                    {t("vendor_listing.business_name")}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="business-name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
              )}

              {isListing && category && (
                <div className="space-y-2">
                  <Label htmlFor="bio">{t("vendor_listing.short_bio")}</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    placeholder={t("vendor_listing.short_bio_placeholder")}
                  />
                </div>
              )}

              {isListing && category && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="base-price">
                      {t("vendor_listing.starting_price")}
                    </Label>
                    <Input
                      id="base-price"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="100"
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-radius">
                      {t("vendor_listing.service_radius")}
                    </Label>
                    <Input
                      id="service-radius"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={serviceRadius}
                      onChange={(e) => setServiceRadius(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
              )}

              {isListing && category && (
                <div className="space-y-2">
                  <Label htmlFor="location">
                    {t("vendor_listing.location")}
                  </Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t("vendor_listing.location_placeholder")}
                    className="h-11"
                  />
                </div>
              )}

              {isListing && category && (
                <div className="space-y-2">
                  <Label htmlFor="portfolio-summary">
                    {t("vendor_listing.portfolio_summary")}
                  </Label>
                  <Textarea
                    id="portfolio-summary"
                    value={portfolioSummary}
                    onChange={(e) => setPortfolioSummary(e.target.value)}
                    rows={5}
                    placeholder={t("vendor_listing.portfolio_placeholder")}
                  />
                </div>
              )}

              {isListing && category && (
                <div className="space-y-2">
                  <Label htmlFor="intro-video">
                    {t("vendor_listing.intro_video")}
                  </Label>
                  <Input
                    id="intro-video"
                    type="url"
                    value={introVideoUrl}
                    onChange={(e) => setIntroVideoUrl(e.target.value)}
                    placeholder={t("vendor_listing.intro_video_placeholder")}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground pt-1">
                    {t("vendor_listing.intro_video_hint")}
                  </p>
                </div>
              )}


              <div className="flex items-center justify-end gap-3 pt-2">
                {!canEdit && profile && (
                  <p className="text-xs text-muted-foreground">
                    {t("vendor_listing.view_only")}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={saving || creating || (!canEdit && !!profile)}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  {(saving || creating) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {/* While the row exists in 'draft' state with an
                      empty business_name, the form still reads as
                      pre-creation — keep "Create listing" until the
                      user has actually filled in the basics. */}
                  {profile && profile.business_name?.trim()
                    ? t("vendor_listing.save_changes")
                    : t("vendor_listing.create")}
                </Button>
              </div>
            </form>
          )}

          {profile && isListing && !publishedRecently && category && (
            <>
              {/* Universal sections — every vendor regardless of
                  category gets these. Order matches the user's
                  universal list: Pricing → Photos → Team →
                  Availability → Reviews → Recommendations.
                  ("About" is the bio + portfolio-summary fields up
                  in the form.) */}
              {/* Per-category Details — venue offerings, food types,
                  entertainment specialties, etc. Reads the schema for
                  the picked sub-category and renders a tailored form
                  saved into vendor_profiles.category_attributes. */}
              <div className="mt-12 pt-10 border-t border-border">
                <CategoryAttributesEditor
                  vendorId={profile.id}
                  category={profile.category}
                  canEdit={canEdit}
                />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <PackageManager vendorId={profile.id} canEdit={canEdit} />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <PortfolioUploader vendorId={profile.id} />
              </div>
              {canEdit && (
                <div className="mt-12 pt-10 border-t border-border">
                  <VendorTeamManager vendorId={profile.id} />
                </div>
              )}
              <div className="mt-12 pt-10 border-t border-border">
                <ImportedReviewsManager
                  vendorId={profile.id}
                  canEdit={canEdit}
                />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <VendorRecommendationManager
                  vendorId={profile.id}
                  canEdit={canEdit}
                />
              </div>

              {/* Optional sections — vendor can fill if useful but
                  not required to publish. Live below the universal
                  block so they don't crowd the primary editor. */}
              <div className="mt-12 pt-10 border-t border-border">
                <IntakeFormEditor vendorId={profile.id} canEdit={canEdit} />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <VendorFaqsManager vendorId={profile.id} canEdit={canEdit} />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <VendorPolicyEditor vendorId={profile.id} canEdit={canEdit} />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <ShowcaseClipsManager
                  vendorId={profile.id}
                  canEdit={canEdit}
                />
              </div>
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

// Small callout that points vendors to the dedicated availability
// editor (lives at /vendor/availability — full Calendar with
// recurring rules + one-off blocks). Mounted inline on the profile
// editor so the "Availability" section on the public profile has a
// clear hand-off from this single dashboard view.
// Compact post-publish preview — replaces the editor surface once
// the vendor clicks Publish. Three icon buttons: View opens the
// public listing in a new tab, Edit collapses the preview back to
// the form, Delete confirms then drops the row. Image is
// intentionally omitted; the directory's VendorCard renders the
// visual version using the per-sub categoryImageFallback art.
function ListingPreviewCard({
  profile,
  saving,
  onView,
  onEdit,
  onDelete,
}: {
  profile: VendorProfile;
  saving: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-sm border border-accent/40 bg-accent/5 p-5 max-w-md">
      <p className="font-label text-accent mb-3 inline-flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" />
        {t("vendor_listing.preview.live")}
      </p>
      <div className="space-y-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {profile.category}
          </p>
          <h3 className="font-display text-2xl mt-1 truncate">
            {profile.business_name}
          </h3>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-2 flex-wrap">
            {profile.location && <span>{profile.location}</span>}
            {profile.location && profile.base_price_cents != null && (
              <span className="text-foreground/30">·</span>
            )}
            {profile.base_price_cents != null && (
              <span>
                {t("vendor_listing.preview.from", {
                  amount: (
                    profile.base_price_cents / 100
                  ).toLocaleString(),
                })}
              </span>
            )}
          </div>
          {profile.bio && (
            <p className="text-sm text-foreground/75 mt-3 leading-relaxed line-clamp-2">
              {profile.bio}
            </p>
          )}
        </div>
        <div className="flex gap-2 pt-2 border-t border-accent/20">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onView}
            disabled={saving}
            className="rounded-full"
            aria-label="View public listing"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            {t("vendor_listing.preview.view")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={saving}
            className="rounded-full"
            aria-label="Edit listing"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            {t("vendor_listing.preview.edit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={saving}
            className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
            aria-label="Delete listing"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

