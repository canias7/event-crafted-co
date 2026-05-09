import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  DollarSign,
  Eye,
  Image as ImageIcon,
  Layers,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { PackageManager } from "@/components/vendor/PackageManager";
import { VendorRecommendationManager } from "@/components/vendor/VendorRecommendationManager";
import { VendorFaqsManager } from "@/components/vendor/VendorFaqsManager";
import { VendorTeamManager } from "@/components/vendor/VendorTeamManager";
import { VendorPolicyEditor } from "@/components/vendor/VendorPolicyEditor";
import { CategoryAttributesEditor } from "@/components/vendor/CategoryAttributesEditor";
import {
  VendorSocialComposer,
  type SocialKind,
} from "@/components/vendor/VendorSocialComposer";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { vendorNavItems as navItems } from "@/data/navItems";
import { invalidateVendorsCache } from "@/hooks/useVendors";

// Sub-categories rendered in the dropdown grouped by parent group.
// Source of truth lives in categoryTaxonomy.ts — adding a sub there
// flows through to this dropdown automatically.

interface VendorProfile {
  id: string;
  // Profile = exists from signup. business_name and category start null
  // and get filled in by the vendor as they build out their listing.
  business_name: string | null;
  category: string | null;
  bio: string | null;
  base_price_cents: number | null;
  location: string | null;
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
  logo_url: string | null;
}

const VENDOR_PROFILE_COLS =
  "id, business_name, category, bio, base_price_cents, location, verified_at, application_status, application_review_notes, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle, logo_url";

export default function VendorProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, vendorMemberships, signOut } = useAuth();
  const membership = vendorMemberships[0] ?? null;
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
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
  const [introVideoUrl, setIntroVideoUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [tiktokHandle, setTiktokHandle] = useState("");

  // Listing builder is a 3-step wizard now: About → Pricing → More.
  // Default to "about" so a fresh vendor lands on the basics first.
  const [listingTab, setListingTab] = useState<
    "about" | "pricing" | "more"
  >("about");

  // Outer IG-style tabs that wrap the entire page. The existing
  // editor (form + about/pricing/media/more) only renders under the
  // "listing" outer tab. The other three pull from public.vendor_posts
  // / vendor_reels / vendor_buzz so vendors can flip through their
  // social content the same way they do on mobile.
  type OuterTab = "grid" | "reels" | "buzz" | "listing";
  const [outerTab, setOuterTab] = useState<OuterTab>("listing");
  const [posts, setPosts] = useState<
    Array<{ id: string; image_url: string; caption: string | null; created_at: string }>
  >([]);
  const [reels, setReels] = useState<
    Array<{ id: string; video_url: string; caption: string | null; created_at: string }>
  >([]);
  const [buzz, setBuzz] = useState<
    Array<{ id: string; body: string; created_at: string }>
  >([]);
  // Composer modal — single component switches between post / reel /
  // buzz via the kind prop. Empty-state Create buttons + the inline
  // ones on populated grids both open it through this state.
  const [composerKind, setComposerKind] = useState<SocialKind | null>(null);
  // Lightbox: clicking a grid tile opens this; null when nothing is
  // open. Posts vs reels distinguished by the presence of video_url.
  const [openMedia, setOpenMedia] = useState<
    | {
        kind: "post";
        id: string;
        image_url: string;
        caption: string | null;
        created_at: string;
      }
    | {
        kind: "reel";
        id: string;
        video_url: string;
        caption: string | null;
        created_at: string;
      }
    | null
  >(null);

  // Create-button click handler. The profile row auto-exists from
  // signup (load effect inserts a stub if missing), so this just opens
  // the composer for the requested kind.
  function handleCreateClick(kind: SocialKind) {
    if (!profile?.id) {
      toast.info("Setting up your profile, try again in a second.");
      return;
    }
    setComposerKind(kind);
  }

  // Upload a new logo image to vendor-posts/<userId>/logo-<ts>.<ext>
  // and persist the public URL to vendor_profiles.logo_url. Reuses the
  // existing vendor-posts bucket so we don't have to provision new RLS
  // for a logo-only bucket.
  async function handleLogoFile(file: File) {
    if (!user?.id || !profile?.id) {
      toast.info("Hang on — your profile is still being set up.");
      return;
    }
    setLogoUploading(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("vendor-posts").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (up.error) {
      setLogoUploading(false);
      toast.error(up.error.message);
      return;
    }
    const { data: pub } = supabase.storage
      .from("vendor-posts")
      .getPublicUrl(path);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({ logo_url: pub.publicUrl })
      .eq("id", profile.id);
    setLogoUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProfile({ ...profile, logo_url: pub.publicUrl });
    toast.success("Logo updated");
  }

  function applyToForm(p: VendorProfile | null) {
    setBusinessName(p?.business_name ?? "");
    setCategory(p?.category ?? "");
    setBio(p?.bio ?? "");
    setBasePrice(
      p?.base_price_cents != null ? (p.base_price_cents / 100).toString() : "",
    );
    setLocation(p?.location ?? "");
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
      // Profile = exists from the moment the vendor signs in. If the
      // row doesn't exist yet (or was soft-deleted), insert a stub now
      // — business_name and category default to null until the vendor
      // fills them in via the Listing tab. This unlocks posts / reels /
      // buzz immediately since vendor_posts.vendor_id needs a real
      // vendor_profiles.id to FK against.
      if (!data && !error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stub = await (supabase as any)
          .from("vendor_profiles")
          .insert({ user_id: user.id, application_status: "draft" })
          .select(VENDOR_PROFILE_COLS)
          .single();
        if (cancelled) return;
        if (stub.data) {
          data = stub.data as VendorProfile;
        } else if (stub.error?.code === "23505") {
          // Race / soft-deleted row collision: fetch the existing row
          // and clear the deletion sentinel so it looks live again.
          const existing = await supabase
            .from("vendor_profiles")
            .select(VENDOR_PROFILE_COLS)
            .eq("user_id", user.id)
            .maybeSingle();
          if (cancelled) return;
          if (existing.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("vendor_profiles")
              .update({
                application_status: "draft",
                application_review_notes: null,
              })
              .eq("id", (existing.data as VendorProfile).id);
            data = {
              ...(existing.data as VendorProfile),
              application_status: "draft",
              application_review_notes: null,
            };
          }
        } else if (stub.error) {
          toast.error(`Couldn't set up your profile: ${stub.error.message}`);
        }
      }
      setProfile(data);
      applyToForm(data);
      // Persist the post-publish view across reloads + tab switches.
      // approved → live preview card. pending → "submitted for review"
      // message (vendor can't edit while admin is reviewing). Edit
      // flips this back to false so the form re-mounts.
      const status = data?.application_status;
      setPublishedRecently(status === "approved" || status === "pending");
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

  // Pull posts / reels / buzz once the profile is known. Public
  // SELECT RLS lets us read these — same data that populates the
  // mobile Profile tab. Pulled into a callable so the composer can
  // refresh after a successful create without remounting the page.
  async function loadSocial(profileId: string) {
    const [postsRes, reelsRes, buzzRes] = await Promise.all([
      supabase
        .from("vendor_posts")
        .select("id, image_url, caption, created_at")
        .eq("vendor_id", profileId)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_reels")
        .select("id, video_url, caption, created_at")
        .eq("vendor_id", profileId)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_buzz")
        .select("id, body, created_at")
        .eq("vendor_id", profileId)
        .order("created_at", { ascending: false }),
    ]);
    setPosts((postsRes.data ?? []) as typeof posts);
    setReels((reelsRes.data ?? []) as typeof reels);
    setBuzz((buzzRes.data ?? []) as typeof buzz);
  }

  useEffect(() => {
    if (!profile?.id) {
      setPosts([]);
      setReels([]);
      setBuzz([]);
      return;
    }
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadSocial(profile.id);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

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

    // Publish-readiness: hosts hate finding a listing on the directory
    // that turns out to be a half-built shell. Block Publish until the
    // basics + at least one entry in each support table is filled in.
    // Plain Save / draft is unaffected.
    if (opts?.publish && profile) {
      const missing: string[] = [];
      if (!businessName.trim()) missing.push("Business name");
      if (!location.trim()) missing.push("Location");
      if (!bio.trim()) missing.push("Short bio");
      // Category attributes — at least one filled key in the jsonb
      // counts. Boolean false counts as filled-in too; we only
      // exclude null / undefined / empty string / empty array. Portfolio
      // photos and team members are both optional now; Studio → Photo
      // Gallery handles photos, and team bios are nice-to-have but
      // shouldn't block a fresh vendor's first publish.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attrsRes = await (supabase as any)
        .from("vendor_profiles")
        .select("category_attributes")
        .eq("id", profile.id)
        .maybeSingle();
      const attrs =
        (attrsRes.data?.category_attributes as Record<string, unknown> | null) ??
        null;
      const hasDetails =
        attrs &&
        Object.values(attrs).some((v) => {
          if (v == null) return false;
          if (typeof v === "string") return v.trim().length > 0;
          if (Array.isArray(v)) return v.length > 0;
          return true;
        });
      if (!hasDetails) missing.push("Category details");

      if (missing.length > 0) {
        toast.error(`Can't publish yet — add: ${missing.join(", ")}`, {
          duration: 6000,
        });
        return;
      }
    }

    const payload = {
      business_name: businessName.trim(),
      category,
      bio: bio.trim() || null,
      base_price_cents: basePrice
        ? Math.round(Number.parseFloat(basePrice) * 100)
        : null,
      location: location.trim() || null,
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
      // Hitting Publish queues the listing for admin review. It only
      // shows up in the public directory once an admin marks it
      // approved from the admin app's Vendor listings tab. Regular
      // Save leaves the existing status untouched (typed as `any`
      // because application_status isn't in the generated supabase
      // types).
      ...(opts?.publish ? { application_status: "pending" } : {}),
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
        "id, business_name, category, bio, base_price_cents, location, verified_at, application_status, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle";
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

  // Helpers for the Instagram-style outer chrome.
  const initials = (() => {
    const src = profile?.business_name ?? user?.email ?? "V";
    return src
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  })();
  const listingsCount =
    profile?.application_status === "approved" &&
    profile?.location &&
    profile?.base_price_cents != null
      ? 1
      : 0;
  const showListingTab = outerTab === "listing";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        {/* IG-style profile chrome. Top bar: + (left) opens the
            create-what menu; ☰ (right) opens the account menu (mirrors
            the mobile app's hamburger). Below: avatar (click to upload
            a logo) + business name. Dashboard chip removed per
            request. */}
        <div className="border-b border-border bg-card px-4 md:px-8 py-4">
          <div className="grid grid-cols-3 items-center max-w-3xl mx-auto">
            <div className="justify-self-start">
            <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Create"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-secondary/50 active:opacity-70 transition-colors"
                >
                  <Plus className="w-6 h-6 text-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Create</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    setCreateMenuOpen(false);
                    handleCreateClick("post");
                  }}
                >
                  <GridIcon className="w-4 h-4 mr-2" />
                  Post
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setCreateMenuOpen(false);
                    handleCreateClick("reel");
                  }}
                >
                  <PlayIcon className="w-4 h-4 mr-2" />
                  Reel
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setCreateMenuOpen(false);
                    handleCreateClick("buzz");
                  }}
                >
                  <AlignLeftIcon className="w-4 h-4 mr-2" />
                  Buzz
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setCreateMenuOpen(false);
                    setOuterTab("listing");
                  }}
                >
                  <ShoppingBagIcon className="w-4 h-4 mr-2" />
                  Listing
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>

            {/* Center: signed-in vendor's email — mirrors the mobile
                profile top bar so the active account is always visible
                without opening the menu. */}
            <p
              className="justify-self-center text-base font-bold text-foreground truncate max-w-full"
              title={user?.email ?? ""}
            >
              {user?.email ?? ""}
            </p>

            <div className="justify-self-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Menu"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-secondary/50 active:opacity-70 transition-colors"
                >
                  <Menu className="w-6 h-6 text-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    navigate("/");
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-col items-center text-center max-w-2xl mx-auto pt-4">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLogoFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
              aria-label="Change logo"
              className="h-24 w-24 rounded-full overflow-hidden bg-secondary/60 flex items-center justify-center relative group hover:opacity-90 transition-opacity"
            >
              {profile?.logo_url ? (
                <img
                  src={profile.logo_url}
                  alt={profile.business_name ?? "Vendor logo"}
                  className="h-full w-full object-cover"
                />
              ) : profile?.business_name ? (
                <span className="font-display text-3xl text-foreground">
                  {initials}
                </span>
              ) : (
                <span className="font-display text-3xl text-foreground">V</span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/40 transition-colors">
                {logoUploading ? (
                  <Loader2 className="w-5 h-5 text-background animate-spin" />
                ) : (
                  <Plus className="w-5 h-5 text-background opacity-0 group-hover:opacity-100" />
                )}
              </span>
            </button>
            {profile?.business_name && (
              <h1 className="font-display text-2xl mt-4 inline-flex items-center gap-2">
                {profile.business_name}
                {profile.verified_at && (
                  <ShieldCheck
                    className="w-5 h-5 text-accent"
                    aria-label={t("vendor_listing.verified")}
                  />
                )}
              </h1>
            )}
          </div>
        </div>

        {/* Outer 4-tab toggle bar (grid · play · buzz · listing). Counts
            track per-tab content. */}
        <div className="border-b border-border bg-card sticky top-0 z-40">
          <div className="max-w-3xl mx-auto flex">
            <OuterTabButton
              active={outerTab === "grid"}
              count={posts.length}
              icon={<GridIcon />}
              onClick={() => setOuterTab("grid")}
            />
            <OuterTabButton
              active={outerTab === "reels"}
              count={reels.length}
              icon={<PlayIcon />}
              onClick={() => setOuterTab("reels")}
            />
            <OuterTabButton
              active={outerTab === "buzz"}
              count={buzz.length}
              icon={<AlignLeftIcon />}
              onClick={() => setOuterTab("buzz")}
            />
            <OuterTabButton
              active={outerTab === "listing"}
              count={listingsCount}
              icon={<ShoppingBagIcon />}
              onClick={() => setOuterTab("listing")}
            />
          </div>
        </div>

        {/* Outer-tab content. Listing keeps the full existing editor;
            grid / reels / buzz render from the social tables. */}
        {outerTab === "grid" && (
          <OuterTabContent>
            {posts.length === 0 ? (
              <OuterEmpty
                icon={<GridIcon className="w-6 h-6" />}
                title="No posts yet"
                body="Share a photo from a past event to start filling your grid."
                actionLabel="Create post"
                onAction={() => handleCreateClick("post")}
              />
            ) : (
              <div className="grid grid-cols-3 gap-2 max-w-3xl">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setOpenMedia({
                        kind: "post",
                        id: p.id,
                        image_url: p.image_url,
                        caption: p.caption,
                        created_at: p.created_at,
                      })
                    }
                    className="aspect-square overflow-hidden rounded-lg bg-secondary/40 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    <img
                      src={p.image_url}
                      alt={p.caption ?? ""}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </OuterTabContent>
        )}

        {outerTab === "reels" && (
          <OuterTabContent>
            {reels.length === 0 ? (
              <OuterEmpty
                icon={<PlayIcon className="w-6 h-6" />}
                title="No reels yet"
                body="Short videos convert hosts faster than photos — drop one in to see."
                actionLabel="Create reel"
                onAction={() => handleCreateClick("reel")}
              />
            ) : (
              <div className="grid grid-cols-3 gap-2 max-w-3xl">
                {reels.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      setOpenMedia({
                        kind: "reel",
                        id: r.id,
                        video_url: r.video_url,
                        caption: r.caption,
                        created_at: r.created_at,
                      })
                    }
                    className="aspect-square rounded-lg overflow-hidden bg-foreground/80 relative shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    {/* Use the video element itself as the thumbnail —
                        preload=metadata pulls just enough for the first
                        frame so the tile reads as a real preview, not
                        a generic black square. muted + playsInline
                        keeps Safari from refusing to render. */}
                    <video
                      src={r.video_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                      <PlayIcon className="w-6 h-6 text-background drop-shadow" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </OuterTabContent>
        )}

        {outerTab === "buzz" && (
          <OuterTabContent>
            {buzz.length === 0 ? (
              <OuterEmpty
                icon={<AlignLeftIcon className="w-6 h-6" />}
                title="No buzz yet"
                body="Post quick updates so hosts see fresh activity on your profile."
                actionLabel="Create buzz"
                onAction={() => handleCreateClick("buzz")}
              />
            ) : (
              <div className="max-w-2xl mx-auto px-4 space-y-3">
                {buzz.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <p className="text-sm text-foreground">{b.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </OuterTabContent>
        )}

        {showListingTab && (
          <>
            <div className="border-b border-border bg-card px-4 md:px-8 py-3 flex items-center justify-end gap-2">
              {/* Save + Publish — Listing tab only. Save persists the
                  basics without flipping application_status; Publish
                  flips the listing live in the directory. */}
              {isListing && profile && canEdit && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full h-8"
                    disabled={saving || creating}
                    onClick={() =>
                      handleSave(
                        { preventDefault: () => {} } as React.FormEvent,
                      )
                    }
                  >
                    {saving && (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    )}
                    {t("vendor_listing.save_changes")}
                  </Button>
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
                    {creating && (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    )}
                    {t("vendor_listing.publish")}
                  </Button>
                </>
              )}
            </div>

        {/* Secondary sidebar + main content — only on the listing
            builder, only when there's an actual draft to navigate.
            Pre-creation (no profile yet) the page stays a single
            column so the category dropdown gets full attention. */}
        <div>
        <div className="p-4 md:p-8 max-w-3xl mx-auto">
          {/* Step indicator — replaces the old 4-tab sidebar.
              Listing builder is a 4-step wizard: About → Pricing →
              Media → More. Vendors move through it with the Previous /
              Next buttons at the bottom of the form. */}
          {profile && !publishedRecently && (
            <ListingStepHeader
              current={LISTING_STEPS.indexOf(listingTab)}
              steps={LISTING_STEPS.map((s) => t(`vendor_listing.tabs.${s}`))}
            />
          )}
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : isListing && publishedRecently && profile ? (
            /* Post-publish state takes over the whole Listing tab.
               If status is approved, show the live preview card with
               View/Edit/Delete. If pending, show a "submitted for
               review" message — the listing isn't public yet and
               Edit is disabled until admin reviews. */
            <div id="listing-preview">
              {profile.application_status === "pending" ? (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-8 text-center">
                  <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Clock className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-2xl mb-2">
                    Submitted for review
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Thanks — your listing for{" "}
                    <span className="font-medium text-foreground">
                      {profile.business_name}
                    </span>{" "}
                    is queued for admin review. We hand-review every
                    publish to keep the directory high quality. You'll
                    get an email once it's approved and live.
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Typical turnaround: 2–3 business days.
                  </p>
                </div>
              ) : profile.application_status === "rejected" ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
                  <h3 className="font-display text-2xl mb-2">
                    Listing not approved
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    An admin reviewed your submission and asked for
                    changes. Click Edit to update and resubmit.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPublishedRecently(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="mt-4 rounded-full"
                  >
                    Edit listing
                  </Button>
                </div>
              ) : (
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
              )}
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              {/* Category sits at the top of the About tab only —
                  on the other listing tabs it's hidden because once
                  a draft exists the dropdown is locked anyway and
                  re-displaying it on every tab is just visual noise.
                  The dropdown is grouped by main group, same shape
                  as the public Vendors nav on the landing page. */}
              {(!profile || listingTab === "about") && (
              <div className="space-y-2">
                <Label htmlFor="category">
                  {t("vendor_listing.category_label")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category" className="h-11">
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
                  {t("vendor_listing.category_hint")}
                </p>
              </div>
              )}

              {isListing && !category && (
                <div className="rounded-sm border border-dashed border-border bg-card/40 p-8 text-center">
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    {t("vendor_listing.category_nudge")}
                  </p>
                </div>
              )}

              {/* Business name lives on the chrome (set at signup,
                  edited via the avatar / settings later); the listing
                  form doesn't re-ask for it. */}

              {category && listingTab === "about" && (
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

              {category && listingTab === "pricing" && (
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
              )}

              {category && listingTab === "about" && (
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



              {/* Pre-creation only: the very first commit needs an
                  inline button because the header Save/Publish only
                  render once a draft profile exists. Once the row is
                  created, the header buttons take over and this
                  bottom commit hides. */}
              {!profile && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={saving || creating}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    {(saving || creating) && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    {t("vendor_listing.create")}
                  </Button>
                </div>
              )}
              {!canEdit && profile && (
                <p className="text-xs text-muted-foreground text-right pt-2">
                  {t("vendor_listing.view_only")}
                </p>
              )}
            </form>
          )}

          {profile && isListing && !publishedRecently && category && (
            <>
              {/* About tab — category-specific Details editor sits
                  with the basics so everything tied to "what is this
                  business" lives in one place. */}
              {listingTab === "about" && (
                <div className="mt-12 pt-10 border-t border-border">
                  <CategoryAttributesEditor
                    vendorId={profile.id}
                    category={profile.category}
                    canEdit={canEdit}
                  />
                </div>
              )}

              {/* Pricing tab — Packages live here next to the
                  Starting price field above. */}
              {listingTab === "pricing" && (
                <div className="mt-12 pt-10 border-t border-border">
                  <PackageManager vendorId={profile.id} canEdit={canEdit} />
                </div>
              )}

              {/* More tab — team, social proof (reviews +
                  recommendations), and the optional intake-form /
                  FAQs / policy editors. */}
              {listingTab === "more" && (
                <>
                  {canEdit && (
                    <div className="mt-12 pt-10 border-t border-border">
                      <VendorTeamManager vendorId={profile.id} />
                    </div>
                  )}
                  <div className="mt-12 pt-10 border-t border-border">
                    <VendorRecommendationManager
                      vendorId={profile.id}
                      canEdit={canEdit}
                    />
                  </div>
                  <div className="mt-12 pt-10 border-t border-border">
                    <VendorFaqsManager
                      vendorId={profile.id}
                      canEdit={canEdit}
                    />
                  </div>
                  <div className="mt-12 pt-10 border-t border-border">
                    <VendorPolicyEditor
                      vendorId={profile.id}
                      canEdit={canEdit}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {profile && !publishedRecently && category && (
            <ListingStepNav
              current={LISTING_STEPS.indexOf(listingTab)}
              total={LISTING_STEPS.length}
              onPrev={() => {
                const idx = LISTING_STEPS.indexOf(listingTab);
                if (idx > 0) setListingTab(LISTING_STEPS[idx - 1]);
              }}
              onNext={() => {
                const idx = LISTING_STEPS.indexOf(listingTab);
                if (idx < LISTING_STEPS.length - 1) {
                  setListingTab(LISTING_STEPS[idx + 1]);
                }
              }}
            />
          )}
        </div>
        </div>
          </>
        )}
      </main>

      {profile?.id && user?.id && composerKind && (
        <VendorSocialComposer
          open={composerKind !== null}
          kind={composerKind}
          vendorId={profile.id}
          userId={user.id}
          onOpenChange={(o) => !o && setComposerKind(null)}
          onCreated={() => loadSocial(profile.id)}
        />
      )}

      <Dialog
        open={openMedia !== null}
        onOpenChange={(o) => !o && setOpenMedia(null)}
      >
        {/* IG-style two-column lightbox: media on the left, caption +
            comments on the right. Falls back to a single column on
            phones because the side panel needs the room. */}
        <DialogContent className="sm:max-w-4xl p-0 bg-background overflow-hidden">
          {openMedia && (
            <PostLightbox media={openMedia} userId={user?.id ?? null} />
          )}
        </DialogContent>
      </Dialog>

      <MobileNav items={navItems} />
    </div>
  );
}

// Small callout that points vendors to the dedicated availability
// editor (lives at /vendor/availability — full Calendar with
// recurring rules + one-off blocks). Mounted inline on the profile
// editor so the "Availability" section on the public profile has a
// clear hand-off from this single dashboard view.
// 3-step wizard order. Indexed by listingTab. Adding/removing steps
// here flows through the StepHeader + StepNav automatically.
const LISTING_STEPS = ["about", "pricing", "more"] as const;

function ListingStepHeader({
  current,
  steps,
}: {
  current: number;
  steps: string[];
}) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
        Step {current + 1} of {steps.length}
      </p>
      <div className="flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex-1 flex items-center gap-2">
            <div
              className={`h-1 flex-1 rounded-full ${i <= current ? "bg-foreground" : "bg-secondary/60"}`}
            />
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                i === current ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListingStepNav({
  current,
  total,
  onPrev,
  onNext,
}: {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const isFirst = current === 0;
  const isLast = current === total - 1;
  return (
    <div className="mt-12 pt-6 border-t border-border flex items-center justify-between">
      <Button
        type="button"
        variant="outline"
        onClick={onPrev}
        disabled={isFirst}
        className="rounded-full"
      >
        Previous
      </Button>
      <Button
        type="button"
        onClick={onNext}
        disabled={isLast}
        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
      >
        Next
      </Button>
    </div>
  );
}

// Compact post-publish preview — replaces the editor surface once
// the vendor clicks Publish. View opens the public listing in a new
// tab, Edit collapses the preview back to the form, Delete confirms
// then drops the row. Image is intentionally omitted; the directory's
// VendorCard renders the visual version using the per-sub
// categoryImageFallback art.
function ListingPreviewCard({
  profile,
  saving,
  onView,
  onDelete,
}: {
  profile: VendorProfile;
  saving: boolean;
  onView: () => void;
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


// ---------------- IG-style outer-tab helpers ----------------

function OuterTabButton({
  active,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
      style={{
        borderBottom: active ? "2px solid #0a0a0a" : "2px solid transparent",
        color: active ? "#0a0a0a" : "#737373",
      }}
    >
      <span>{icon}</span>
      <span className="text-xs font-semibold">{count}</span>
    </button>
  );
}

function OuterTabContent({ children }: { children: React.ReactNode }) {
  return <div className="px-4 md:px-8 py-8">{children}</div>;
}

function OuterEmpty({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="max-w-md mx-auto text-center">
      <div className="w-14 h-14 rounded-full border border-border flex items-center justify-center mx-auto text-muted-foreground">
        {icon}
      </div>
      <h2 className="font-display text-lg mt-4">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{body}</p>
      {actionLabel && onAction && (
        <Button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

// Inline SVG icons keep the bundle lean and dodge the heavy
// lucide-react import for these specific glyphs.

function GridIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function PlayIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}

function AlignLeftIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  );
}

function ShoppingBagIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

// ---------- Post / Reel lightbox with caption + comments ----------

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author: { display_name: string | null; avatar_url: string | null } | null;
};

function PostLightbox({
  media,
  userId,
}: {
  media:
    | {
        kind: "post";
        id: string;
        image_url: string;
        caption: string | null;
        created_at: string;
      }
    | {
        kind: "reel";
        id: string;
        video_url: string;
        caption: string | null;
        created_at: string;
      };
  userId: string | null;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const isReel = media.kind === "reel";

  async function loadComments() {
    if (isReel) {
      // Reels don't have a comments table yet. Skip the fetch and
      // render the caption-only side panel.
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_post_comments")
      .select(
        "id, body, created_at, user_id, author:profiles!vendor_post_comments_user_id_profile_fkey(display_name, avatar_url)",
      )
      .eq("post_id", media.id)
      .order("created_at", { ascending: true });
    setComments((data ?? []) as CommentRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id, media.kind]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || isReel) return;
    const body = draft.trim();
    if (!body || body.length > 500) return;
    setPosting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_post_comments")
      .insert({ post_id: media.id, user_id: userId, body });
    setPosting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft("");
    loadComments();
  }

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_320px] max-h-[80vh]">
      {/* Media panel */}
      <div className="bg-foreground/5 flex items-center justify-center min-h-[60vh] md:min-h-0">
        {media.kind === "post" ? (
          <img
            src={media.image_url}
            alt={media.caption ?? ""}
            className="max-w-full max-h-[80vh] object-contain"
          />
        ) : (
          <video
            src={media.video_url}
            className="max-w-full max-h-[80vh] bg-foreground/90"
            controls
            autoPlay
            playsInline
          />
        )}
      </div>

      {/* Caption + comments panel */}
      <div className="flex flex-col border-l border-border bg-background min-h-0">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          {media.caption ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {media.caption}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No caption</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {new Date(media.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isReel ? (
            <p className="text-sm text-muted-foreground italic">
              Comments aren't enabled on reels yet.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No comments yet — be the first to chime in.
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-semibold text-foreground">
                    {c.author?.display_name ?? "Someone"}
                  </span>{" "}
                  <span className="text-foreground/85 whitespace-pre-wrap">
                    {c.body}
                  </span>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isReel && userId && (
          <form
            onSubmit={handleSubmit}
            className="border-t border-border px-3 py-3 flex items-center gap-2"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              maxLength={500}
              disabled={posting}
              className="h-9 flex-1"
            />
            <Button
              type="submit"
              size="sm"
              disabled={posting || draft.trim().length === 0}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {posting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Post"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

