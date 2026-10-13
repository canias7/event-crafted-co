import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, ChevronRight, FileText, LogOut, Lock, Mail, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { customerNavItems, getLastDashboardSide, vendorNavItems } from "@/data/navItems";
import { EmailMenu } from "@/components/shared/EmailMenu";

// Account settings — rowed-card layout. Each row is icon + title +
// subtitle on the left, value or action pill on the right, divided by
// hairlines. Identity edits live on /vendor/edit-profile; this surface
// is intentionally minimal (email on file + sign out + delete account).
export default function SettingsPage() {
  const { user, profile, isApprovedVendor, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("settings");

  const lastSide = getLastDashboardSide();
  const useVendorNav =
    lastSide === "vendor" || (lastSide === null && isApprovedVendor);
  const navItems = useVendorNav ? vendorNavItems : customerNavItems;
  const sidebarTitle = useVendorNav ? "Vendor Portal" : "Customer";

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title={sidebarTitle} backPath="/" />

      <main id="main-content" className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-5 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </div>

        <div className="p-4 md:p-8 max-w-2xl">
          {/* VendoraPay connection removed from Settings (front-end only).
              The VendoraPayConnection component is kept in the repo and can
              be re-added here when payouts are re-enabled. */}
          {!profile ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
              }}
            >
              <SettingRow
                Icon={Mail}
                title={t("email.title")}
                subtitle={t("email.subtitle")}
                right={
                  <EmailMenu align="end" asChild>
                    <button
                      type="button"
                      className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate"
                      title={t("email.change_hint")}
                    >
                      {user?.email ?? ""}
                    </button>
                  </EmailMenu>
                }
              />
              {/* Notifications — collapsed into a single row that links
                  to the dedicated /settings/notifications page. Five
                  Bell rows inline made the surface dense; this keeps
                  Settings scannable. The toggles + backing storage are
                  unchanged — see NotificationSettingsPage. */}
              <RowDivider />
              <SettingRow
                Icon={Bell}
                title={t("notifications_row.title")}
                subtitle={t("notifications_row.subtitle")}
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => navigate("/settings/notifications")}
                  >
                    {t("notifications_row.manage")}
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                }
              />
              <RowDivider />
              {/* Legal — two lightweight rows linking the Terms and
                  Privacy pages the user already accepted on signup so
                  they're a click away if needed. */}
              <SettingRow
                Icon={FileText}
                title={t("terms.title")}
                subtitle={t("terms.subtitle")}
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => navigate("/terms")}
                  >
                    {t("view")}
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Lock}
                title={t("privacy.title")}
                subtitle={t("privacy.subtitle")}
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => navigate("/privacy")}
                  >
                    {t("view")}
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={LogOut}
                title={t("sign_out.title")}
                subtitle={t("sign_out.subtitle")}
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={async () => {
                      await signOut();
                      navigate("/");
                    }}
                  >
                    <LogOut className="w-3.5 h-3.5 mr-1.5" />
                    {t("sign_out.button")}
                  </Button>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Trash2}
                tone="destructive"
                title={t("delete.title")}
                subtitle={
                  isApprovedVendor
                    ? t("delete.subtitle_vendor")
                    : t("delete.subtitle")
                }
                right={<DeleteAccountButton />}
              />
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function SettingRow({
  Icon,
  title,
  subtitle,
  right,
  tone,
}: {
  Icon: typeof Mail;
  title: string;
  subtitle: string;
  right: React.ReactNode;
  tone?: "destructive";
}) {
  const destructive = tone === "destructive";
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span
        className="shrink-0 w-10 h-10 rounded-xl inline-flex items-center justify-center"
        style={{
          background: destructive
            ? "hsl(var(--destructive) / 0.1)"
            : "hsl(var(--muted))",
          color: destructive ? "#b23a34" : "#f4f1ea",
        }}
        aria-hidden
      >
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[15px] font-semibold leading-tight ${
            destructive ? "text-destructive" : "text-foreground"
          }`}
        >
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug truncate">
          {subtitle}
        </p>
      </div>
      <div className="shrink-0 max-w-[55%] flex items-center justify-end overflow-hidden">
        {right}
      </div>
    </div>
  );
}

function RowDivider() {
  return (
    <div
      aria-hidden
      style={{
        height: "0.5px",
        background: "rgba(255,255,255,0.06)",
        marginLeft: "1.25rem",
        marginRight: "1.25rem",
      }}
    />
  );
}
