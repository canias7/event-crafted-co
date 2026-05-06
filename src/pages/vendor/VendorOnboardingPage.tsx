import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PortfolioUploader } from "@/components/vendor/PortfolioUploader";
import { PackageManager } from "@/components/vendor/PackageManager";

interface VendorProfile {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  base_price_cents: number | null;
  location: string | null;
  service_radius_miles: number | null;
  portfolio_summary: string | null;
}

const STEPS = [
  { num: 1, label: "Polish" },
  { num: 2, label: "Pricing" },
  { num: 3, label: "Photos" },
  { num: 4, label: "Done" },
];

export default function VendorOnboardingPage() {
  const navigate = useNavigate();
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;

  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — polish
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [serviceRadius, setServiceRadius] = useState("");
  const [portfolioSummary, setPortfolioSummary] = useState("");

  useEffect(() => {
    if (!user || !vendorId) return;
    let cancelled = false;
    supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, bio, base_price_cents, location, service_radius_miles, portfolio_summary",
      )
      .eq("id", vendorId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const p = (data as VendorProfile | null) ?? null;
        setProfile(p);
        setBio(p?.bio ?? "");
        setLocation(p?.location ?? "");
        setServiceRadius(
          p?.service_radius_miles != null
            ? p.service_radius_miles.toString()
            : "",
        );
        setPortfolioSummary(p?.portfolio_summary ?? "");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, vendorId]);

  async function savePolish() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("vendor_profiles")
      .update({
        bio: bio.trim() || null,
        location: location.trim() || null,
        service_radius_miles: serviceRadius
          ? Number.parseInt(serviceRadius, 10)
          : null,
        portfolio_summary: portfolioSummary.trim() || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStep(2);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-2xl mb-3">No vendor profile yet</p>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Apply to join the directory first — onboarding starts after your
          basic profile is created.
        </p>
        <Link to="/vendor-apply">
          <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
            Apply to join
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="container mx-auto flex items-center justify-between max-w-3xl">
          <p className="font-display text-lg">Vendora</p>
          <Link
            to="/vendor/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium tnum transition-colors ${
                  step > s.num
                    ? "bg-accent text-accent-foreground"
                    : step === s.num
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {step > s.num ? <Check className="w-3 h-3" /> : s.num}
              </div>
              <span className="font-label text-muted-foreground hidden sm:block">
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="flex-1 h-px bg-border" />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <p className="font-label text-accent mb-2">Step 1 of 4</p>
              <h1 className="font-display text-3xl mb-2">
                Polish your profile
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The basics are saved. A bit more context helps hosts choose
                you over the next ten profiles they look at.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bio">Short bio</Label>
                <Textarea
                  id="bio"
                  rows={3}
                  placeholder="One or two sentences about your style and approach."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="Brooklyn, NY"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius">Service radius (miles)</Label>
                  <Input
                    id="radius"
                    type="number"
                    min="0"
                    placeholder="60"
                    value={serviceRadius}
                    onChange={(e) => setServiceRadius(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary">Portfolio summary</Label>
                <Textarea
                  id="summary"
                  rows={5}
                  placeholder="What makes your work distinctive? Notable clients, signature aesthetic, typical event size."
                  value={portfolioSummary}
                  onChange={(e) => setPortfolioSummary(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={savePolish}
                disabled={saving}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="font-label text-accent mb-2">Step 2 of 4</p>
              <h1 className="font-display text-3xl mb-2">
                Add a few packages
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Two to four priced tiers convert inquiries faster than a
                single starting price. You can add more later.
              </p>
            </div>

            <div className="bg-card border border-border rounded-sm p-5">
              <PackageManager vendorId={profile.id} canEdit={true} />
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                className="rounded-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <p className="font-label text-accent mb-2">Step 3 of 4</p>
              <h1 className="font-display text-3xl mb-2">
                Upload portfolio images
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Three to five strong photos make a profile feel real. Hosts
                skim photos first, words second.
              </p>
            </div>

            <div className="bg-card border border-border rounded-sm p-5">
              <PortfolioUploader vendorId={profile.id} />
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button
                variant="ghost"
                onClick={() => setStep(2)}
                className="rounded-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() => setStep(4)}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 text-center py-8">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent/15 flex items-center justify-center">
              <Check className="w-7 h-7 text-accent" />
            </div>
            <div>
              <p className="font-label text-accent mb-3 tracking-[0.3em]">
                — YOU'RE READY
              </p>
              <h1 className="font-display text-3xl md:text-4xl mb-3 leading-tight">
                Profile is live
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                Hosts can now find {profile.business_name} in the directory.
                Inquiries will land in your inbox; you can reply right from
                Vendora.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link to={`/vendors/${profile.id}`} target="_blank">
                <Button
                  variant="outline"
                  className="rounded-full w-full sm:w-auto"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Preview public profile
                </Button>
              </Link>
              <Button
                onClick={() => navigate("/vendor/dashboard")}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90 w-full sm:w-auto"
              >
                Go to dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
