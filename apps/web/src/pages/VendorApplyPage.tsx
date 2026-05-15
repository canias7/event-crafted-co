import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Gift,
  LayoutDashboard,
  Loader2,
  Pencil,
} from "lucide-react";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 — business
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");

  function step1Valid() {
    return email.trim().length > 0 && password.length >= 8;
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
      // Cast: the generated supabase types haven't been regenerated since
      // the apply_as_vendor migration landed. Same pattern as the other
      // newer RPC call sites.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: vp, error: rpcError } = await (supabase as any).rpc(
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
          // display_name not set — handle_new_user falls back to the
          // email prefix. Owner name removed from the signup flow.
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

    // We auto-confirm vendor applicants in handle_new_user so they can
    // sign in the moment admin approves — but auto-confirm also means
    // signUp establishes a client-side session right now. Sign them
    // back out so they can't browse the vendor portal while their
    // application is still pending.
    await supabase.auth.signOut();
    navigate("/vendor-apply/thanks");
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Hero — text-only on cream. */}
      <section className="pt-28 md:pt-36 pb-10 md:pb-14">
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
            className="text-h2 md:text-hero font-display leading-[1.0] max-w-3xl"
          >
            Become a{" "}
            <span className="italic font-light text-accent">Vendora vendor.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.55 }}
            className="text-base md:text-lg text-muted-foreground mt-5 max-w-md leading-relaxed font-light"
          >
            3% on confirmed bookings. No pay-to-rank. AI-assisted replies in
            under 3 minutes. Month-to-month, no contracts.
          </motion.p>
        </div>
      </section>

      {/* Form */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          {ownVendorProfile ? (
            ownVendorProfile.application_status === "approved" ? (
              <ApprovedVendorPanel
                businessName={ownVendorProfile.business_name}
                slug={
                  (ownVendorProfile as { slug?: string | null } | null)
                    ?.slug ?? null
                }
                vendorId={ownVendorProfile.id}
              />
            ) : (
              <ExistingApplicationCard
                status={ownVendorProfile.application_status}
                businessName={ownVendorProfile.business_name}
              />
            )
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
                  <h2 className="font-editorial text-3xl mb-1">
                    Set up your account
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Used to sign in and receive inquiries.
                  </p>
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
                  <h2 className="font-editorial text-3xl mb-1">
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

// Approved vendors who land on /vendor-apply get this panel instead of
// the apply form. Welcome-back banner with their business name + a
// "live" badge, three quick-action chips into the parts of the
// portal they care about most, and a referral nudge below to keep
// the page useful as a loyalty surface.
function ApprovedVendorPanel({
  businessName,
  slug,
  vendorId,
}: {
  businessName: string;
  slug: string | null;
  vendorId: string;
}) {
  const publicHref = slug ? `/vendors/${slug}` : `/vendors/${vendorId}`;
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Welcome-back panel */}
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 text-accent mb-4">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold tracking-wide uppercase">
            You're live
          </span>
        </div>
        <h2 className="font-editorial text-4xl mb-2">
          Welcome back, {businessName}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Your listing is approved and discoverable in the directory. Pick
          up where you left off:
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mt-6 max-w-xl mx-auto">
          <ActionChip
            to="/vendor/dashboard"
            icon={LayoutDashboard}
            label="Open dashboard"
          />
          <ActionChip
            to={publicHref}
            icon={ExternalLink}
            label="View public listing"
            external
          />
          <ActionChip
            to="/vendor/listing"
            icon={Pencil}
            label="Edit profile"
          />
        </div>
      </div>

      {/* Referral nudge */}
      <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-label text-accent mb-1">— Refer & earn</p>
            <h3 className="font-editorial text-2xl mb-2">
              Know another vendor who'd be a good fit?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Refer a vendor — when they're approved and complete their
              first booking through Vendora, you both get a one-month fee
              waiver. No cap on referrals.
            </p>
            <Link to="/vendor/dashboard">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                Get my referral link
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionChip({
  to,
  icon: Icon,
  label,
  external,
}: {
  to: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  external?: boolean;
}) {
  const inner = (
    <span className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/40 transition-colors">
      <Icon className="w-4 h-4" />
      {label}
    </span>
  );
  return external ? (
    <a href={to} target="_blank" rel="noreferrer" className="block">
      {inner}
    </a>
  ) : (
    <Link to={to} className="block">
      {inner}
    </Link>
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
    status === "rejected"
        ? "Your previous application wasn't approved"
        : "Your application is in review";
  const body =
    status === "rejected"
      ? `We weren't able to approve ${businessName}. Reach out to support if you'd like another look — we keep the door open.`
      : `${businessName} is in our review queue. We hand-review every application within 2–3 business days, then email you the decision.`;
  const cta = (
    <Link to="/customer/explore">
      <Button variant="outline" className="rounded-full">
        Back to Explore
      </Button>
    </Link>
  );
  return (
    <div className="rounded-lg border border-border bg-card p-8 max-w-xl mx-auto text-center">
      <p className="font-label text-accent mb-3">— Application status</p>
      <h2 className="font-editorial text-3xl mb-3">{heading}</h2>
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
