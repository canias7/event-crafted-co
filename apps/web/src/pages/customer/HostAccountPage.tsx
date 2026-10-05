// Host account hub — saved vendors + verification CTA. Reached from
// the "Account settings" tile on /customer/profile. Distinct from
// /settings (email-on-file + sign out + delete) — that surface is
// still its own page; this one is account-level housekeeping the host
// touches more often.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle2, ChevronRight, Clock, Heart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("hostAccount");
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
    const ok = window.confirm(t("verification.confirm"));
    if (!ok) return;
    setRequesting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_verification_requests")
      .insert({ user_id: user.id, status: "pending" });
    setRequesting(false);
    if (error) {
      toast.error(t("verification.requestFailed"));
      return;
    }
    toast.success(t("verification.requestReceived"));
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
        title={t("title")}
        backPath="/customer/profile"
      />
      <main id="main-content" className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-5 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-editorial text-3xl">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <NotificationBell variant="light" />
        </div>

        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
          {/* Saved Listings */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-editorial text-2xl">{t("saved.title")}</h2>
              {!listingsLoading && savedVendors.length > 0 ? (
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("saved.count", { count: savedVendors.length })}
                </span>
              ) : null}
            </div>

            {listingsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
                ))}
              </div>
            ) : savedVendors.length === 0 ? (
              <div
                className="rounded-2xl p-10 text-center"
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                  <Heart className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="font-display text-xl">{t("saved.emptyTitle")}</p>
                <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm mx-auto leading-relaxed">
                  {t("saved.emptyBody")}
                </p>
                <Link
                  to="/customer/explore"
                  className="inline-flex justify-center items-center gap-2 rounded-full bg-gold text-foreground px-5 text-sm font-bold hover:bg-gold-hover transition-colors h-11"
                >
                  {t("saved.browse")}
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {savedVendors.map((v) => (
                  <VendorCard key={v.id} vendor={v} />
                ))}
              </div>
            )}
          </section>

          {/* Verification */}
          <section>
            <h2 className="font-editorial text-2xl mb-4">{t("verification.title")}</h2>
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
            <h2 className="font-editorial text-2xl mb-4">{t("subscriptions.title")}</h2>
            <div
              className="rounded-2xl p-8 text-center"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
              }}
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-editorial text-2xl">{t("subscriptions.comingSoon")}</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
                {t("subscriptions.body")}
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
  const { t } = useTranslation("hostAccount");
  if (status === "approved") {
    return (
      <ActionCard
        onClick={() =>
          toast.success(
            t("verification.verifiedToast"),
          )
        }
        icon={CheckCircle2}
        iconBg="bg-accent"
        iconColor="text-white"
        title={t("verification.verifiedTitle")}
        subtitle={t("verification.verifiedSubtitle")}
      />
    );
  }
  if (status === "pending") {
    return (
      <ActionCard
        onClick={() =>
          toast.message(t("verification.pendingToast"))
        }
        icon={Clock}
        iconBg="bg-foreground"
        iconColor="text-white"
        title={t("verification.pendingTitle")}
        subtitle={t("verification.pendingSubtitle")}
      />
    );
  }
  return (
    <ActionCard
      onClick={requesting ? undefined : onRequest}
      icon={Award}
      iconBg="bg-foreground"
      iconColor="text-background"
      title={status === "rejected" ? t("verification.retryTitle") : t("verification.requestTitle")}
      subtitle={t("verification.requestSubtitle")}
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
      className="w-full text-left rounded-2xl bg-card border border-border p-4 flex items-center gap-3 hover:bg-secondary/40 transition disabled:opacity-70 disabled:cursor-default"
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
