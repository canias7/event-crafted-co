// Host account hub — saved vendors + verification CTA. Reached from
// the "Account settings" tile on /customer/profile. Distinct from
// /settings (email-on-file + sign out + delete) — that surface is
// still its own page; this one is account-level housekeeping the host
// touches more often.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle2, ChevronRight, Clock, Heart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Skeleton } from "@/components/ui/skeleton";
import { VendorCard } from "@/components/shared/VendorCard";
import { customerNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { useSavedVendors } from "@/hooks/useSavedVendors";
import { useVendors } from "@/hooks/useVendors";
import { supabase } from "@/integrations/supabase/client";

type VerifStatus = "none" | "pending" | "approved" | "rejected";

export default function HostAccountPage() {
  const { user } = useAuth();
  const { vendors, loading: vendorsLoading } = useVendors();
  const { savedIds, loading: savedLoading } = useSavedVendors();
  const [verifStatus, setVerifStatus] = useState<VerifStatus>("none");
  const [verifLoading, setVerifLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const loadVerif = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("host_verification_requests")
      .select("status")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (data as { status?: string } | null)?.status;
    setVerifStatus(
      raw === "approved" || raw === "pending" || raw === "rejected"
        ? raw
        : "none",
    );
    setVerifLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadVerif();
  }, [loadVerif]);

  async function requestVerification() {
    if (!user?.id) return;
    const ok = window.confirm(
      "Request host verification?\n\nWe'll reach out within 48 hours to verify your identity (a photo of a government ID is enough). It typically unlocks faster vendor replies.",
    );
    if (!ok) return;
    setRequesting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_verification_requests")
      .insert({ user_id: user.id, status: "pending" });
    setRequesting(false);
    if (error) {
      toast.error("Couldn't send request — try again in a moment.");
      return;
    }
    toast.success("Request received — our team will reach out within 48 hours.");
    loadVerif();
  }

  // Saved vendors render only after both the saves set and the vendor
  // cache are hydrated; otherwise we'd flash an empty state for hosts
  // who do have saves.
  const savedVendors = useMemo(
    () => vendors.filter((v) => savedIds.has(v.id)),
    [vendors, savedIds],
  );
  const listingsLoading = vendorsLoading || savedLoading;

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={customerNavItems}
        title="Account"
        backPath="/customer/profile"
      />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-editorial text-3xl">Account</h1>
            <p className="text-sm text-muted-foreground">
              Saved vendors and verification.
            </p>
          </div>
          <NotificationBell variant="light" />
        </div>

        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
          {/* Saved Listings */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-editorial text-2xl">Saved listings</h2>
              {!listingsLoading && savedVendors.length > 0 ? (
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {savedVendors.length} saved
                </span>
              ) : null}
            </div>

            {listingsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
                ))}
              </div>
            ) : savedVendors.length === 0 ? (
              <div
                className="rounded-2xl p-10 text-center"
                style={{
                  background: "rgba(255,253,250,0.6)",
                  border: "0.5px solid rgba(255,138,76,0.18)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                  <Heart className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="font-display text-xl">No saved vendors yet</p>
                <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm mx-auto leading-relaxed">
                  Tap the heart on any vendor card while browsing and they'll
                  show up here for easy reference.
                </p>
                <Link
                  to="/customer/explore"
                  className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Browse vendors
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {savedVendors.map((v) => (
                  <VendorCard key={v.id} vendor={v} />
                ))}
              </div>
            )}
          </section>

          {/* Verification */}
          <section>
            <h2 className="font-editorial text-2xl mb-4">Verification</h2>
            {verifLoading ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : (
              <VerificationCard
                status={verifStatus}
                requesting={requesting}
                onRequest={requestVerification}
              />
            )}
          </section>

          {/* Subscriptions */}
          <section>
            <h2 className="font-editorial text-2xl mb-4">Subscriptions</h2>
            <div
              className="rounded-2xl p-8 text-center"
              style={{
                background: "rgba(255,253,250,0.6)",
                border: "0.5px solid rgba(255,138,76,0.18)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-editorial italic text-2xl">Coming soon</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
                Premium host plans for unlimited inquiries, priority replies,
                and concierge support are on the way.
              </p>
            </div>
          </section>
        </div>
      </main>
      <MobileNav items={customerNavItems} />
    </div>
  );
}

function VerificationCard({
  status,
  requesting,
  onRequest,
}: {
  status: VerifStatus;
  requesting: boolean;
  onRequest: () => void;
}) {
  if (status === "approved") {
    return (
      <ActionCard
        onClick={() =>
          toast.success(
            "Verified host — vendors see a badge on your inquiries.",
          )
        }
        icon={CheckCircle2}
        iconBg="bg-emerald-500"
        iconColor="text-white"
        title="You're verified"
        subtitle="Vendors prioritize verified hosts."
      />
    );
  }
  if (status === "pending") {
    return (
      <ActionCard
        onClick={() =>
          toast.message("Verification pending — we'll email you within 48h.")
        }
        icon={Clock}
        iconBg="bg-amber-500"
        iconColor="text-white"
        title="Verification pending"
        subtitle="We'll reach out within 48 hours."
      />
    );
  }
  return (
    <ActionCard
      onClick={requesting ? undefined : onRequest}
      icon={Award}
      iconBg="bg-foreground"
      iconColor="text-background"
      title={status === "rejected" ? "Try verifying again" : "Become Verified"}
      subtitle="Build trust with vendors. Faster replies, better matches."
    />
  );
}

function ActionCard({
  onClick,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  subtitle,
}: {
  onClick?: () => void;
  icon: typeof Award;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="w-full text-left rounded-3xl bg-card border border-border/60 shadow-[0_8px_24px_-16px_rgba(26,20,16,0.16)] p-4 flex items-center gap-3 hover:bg-secondary/40 transition disabled:opacity-70 disabled:cursor-default"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}
      >
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {subtitle ? (
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        ) : null}
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </button>
  );
}
