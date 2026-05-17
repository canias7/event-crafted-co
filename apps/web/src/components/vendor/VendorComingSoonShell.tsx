import { type LucideIcon } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

// Shared shell for the three forward-looking vendor tools that don't
// have working implementations yet (AI Superagents, Vendora Pay,
// Gallery). Each landing page is a thin wrapper that hands the title +
// subtitle + icon to this shell.

export function VendorComingSoonShell({
  title,
  subtitle,
  Icon,
}: {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="min-h-screen vendor-canvas flex">
      <DashboardSidebar
        items={navItems}
        title="Vendor Portal"
        backPath="/vendor/home"
      />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="px-5 pt-8 pb-12 md:px-12 md:pt-12 max-w-3xl mx-auto md:mx-0">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 mb-10 text-base text-muted-foreground">
            {subtitle}
          </p>

          <div
            className="rounded-2xl p-10 md:p-14 text-center"
            style={{
              background: "rgba(255,253,250,0.6)",
              border: "0.5px solid rgba(255,138,76,0.22)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <div
              className="w-14 h-14 mx-auto rounded-full inline-flex items-center justify-center mb-5"
              style={{
                background: "rgba(255,138,76,0.18)",
                color: "#c4541e",
              }}
            >
              <Icon className="w-6 h-6" />
            </div>
            <h2 className="font-editorial italic text-3xl mb-2">
              Coming soon
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {subtitle}. We're shipping this in a future release.
            </p>
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
