import { Wand2, Sparkles } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

// Studio landing surface — placeholder shell. The future home for
// creative tooling: portfolio editor, social-card generator, mood
// board curation, and other visual production utilities. Sits next
// to AI Agent in the sidebar so vendors have a clear "build" lane
// alongside the operational lanes (Inbox / Messages / Calendar).

export default function VendorStudioPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Studio</h1>
          <p className="text-sm text-muted-foreground">
            Creative tooling for portfolios, social cards, and mood work
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          <div className="rounded-sm border border-border bg-card p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
              <Wand2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="font-display text-xl mb-2">
              Your Studio will live here
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
              Visual production tools for shaping how your work shows up —
              portfolio composition, social cards, mood references. Coming
              online soon.
            </p>
            <p className="font-label text-accent inline-flex items-center gap-1.5 mt-6">
              <Sparkles className="w-3 h-3" />
              In development
            </p>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
