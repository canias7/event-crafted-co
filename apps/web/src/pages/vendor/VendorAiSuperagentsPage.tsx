// My Space — vendor portal AI surface. One chatbox on the left,
// inbox auto-reply controls on the right. Replaces the previous
// HILUX + AXION dual-card layout: image generation is now inline in
// the chatbox (server routes prompts to OpenAI gpt-image-1), and
// text replies use Claude Sonnet.
//
// URL kept at /vendor/ai-superagents for bookmark stability; the
// sidebar label is "My Space".

import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { vendorNavItems as navItems } from "@/data/navItems";
import { MySpaceChat } from "@/components/super-agents/MySpaceChat";

export default function VendorAiSuperagentsPage() {
  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main id="main-content" className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-editorial text-3xl">My Space</h1>
            <p className="text-sm text-muted-foreground">
              Your AI — drafts replies, generates images, runs your inbox.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell variant="light" />
          </div>
        </div>

        {/* Auto-reply toggles moved to /vendor/inbox (gear button in
            the header) since they govern inbox behavior, not the
            chatbox. My Space is now chatbox-only, full width. */}
        <div className="p-4 md:p-8">
          <MySpaceChat />
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
