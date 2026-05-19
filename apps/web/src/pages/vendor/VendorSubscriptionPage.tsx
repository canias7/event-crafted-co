import { Check, Crown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Subscription / plan surface. Vendora has 5 vendor tiers:
//   1. Free — every account by default. 1 listing.
//   2. Pro — $19.99/mo. 5 listings.
//   3-5. Three AI Superagents tiers — separate from Pro, gate the
//        auto-reply / AI-assist features that live on /vendor/ai-
//        superagents.
//
// A grandfathered-accounts whitelist gets the multi-listing benefit
// on Free; that list lands later. Until Stripe is wired the Upgrade
// CTA stubs to a toast.

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

          {/* AI Superagents teaser — three more plans land here.
              Sends vendors to the dedicated /vendor/ai-superagents
              surface where the agent tiers live. */}
          <div
            className="rounded-2xl p-5 flex items-start gap-3"
            style={{
              background: "rgba(255,253,250,0.7)",
              border: "0.5px dashed rgba(255,138,76,0.30)",
            }}
          >
            <span
              className="shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
              style={{
                background: "rgba(255,138,76,0.14)",
                color: "#c4541e",
              }}
              aria-hidden
            >
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium">AI Superagents — 3 plans, coming soon</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Auto-reply drafts on every inquiry, smart follow-ups, and
                proposal generation. Sold separately from Pro.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground px-2">
            Billing is handled via Stripe.
          </p>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
