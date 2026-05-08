import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Picture } from "@/components/shared/Picture";
import heroApply from "@/assets/vendora-hero-gala.jpg?as=picture";
import { CATEGORY_GROUPS } from "@/data/categoryTaxonomy";

// Selectable sub-categories grouped by their parent group. Source of
// truth lives in categoryTaxonomy.ts — adding a new sub there flows
// through to this dropdown automatically.

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorApplyPage() {
  const navigate = useNavigate();
  const { session, profile, ownVendorProfile, refreshProfile } = useAuth();
  // Multi-role: an authenticated host can attach a vendor application
  // to their existing account — skip the email/password step entirely.
  const skipAccountStep = !!session && !!profile;
  const [step, setStep] = useState<1 | 2>(skipAccountStep ? 2 : 1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — account
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 — business
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");

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

    // Logged-in path: attach a pending vendor_profile to the current
    // host account via the apply_as_vendor RPC. No new auth user, no
    // email confirmation — they can keep using the host dashboard
    // while we review.
    if (skipAccountStep) {
      const { data: vp, error: rpcError } = await supabase.rpc(
        "apply_as_vendor",
        {
          p_business_name: businessName.trim(),
          p_category: category,
        },
      );
      if (rpcError) {
        setSubmitting(false);
        toast.error(rpcError.message);
        return;
      }
      // Send the "thanks for applying" email. Best-effort — we don't
      // want a transient email failure to block the user from seeing
      // the thanks page.
      const vpId = (vp as { id?: string } | null)?.id;
      if (vpId) {
        await supabase.functions
          .invoke("send-transactional-email", {
            body: { kind: "vendor_applied", vendorProfileId: vpId },
          })
          .catch(() => {});
      }
      setSubmitting(false);
      await refreshProfile();
      navigate("/vendor-apply/thanks");
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        // Role starts as 'host' (set by handle_new_user). The same
        // trigger reads vendor_business_name + vendor_category and
        // creates the pending vendor_profile.
        data: {
          display_name: ownerName,
          vendor_business_name: businessName.trim(),
          vendor_category: category,
        },
      },
    });

    setSubmitting(false);

    if (signUpError) {
      toast.error(signUpError.message);
      return;
    }

    // Supabase signUp silently no-ops if the email already exists,
    // returning data.user with identities=[]. Tell the user to sign
    // in to their existing account and apply from there.
    if (signUpData?.user && (signUpData.user.identities ?? []).length === 0) {
      toast.error(
        "An account with this email already exists. Sign in first, then click \"Become a vendor\" from your dashboard.",
      );
      return;
    }

    // Pending vendor accounts are no longer auto-banned, so the email
    // confirmation flow handles the sign-in itself. Just send them to
    // the thanks page.
    navigate("/vendor-apply/thanks");
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Cinematic hero strip */}
      <section className="relative h-[44svh] min-h-[340px] w-full overflow-hidden">
        <div className="absolute inset-0">
          <Picture
            source={heroApply}
            alt=""
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            className="w-full h-full object-cover"
          />
        </div>
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
          {ownVendorProfile ? (
            <ExistingApplicationCard
              status={ownVendorProfile.application_status}
              businessName={ownVendorProfile.business_name}
            />
          ) : (
            <>
          {/* Step indicator — hidden when the user is already signed in
              and only needs to fill out the business details. */}
          {!skipAccountStep && (
            <div className="flex items-center gap-3 mb-10">
              <StepDot active={step >= 1} done={step > 1} num={1} label="Account" />
              <span className="flex-1 h-px bg-border" />
              <StepDot active={step >= 2} done={false} num={2} label="Business" />
            </div>
          )}

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
                  <PasswordInput
                    id="password"
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

                <div className="flex items-center justify-between pt-2">
                  {skipAccountStep ? <span /> : (
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
                  )}
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
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function ExistingApplicationCard({
  status,
  businessName,
}: {
  status: "pending" | "approved" | "rejected" | "needs_changes" | "submitted";
  businessName: string;
}) {
  const heading =
    status === "approved"
      ? "You're already a Vendora vendor"
      : status === "rejected"
        ? "Your previous application wasn't approved"
        : "Your application is in review";
  const body =
    status === "approved"
      ? `${businessName} is approved. Open the vendor portal to manage your listing, inquiries, and calendar.`
      : status === "rejected"
        ? `We weren't able to approve ${businessName}. Reach out to support if you'd like another look — we keep the door open.`
        : `${businessName} is in our review queue. We hand-review every application within 2–3 business days, then email you the decision.`;
  const cta =
    status === "approved" ? (
      <Link to="/vendor/dashboard">
        <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
          Open vendor dashboard
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </Link>
    ) : (
      <Link to="/customer/dashboard">
        <Button variant="outline" className="rounded-full">
          Back to my dashboard
        </Button>
      </Link>
    );
  return (
    <div className="rounded-lg border border-border bg-card p-8 max-w-xl mx-auto text-center">
      <p className="font-label text-accent mb-3">— Application status</p>
      <h2 className="font-display text-2xl mb-3">{heading}</h2>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        {body}
      </p>
      <div className="flex justify-center">{cta}</div>
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
