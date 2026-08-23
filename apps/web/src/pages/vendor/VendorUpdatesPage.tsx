// What's new — web twin of the app's More → "Upcoming updates" screen.
//
// Content comes from @vendora/core (SHIPPED / COMING) so the phone and
// the website can never show a different release history. To add an
// entry, edit packages/core/src/lib/vendorUpdates.ts.

import { Sparkles } from "lucide-react";
import { COMING, SHIPPED, hasFreshUpdate } from "@vendora/core";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

export default function VendorUpdatesPage() {
  const fresh = hasFreshUpdate();

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-4 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            What&rsquo;s new <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything we&rsquo;ve shipped for vendors lately, and a look at
            what&rsquo;s next.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[760px] space-y-8">
          <section aria-labelledby="shipped-heading" className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 id="shipped-heading" className="text-xl tracking-tight">
                Shipped
              </h2>
              {fresh ? (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-accent">
                  New
                </span>
              ) : null}
            </div>

            <ol className="space-y-2">
              {SHIPPED.map((u, i) => (
                <li
                  key={`${u.date}-${u.title}`}
                  className="rounded-sm border bg-card p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-medium">{u.title}</h3>
                    <span className="text-xs text-muted-foreground">
                      {u.date}
                      {i === 0 && fresh ? (
                        <span className="ml-2 text-accent font-semibold">
                          Latest
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {u.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="coming-heading" className="space-y-3">
            <h2 id="coming-heading" className="text-xl tracking-tight">
              Coming next
            </h2>
            <ul className="rounded-sm border bg-card divide-y">
              {COMING.map((c) => (
                <li key={c} className="flex items-center gap-3 p-4 text-sm">
                  <Sparkles
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-accent"
                  />
                  {c}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              No dates or promises — this is what we&rsquo;re working on next.
            </p>
          </section>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
