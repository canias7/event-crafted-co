import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import heroApply from "@/assets/vendora-hero-gala.jpg";

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

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorApplyPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — account
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 — business
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [bio, setBio] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [location, setLocation] = useState("");
  const [serviceRadius, setServiceRadius] = useState("");
  const [portfolioSummary, setPortfolioSummary] = useState("");

  function step1Valid() {
    return (
      ownerName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 8
    );
  }

  function step2Valid() {
    return businessName.trim().length > 0 && category.length > 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!step2Valid()) {
      toast.error("Business name and category are required");
      return;
    }

    setSubmitting(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/vendor/dashboard`,
        data: { display_name: ownerName, role: "vendor" },
      },
    });

    if (signUpError) {
      setSubmitting(false);
      toast.error(signUpError.message);
      return;
    }

    if (!signUpData.session || !signUpData.user) {
      setSubmitting(false);
      toast.success("Account created — check your email to confirm before signing in.");
      navigate("/login");
      return;
    }

    // Profile row is auto-created by handle_new_user() trigger. Insert vendor_profile.
    const { error: vpError } = await supabase.from("vendor_profiles").insert({
      user_id: signUpData.user.id,
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
    });

    setSubmitting(false);

    if (vpError) {
      toast.error(`Account created, but couldn't save business profile: ${vpError.message}. You can complete it later from your dashboard.`);
      navigate("/vendor/dashboard");
      return;
    }

    toast.success("Welcome to Vendora — your application is in review.");
    navigate("/vendor/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic hero strip */}
      <section className="relative h-[44svh] min-h-[340px] w-full overflow-hidden">
        <img
          src={heroApply}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/55 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/55 via-transparent to-foreground/20" />
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />

        <div className="relative z-10 h-full flex items-end pb-12 md:pb-16">
          <div className="container mx-auto px-6 md:px-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 }}
              className="flex items-center gap-4 mb-5"
            >
              <p className="font-label text-accent tracking-[0.4em]">
                — JOIN THE DIRECTORY
              </p>
              <span className="h-px w-8 bg-accent/40" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.3, duration: 0.9 }}
              className="text-h2 md:text-hero font-display text-background leading-[1.0] max-w-3xl"
            >
              Become a{" "}
              <span className="italic font-light text-accent">Vendora vendor.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.55 }}
              className="text-base md:text-lg text-background/80 mt-5 max-w-md leading-relaxed font-light"
            >
              3% on confirmed bookings. No pay-to-rank. AI-assisted replies in
              under 3 minutes. Month-to-month, no contracts.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-10">
            <StepDot active={step >= 1} done={step > 1} num={1} label="Account" />
            <span className="flex-1 h-px bg-border" />
            <StepDot active={step >= 2} done={false} num={2} label="Business" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                <div>
                  <p className="font-label text-accent mb-2">Step 1 of 2</p>
                  <h2 className="font-display text-2xl mb-1">
                    Set up your account
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Used to sign in and receive inquiries.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner-name">Owner name</Label>
                  <Input
                    id="owner-name"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Your full name"
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="business@email.com"
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                    className="h-11"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Already a vendor?{" "}
                    <Link to="/login" className="text-accent font-medium">
                      Sign in
                    </Link>
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!step1Valid()) {
                        toast.error("Please complete every field");
                        return;
                      }
                      setStep(2);
                    }}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                <div>
                  <p className="font-label text-accent mb-2">Step 2 of 2</p>
                  <h2 className="font-display text-2xl mb-1">
                    Tell us about your business
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    You can edit any of this later from your dashboard.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="business-name">Business name</Label>
                    <Input
                      id="business-name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Luminara Photography"
                      required
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
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
                      placeholder="2500"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-radius">Service radius (miles)</Label>
                    <Input
                      id="service-radius"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={serviceRadius}
                      onChange={(e) => setServiceRadius(e.target.value)}
                      placeholder="60"
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
                    rows={4}
                    placeholder="What makes your work distinctive? Notable clients, signature aesthetic, typical event size, anything that helps couples and hosts find you."
                  />
                </div>

                <div className="rounded-sm bg-secondary/50 p-4 text-xs text-muted-foreground leading-relaxed flex gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                  <span>
                    Your bio and portfolio summary feed our AI inquiry agent so
                    it can draft replies in your voice. The more context, the
                    better the drafts.
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(1)}
                    disabled={submitting}
                    className="rounded-full"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || !step2Valid()}
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      <>
                        Submit application
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </form>

          <p className="text-xs text-muted-foreground text-center mt-10 max-w-md mx-auto leading-relaxed">
            By submitting, you agree to Vendora's vendor terms. We hand-review
            every application within 2–3 business days before listing publicly.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function StepDot({
  active,
  done,
  num,
  label,
}: {
  active: boolean;
  done: boolean;
  num: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium tnum transition-colors ${
          done
            ? "bg-accent text-accent-foreground"
            : active
              ? "bg-foreground text-background"
              : "bg-secondary text-muted-foreground"
        }`}
      >
        {done ? "✓" : num}
      </div>
      <p className="font-label text-muted-foreground hidden sm:block">{label}</p>
    </div>
  );
}
