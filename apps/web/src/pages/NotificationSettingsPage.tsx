// Notification preferences — broken out from /settings so the main
// settings page doesn't carry five Bell rows. The toggles still write
// to the same JSONB column (profiles.notification_prefs); the
// server-side notify_* triggers honor every key via is_notif_enabled().
//
// Flipping a switch silences all three channels (in-app bell, push,
// email) for that kind. Marketing default-off (per migration
// 20260504200000); everything else default-on.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import {
  customerNavItems,
  getLastDashboardSide,
  vendorNavItems,
} from "@/data/navItems";

type NotifPrefs = {
  new_inquiry: boolean;
  proposal_accepted: boolean;
  review_received: boolean;
  weekly_digest: boolean;
  daily_digest: boolean;
  marketing: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  new_inquiry: true,
  proposal_accepted: true,
  review_received: true,
  weekly_digest: true,
  daily_digest: true,
  marketing: false,
};

// Rows in display order. Titles and subtitles live in the "settings"
// namespace under notifications.prefs.<key>.
const PREFS: Array<keyof NotifPrefs> = [
  "new_inquiry",
  "proposal_accepted",
  "review_received",
  "weekly_digest",
  "marketing",
];

export default function NotificationSettingsPage() {
  const { user, isApprovedVendor } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("settings");
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("profiles")
        .select("notification_prefs")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const incoming = (data?.notification_prefs ?? {}) as Partial<NotifPrefs>;
      setPrefs({ ...DEFAULT_PREFS, ...incoming });
      setPrefsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function togglePref(key: keyof NotifPrefs, next: boolean) {
    if (!user?.id) return;
    // Optimistic local update so the switch flips instantly; roll
    // back on error.
    const optimistic = { ...prefs, [key]: next };
    setPrefs(optimistic);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ notification_prefs: optimistic })
      .eq("id", user.id);
    if (error) {
      setPrefs(prefs);
      toast.error(t("notifications.update_error"));
    }
  }

  const lastSide = getLastDashboardSide();
  const useVendorNav =
    lastSide === "vendor" || (lastSide === null && isApprovedVendor);
  const navItems = useVendorNav ? vendorNavItems : customerNavItems;
  const sidebarTitle = useVendorNav ? "Vendor Portal" : "Customer";

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title={sidebarTitle} backPath="/" />

      <main id="main-content" className="min-w-0 flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-5 md:px-8 py-5 sticky top-0 z-40">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("notifications.back")}
          </button>
          <h1 className="font-editorial text-3xl">{t("notifications.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("notifications.subtitle")}
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-2xl">
          {!prefsLoaded ? (
            <Skeleton className="h-72 w-full rounded-2xl" />
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
              }}
            >
              {PREFS.map((key, i) => {
                const title = t(`notifications.prefs.${key}.title`);
                return (
                  <div key={key}>
                    {i > 0 ? (
                      <div
                        className="h-px"
                        style={{ background: "rgba(0,0,0,0.08)" }}
                      />
                    ) : null}
                    <div className="flex items-center gap-4 px-4 md:px-5 py-4">
                      <div
                        className="w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0"
                        style={{
                          background: "rgba(0,0,0,0.14)",
                          color: "#14161a",
                        }}
                      >
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground leading-tight">
                          {title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {t(`notifications.prefs.${key}.subtitle`)}
                        </p>
                      </div>
                      <Switch
                        checked={prefs[key]}
                        onCheckedChange={(v) => togglePref(key, v)}
                        aria-label={t("notifications.toggle_label", { title })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
