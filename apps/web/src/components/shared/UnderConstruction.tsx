import { Construction } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";

// Temporary "under construction" treatment for surfaces we've paused on
// the front end while keeping all their code + backend intact. The real
// page/component is left untouched in the repo and can be re-enabled by
// reverting the small call-site swap that points here. Nothing here
// deletes data or routes — it's purely a front-end gate.

// Content-area panel: a blurred decorative skeleton (hinting at the page
// that's coming) under a frosted "under construction" card. Drop it into
// any layout that already provides the surrounding chrome.
export function UnderConstruction({ title }: { title?: string }) {
  return (
    <div className="relative flex-1 min-h-[70vh] overflow-hidden">
      {/* Blurred decorative skeleton. */}
      <div
        aria-hidden
        className="absolute inset-0 p-6 md:p-10 blur-[6px] opacity-50 pointer-events-none select-none"
      >
        <div className="h-9 w-56 rounded-full bg-foreground/10 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="h-28 rounded-2xl bg-foreground/10" />
          <div className="h-28 rounded-2xl bg-foreground/10" />
          <div className="h-28 rounded-2xl bg-foreground/10" />
        </div>
        <div className="h-72 rounded-2xl bg-foreground/10" />
      </div>

      {/* Frosted overlay + message. */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div
          className="text-center max-w-sm rounded-2xl px-8 py-10"
          style={{
            background: "rgba(255,255,255,0.72)",
            border: "0.5px solid rgba(0,0,0,0.08)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 10px 40px -16px rgba(0,0,0,0.25)",
          }}
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-foreground/10 flex items-center justify-center mb-4">
            <Construction className="w-6 h-6 text-foreground/70" />
          </div>
          <h2 className="font-editorial text-2xl mb-2">
            {title ? `${title} — under construction` : "Under construction"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We&apos;re polishing this up. It&apos;ll be back shortly — thanks for
            your patience.
          </p>
        </div>
      </div>
    </div>
  );
}

// Full-page version: vendor sidebar chrome + the panel above. Use as a
// route element for a deactivated standalone page.
export function UnderConstructionPage({ title }: { title?: string }) {
  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={vendorNavItems} title="Vendor Portal" backPath="/" />
      <div className="flex-1 min-w-0 flex flex-col">
        <UnderConstruction title={title} />
      </div>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}
