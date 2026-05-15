import { useTranslation } from "react-i18next";
import { Bot, Sparkles } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

// AI Agent landing surface — placeholder shell. The eventual home for
// the auto-reply agent that drafts replies to inquiries, suggests
// pricing, and pre-qualifies leads. Lives behind the sidebar so it
// can be iterated on without affecting the rest of the dashboard.

export default function VendorAiAgentPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border/40 bg-card/60 backdrop-blur px-4 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">{t("ai_agent.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("ai_agent.subtitle")}
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          <div className="card-soft p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
              <Bot className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="font-display text-xl mb-2">
              {t("ai_agent.placeholder_title")}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
              {t("ai_agent.placeholder_body")}
            </p>
            <p className="font-label text-accent inline-flex items-center gap-1.5 mt-6">
              <Sparkles className="w-3 h-3" />
              {t("ai_agent.in_development")}
            </p>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
