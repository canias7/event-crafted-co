import { Link, useLocation } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import {
  customerNavItems,
  vendorNavItems,
  adminNavItems,
  type NavItem,
} from "@/data/navItems";

interface Props {
  side: "customer" | "vendor" | "admin";
  /** Override the auto-detected title (otherwise pulled from nav config). */
  title?: string;
  /** Short description of what's coming. */
  description?: string;
  /** Where to nudge the user toward instead. */
  primaryCtaLabel?: string;
  primaryCtaPath?: string;
}

export default function ComingSoonPage({
  side,
  title,
  description,
  primaryCtaLabel,
  primaryCtaPath,
}: Props) {
  const location = useLocation();
  const navItems: NavItem[] =
    side === "customer"
      ? customerNavItems
      : side === "vendor"
        ? vendorNavItems
        : adminNavItems;
  const matched = navItems.find((n) => n.path === location.pathname);
  const heading = title ?? matched?.label ?? "Coming soon";
  const sidebarTitle =
    side === "customer"
      ? "Customer"
      : side === "vendor"
        ? "Vendor Portal"
        : "Admin";
  const fallbackCtaPath =
    side === "customer"
      ? "/customer/dashboard"
      : side === "vendor"
        ? "/vendor/dashboard"
        : "/admin/dashboard";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={sidebarTitle} backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">{heading}</h1>
          <p className="text-sm text-muted-foreground">Coming soon</p>
        </div>

        <div className="p-6 md:p-12 max-w-2xl">
          <div className="rounded-sm border border-border bg-card p-8 md:p-10 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center mb-5">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <h2 className="font-display text-2xl mb-3">
              {heading} is coming soon
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md mx-auto">
              {description ??
                "We're actively building this. We'll email you when it's ready."}
            </p>
            <Link to={primaryCtaPath ?? fallbackCtaPath}>
              <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                {primaryCtaLabel ?? "Back to dashboard"}
                <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
