import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

// Calendar tab — intentionally a clean, blank monthly grid.

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function VendorAppointmentsPage() {
  const cells = Array.from({ length: 35 });

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Calendar</h1>
        </div>

        <div className="p-4 md:p-10 max-w-4xl mx-auto">
          <div className="bg-card border border-border p-6 md:p-10">
            <p className="text-center text-xs tracking-[0.4em] text-foreground/70 mb-6">
              BLANK CALENDAR
            </p>
            <h2 className="font-display text-5xl md:text-6xl mb-6">Month:</h2>

            <div className="grid grid-cols-7 border-l border-t border-foreground">
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="border-r border-b border-foreground py-2 text-center text-[10px] md:text-xs tracking-[0.2em] font-medium"
                >
                  {d}
                </div>
              ))}
              {cells.map((_, i) => (
                <div
                  key={i}
                  className="border-r border-b border-foreground aspect-square"
                />
              ))}
            </div>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
