// Vendor "Edit profile" page — edits the account-level brand identity
// (one per user), stored on `public.profiles`:
//   - business_name (required)
//   - bio
//   - logo_url
//
// Mirrors apps/vendor-mobile/app/(vendor)/edit-profile.tsx.
//
// Terminology: "profile" = account (one per user, the brand). The
// per-listing fields (category, city, base price) live on rows in
// vendor_profiles (each row is a LISTING — vendors can have up to 5).
// A DB trigger mirrors business_name/bio/logo_url from profiles onto
// every listing the vendor owns so they stay in sync.
//
// Logo uploads go to the vendor-posts bucket at
// `<user_id>/profile-logo-<ts>.<ext>` so we don't need new storage
// policies.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogoCropperModal } from "@/components/vendor/LogoCropperModal";

interface ProfileForm {
  business_name: string;
  bio: string;
  logo_url: string | null;
}

const EMPTY: ProfileForm = { business_name: "", bio: "", logo_url: null };
// Bio length cap — fits a short paragraph + caption rail use cases
// (brand card flip, listing detail, host explore card). Anything
// longer truncates oddly in those surfaces.
const BIO_MAX = 500;

export default function VendorEditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [initial, setInitial] = useState<ProfileForm>(EMPTY);
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("profiles")
      .select("business_name, bio, logo_url")
      .eq("id", user.id)
      .maybeSingle();
    const next: ProfileForm = {
      business_name: data?.business_name ?? "",
      bio: data?.bio ?? "",
      logo_url: data?.logo_url ?? null,
    };
    setInitial(next);
    setForm(next);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    initial.business_name !== form.business_name ||
    initial.bio !== form.bio ||
    initial.logo_url !== form.logo_url;

  function set<K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function onPickLogo(file: File) {
    if (!user?.id || logoUploading) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Photo too large — pick a logo under 10 MB.");
      return;
    }
    setLogoUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const path = `${user.id}/profile-logo-${Date.now()}.${ext}`;
      const contentType = file.type || "image/jpeg";
      const { error: upErr } = await supabase.storage
        .from("vendor-posts")
        .upload(path, file, { contentType, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("vendor-posts")
        .getPublicUrl(path);
      set("logo_url", pub.publicUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error(`Couldn't update logo: ${msg}`);
    } finally {
      setLogoUploading(false);
    }
  }

  async function save() {
    if (!user?.id || !dirty || saving) return;
    if (!form.business_name.trim()) {
      toast.error("Business name is required.");
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({
        business_name: form.business_name.trim(),
        bio: form.bio.trim() || null,
        logo_url: form.logo_url,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }
    toast.success("Profile saved.");
    navigate("/vendor/me");
  }

  const initialChar =
    form.business_name?.trim()?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "V";

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={vendorNavItems}
        title="Edit profile"
        backPath="/vendor/me"
      />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="rounded-full w-9 h-9 flex items-center justify-center hover:bg-secondary/60 lg:hidden"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="font-editorial text-3xl">Edit profile</h1>
              <p className="text-sm text-muted-foreground">
                Your brand identity — name, bio, and logo.
              </p>
            </div>
          </div>
          <Button
            onClick={save}
            disabled={!dirty || saving || loading}
            className="rounded-full"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>

        <div className="p-4 md:p-8 max-w-xl space-y-6">
          {loading ? (
            <>
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="relative">
                  {form.logo_url ? (
                    <img
                      src={form.logo_url}
                      alt=""
                      className="w-24 h-24 rounded-full object-cover bg-secondary"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-foreground text-background flex items-center justify-center font-editorial text-4xl">
                      {initialChar}
                    </div>
                  )}
                  {logoUploading ? (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Open the cropper first; we only upload after
                      // the user clicks Apply on the cropped output.
                      if (f) setPendingLogo(f);
                      // Reset the input value so picking the same file
                      // twice in a row still triggers onChange.
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => fileRef.current?.click()}
                    disabled={logoUploading}
                  >
                    <ImagePlus className="h-3.5 w-3.5 mr-1" />
                    {form.logo_url ? "Change logo" : "Upload logo"}
                  </Button>
                  {form.logo_url ? (
                    <button
                      type="button"
                      onClick={() => set("logo_url", null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_name">Business name</Label>
                <Input
                  id="business_name"
                  value={form.business_name}
                  onChange={(e) => set("business_name", e.target.value)}
                  placeholder="Your brand"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={form.bio}
                  onChange={(e) =>
                    set("bio", e.target.value.slice(0, BIO_MAX))
                  }
                  rows={6}
                  maxLength={BIO_MAX}
                  placeholder="A short italic paragraph that introduces your brand."
                  className="resize-none"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <p>Shows beneath your business name across the marketplace.</p>
                  <p
                    className={
                      form.bio.length > BIO_MAX - 40
                        ? "text-foreground"
                        : undefined
                    }
                  >
                    {form.bio.length}/{BIO_MAX}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />
      {pendingLogo ? (
        <LogoCropperModal
          file={pendingLogo}
          onCancel={() => setPendingLogo(null)}
          onApply={async (cropped) => {
            setPendingLogo(null);
            await onPickLogo(cropped);
          }}
        />
      ) : null}
    </div>
  );
}
