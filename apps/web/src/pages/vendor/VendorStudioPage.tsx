// Studio — vendor content tools hub.
//
// Mirrors the mobile (vendor-mobile) Studio tab. AI Superagents,
// Vendora Pay, and Gallery are all forward-looking surfaces — none of
// them currently has a live web route (AI agent + the listing builder
// were both deleted in the route cleanup), so every tile here is a
// "coming soon" placeholder for now.

import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

export default function VendorStudioPage() {
  return (
    <div className="min-h-screen vendor-canvas flex">
      <DashboardSidebar items={navItems} title="Studio" backPath="/vendor/home" />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="px-5 pt-8 pb-12 md:px-12 md:pt-12 max-w-3xl mx-auto md:mx-0">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Studio
          </h1>
          <p className="mt-2 mb-7 text-base text-muted-foreground">
            Content tools for your listing
          </p>

          <div className="flex flex-col gap-3.5">
            <ComingSoonTile
              title="AI Superagents"
              subtitle="Smart agents that reply, qualify, and follow up for you"
            />
            <ComingSoonTile
              title="Vendora Pay"
              subtitle="Take deposits + final payments through Vendora"
            />
            <ComingSoonTile
              title="Gallery"
              subtitle="Upload portfolio images, drag to reorder"
            />
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

// Coming soon tile — dimmed, non-clickable, pill badge next to title.
function ComingSoonTile({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 px-5 py-4 opacity-55">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-[#1a1a1a]">{title}</h2>
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-black/50">
          Coming soon
        </span>
      </div>
      <p className="mt-0.5 text-[13px] leading-[17px] text-black/45">
        {subtitle}
      </p>
    </div>
  );
}
