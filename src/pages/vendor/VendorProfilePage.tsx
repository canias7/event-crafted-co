import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { PortfolioUploader } from "@/components/vendor/PortfolioUploader";
import { PackageManager } from "@/components/vendor/PackageManager";
import { VendorRecommendationManager } from "@/components/vendor/VendorRecommendationManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { vendorNavItems as navItems } from "@/data/navItems";

const categories = [
  "Photographer",
  "Videographer",
  "Catering",
  "DJ",
  "Florist",
  "Event Planner",
  "Decorator",
  "Makeup Artist",
  "Baker",
  "Venue",
];

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
  intro_video_url: string | null;
  weekly_digest_enabled: boolean | null;
}

export default function VendorProfilePage() {
  const { user, vendorMemberships } = useAuth();
  const membership = vendorMemberships[0] ?? null;
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [profile, setProfile] = useState<VendorProfile | null>(null);

  // Form fields
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [bio, setBio] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [location, setLocation] = useState("");
  const [serviceRadius, setServiceRadius] = useState("");
  const [portfolioSummary, setPortfolioSummary] = useState("");
  const [introVideoUrl, setIntroVideoUrl] = useState("");

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
            "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, intro_video_url, weekly_digest_enabled",
          )
          .eq("id", membership.vendor_id)
          .maybeSingle()
      : supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, intro_video_url, weekly_digest_enabled",
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
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user, membership?.vendor_id]);

  async function handleSave(e: React.FormEvent) {
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
    };

    if (profile) {
      setSaving(true);
      const { error } = await supabase
        .from("vendor_profiles")
        .update(payload)
        .eq("id", profile.id);
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Profile saved");
      setProfile({ ...profile, ...payload });
      // Re-geocode if location changed. Fire-and-forget — failure to
      // geocode shouldn't block the save toast.
      if (payload.location) {
        supabase.functions
          .invoke("geocode-vendor", { body: { vendorId: profile.id } })
          .catch(() => {});
      }
    } else {
      setCreating(true);
      const { data, error } = await supabase
        .from("vendor_profiles")
        .insert({ user_id: user.id, ...payload })
        .select(
          "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary, verified_at, intro_video_url, weekly_digest_enabled",
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
              <h1 className="font-display text-xl">Profile</h1>
              <p className="text-sm text-muted-foreground">
                Edit how hosts see you on Vendora
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
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

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

              <div className="space-y-2">
                <Label htmlFor="portfolio-summary">Portfolio summary</Label>
                <Textarea
                  id="portfolio-summary"
                  value={portfolioSummary}
                  onChange={(e) => setPortfolioSummary(e.target.value)}
                  rows={5}
                  placeholder="What makes your work distinctive? Notable clients, signature aesthetic, typical event size."
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Sparkles className="w-3 h-3 text-accent" />
                  Used by the AI to draft replies in your voice — fuller is
                  better.
                </p>
              </div>

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

              {profile && canEdit && (
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

          {profile && (
            <>
              <div className="mt-12 pt-10 border-t border-border">
                <PackageManager vendorId={profile.id} canEdit={canEdit} />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <PortfolioUploader vendorId={profile.id} />
              </div>
              <div className="mt-12 pt-10 border-t border-border">
                <VendorRecommendationManager
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
