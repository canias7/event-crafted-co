import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  Edit2,
  Eye,
  ExternalLink,
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
import { VerificationManager } from "@/components/vendor/VerificationManager";
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
import { VendorShareKit } from "@/components/vendor/VendorShareKit";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VENDOR_PROFILE_HUB_TABS } from "@/data/hubTabs";

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
  intro_video_url: string | null;
  weekly_digest_enabled: boolean | null;
  slug: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
}

export default function VendorProfilePage() {
  const { user, vendorMemberships } = useAuth();
  const membership = vendorMemberships[0] ?? null;
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  // Profile tab = identity / account; Listing tab = the customer-
  // facing surface. Both tabs share state + the same save handler;
  // each renders a different slice of the form + section managers.
  const route = useLocation();
  const isListing = route.pathname === "/vendor/listing";
  const isProfile = !isListing;
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
    // If the user has a team membership, look up the profile by vendor_id
    // (works for both owners and team members). Otherwise fall back to the
    // user_id lookup so a fresh user with no profile still hits the create
    // flow.
    const query = membership?.vendor_id
      ? supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, application_status, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle",
          )
          .eq("id", membership.vendor_id)
          .maybeSingle()
      : supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, application_status, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle",
          )
          .eq("user_id", user.id)
          .maybeSingle();
    query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        toast.error(`Couldn't load your profile: ${error.message}`);
      }
      const p = (data as VendorProfile | null) ?? null;
      setProfile(p);
      applyToForm(p);
      // Persist the post-publish preview across reloads + tab
      // switches: if the loaded profile is already approved, drop
      // the user straight onto the preview card. Edit on that card
      // flips this back to false so the form re-mounts.
      setPublishedRecently(p?.application_status === "approved");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user, membership?.vendor_id]);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_profiles")
        .insert({ user_id: user.id, ...payload })
        .select(
          "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, application_status, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle",
        )
        .single();
      setCreating(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Profile created");
      setProfile(data as VendorProfile);
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
                {isListing ? "Listing" : "Profile"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isListing
                  ? "Edit what hosts see when they open your listing"
                  : "Your business identity + public URL"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {profile?.verified_at ? (
                <Badge className="bg-accent/15 text-accent border border-accent/30">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                  Verified
                </Badge>
              ) : profile ? (
                <Badge variant="outline">Pending review</Badge>
              ) : null}
              {profile && (
                <Link to={`/vendors/${profile.id}`} target="_blank">
                  <Button variant="outline" size="sm" className="rounded-full h-8">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Preview
                  </Button>
                </Link>
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
                  Publish
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4">
            <SubNavTabs tabs={VENDOR_PROFILE_HUB_TABS} />
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
                  const { error } = await supabase
                    .from("vendor_profiles")
                    .delete()
                    .eq("id", profile.id);
                  setDeleting(false);
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  toast.success("Listing deleted");
                  setProfile(null);
                  setPublishedRecently(false);
                  applyToForm(null);
                }}
              />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business-name">
                    Business name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="business-name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">
                    Category <span className="text-destructive">*</span>
                  </Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category" className="h-11">
                      <SelectValue placeholder="Choose a category" />
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
                </div>
              </div>

              {isListing && (
              <div className="space-y-2">
                <Label htmlFor="bio">Short bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="One or two sentences about your style and approach."
                />
              </div>
              )}

              {isListing && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base-price">Starting price ($)</Label>
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
                    Service radius (miles)
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

              {isListing && (
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Brooklyn, NY"
                  className="h-11"
                />
              </div>
              )}

              {isListing && (
              <div className="space-y-2">
                <Label htmlFor="portfolio-summary">Portfolio summary</Label>
                <Textarea
                  id="portfolio-summary"
                  value={portfolioSummary}
                  onChange={(e) => setPortfolioSummary(e.target.value)}
                  rows={5}
                  placeholder="What makes your work distinctive? Notable clients, signature aesthetic, typical event size."
                />
              </div>
              )}

              {isListing && (
              <div className="space-y-2">
                <Label htmlFor="intro-video">Intro video URL (optional)</Label>
                <Input
                  id="intro-video"
                  type="url"
                  value={introVideoUrl}
                  onChange={(e) => setIntroVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=… or https://vimeo.com/…"
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground pt-1">
                  YouTube, Vimeo, or a direct .mp4 link. Embeds at the top
                  of your public profile.
                </p>
              </div>
              )}

              {isProfile && (
              /* Social handles — render as the Contact / Socials row in
                 the public sidebar via SocialEmbedCard. Stored without
                 the leading "@" so URL composition stays clean. */
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="instagram-handle">Instagram handle</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tnum">@</span>
                    <Input
                      id="instagram-handle"
                      value={instagramHandle}
                      onChange={(e) => setInstagramHandle(e.target.value)}
                      placeholder="yourstudio"
                      className="h-11 flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tiktok-handle">TikTok handle</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tnum">@</span>
                    <Input
                      id="tiktok-handle"
                      value={tiktokHandle}
                      onChange={(e) => setTiktokHandle(e.target.value)}
                      placeholder="yourstudio"
                      className="h-11 flex-1"
                    />
                  </div>
                </div>
              </div>
              )}

              {isProfile && (
              <div className="space-y-2">
                <Label htmlFor="slug">Public URL slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tnum whitespace-nowrap">
                    vendora.events/v/
                  </span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="luminara-photography"
                    className="h-11 flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Lowercase letters, numbers, and hyphens. Auto-generated
                  from your business name if you leave it blank.
                  {profile?.slug && (
                    <>
                      {" "}
                      <a
                        href={`/v/${profile.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        Open current URL
                      </a>
                    </>
                  )}
                </p>
                {profile?.slug && (
                  <div className="pt-1">
                    <VendorShareKit
                      slug={profile.slug}
                      businessName={profile.business_name ?? "us"}
                    />
                  </div>
                )}
              </div>
              )}

              {isProfile && profile && canEdit && (
                <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium mb-0.5">
                      Weekly recap email
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      One Monday-morning email with last week's inquiries,
                      bookings, reviews, and response time.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.weekly_digest_enabled !== false}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      const prev = profile.weekly_digest_enabled;
                      setProfile({
                        ...profile,
                        weekly_digest_enabled: next,
                      });
                      const { error } = await supabase
                        .from("vendor_profiles")
                        .update({ weekly_digest_enabled: next })
                        .eq("id", profile.id);
                      if (error) {
                        setProfile({
                          ...profile,
                          weekly_digest_enabled: prev,
                        });
                        toast.error(error.message);
                        return;
                      }
                      toast.success(
                        next ? "Weekly recap on" : "Weekly recap off",
                      );
                    }}
                    className="w-10 h-5 rounded-full appearance-none bg-secondary checked:bg-foreground transition-colors relative cursor-pointer before:content-[''] before:absolute before:left-0.5 before:top-0.5 before:w-4 before:h-4 before:rounded-full before:bg-background before:transition-transform checked:before:translate-x-5"
                    aria-label="Weekly recap email"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                {!canEdit && profile && (
                  <p className="text-xs text-muted-foreground">
                    View only — ask the team owner to make changes.
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
                  {profile ? "Save changes" : "Create profile"}
                </Button>
              </div>
            </form>
          )}

          {profile && isProfile && (
            <>
              <div className="mt-12 pt-10 border-t border-border">
                <VerificationManager
                  vendorId={profile.id}
                  canEdit={canEdit}
                />
              </div>
            </>
          )}

          {profile && isListing && !publishedRecently && (
            <>
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
              {canEdit && (
                <div className="mt-12 pt-10 border-t border-border">
                  <AvailabilityLinkCard />
                </div>
              )}
              <div className="mt-12 pt-10 border-t border-border">
                <VendorRecommendationManager
                  vendorId={profile.id}
                  canEdit={canEdit}
                />
              </div>
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
  return (
    <div className="rounded-sm border border-accent/40 bg-accent/5 p-5 max-w-md">
      <p className="font-label text-accent mb-3 inline-flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" />
        Listing live
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
                From ${(profile.base_price_cents / 100).toLocaleString()}
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
            View
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
            Edit
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

function AvailabilityLinkCard() {
  return (
    <div>
      <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
        <CalendarIcon className="w-3 h-3" />
        Availability
      </p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        Block specific dates, set recurring weekly availability, and
        manage buffer times around appointments.
      </p>
      <Link to="/vendor/availability" className="inline-block mt-4">
        <Button variant="outline" size="sm" className="rounded-full">
          <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
          Open availability calendar
        </Button>
      </Link>
    </div>
  );
}
