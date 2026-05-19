import { Check, Crown } from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Subscription / plan surface. Vendora has 5 vendor tiers; today
// we ship the Free tier on every account by default and a Pro
// preview here for the upgrade flow. The remaining tiers + the
// grandfathered-account exception list land once their pricing is
// finalized. Until Stripe is wired the Upgrade CTA stubs to a
// toast — see CLAUDE.md for the missing-keys pattern.

const FREE_INCLUDED = [
  "1 listing per account",
  "Unlimited inquiries from hosts",
  "Calendar + availability blocking",
  "Vendor-to-vendor DMs",
  "Public listing on the Vendora directory",
];

const PRO_INCLUDED = [
  "Up to 5 listings per account",
  "Everything in Free",
  "Featured placement in search (coming soon)",
  "AI Superagents — auto-reply drafts (coming soon)",
  "Priority support",
];

const PRO_PRICE = 19.99;

export default function VendorSubscriptionPage() {
  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">Subscription</h1>
          <p className="text-sm text-muted-foreground">
            Your Vendora plan and billing
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-4">
          {/* Current plan card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(255,253,250,0.7)",
              border: "0.5px solid rgba(255,138,76,0.22)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-label text-muted-foreground">
                  Current plan
                </p>
                <h2 className="font-editorial text-3xl mt-1">Free</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  All the essentials to land bookings on Vendora.
                </p>
              </div>
              <span
                className="inline-flex items-center text-[11px] font-medium rounded-full px-2.5 py-1"
                style={{
                  background: "rgba(255,138,76,0.14)",
                  color: "#c4541e",
                }}
              >
                Active
              </span>
            </div>

            <ul className="mt-5 space-y-2">
              {FREE_INCLUDED.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-sm text-foreground/85"
                >
                  <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro tier card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,138,76,0.10), rgba(255,138,76,0.04))",
              border: "0.5px solid rgba(255,138,76,0.30)",
            }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span
                  className="shrink-0 w-10 h-10 rounded-xl inline-flex items-center justify-center"
                  style={{
                    background: "rgba(255,138,76,0.18)",
                    color: "#c4541e",
                  }}
                  aria-hidden
                >
                  <Crown className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-label text-muted-foreground">Upgrade</p>
                  <h2 className="font-editorial text-2xl mt-0.5">Vendora Pro</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <span className="font-semibold text-foreground tnum">
                      ${PRO_PRICE.toFixed(2)}
                    </span>{" "}
                    / month
                  </p>
                </div>
              </div>
              <Button
                onClick={() =>
                  toast.info(
                    "Pro checkout is launching soon — we'll email you the moment it's live.",
                  )
                }
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Crown className="w-4 h-4 mr-1.5" />
                Upgrade to Pro
              </Button>
            </div>

            <ul className="mt-5 space-y-2">
              {PRO_INCLUDED.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-sm text-foreground/80"
                >
                  <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground px-2">
            Three more tiers are landing soon with different listing caps
            and add-ons. Want a heads-up?{" "}
            <a
              href="mailto:hello@vendora.events"
              className="underline underline-offset-2"
            >
              hello@vendora.events
            </a>
          </p>

          <p className="text-xs text-muted-foreground px-2">
            Billing is handled via Stripe.
          </p>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
