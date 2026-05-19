import { Check, Crown } from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Subscription / plan surface. Vendora is free today; this page sets
// up the wayfinding for the future Stripe-billed Pro tier. The
// Upgrade button stubs to a toast until Stripe Customer Portal is
// wired (operator action — see CLAUDE.md "RESEND_API_KEY" + similar
// pattern for the missing keys).

const FREE_INCLUDED = [
  "Unlimited inquiries from hosts",
  "Calendar + availability blocking",
  "Vendor-to-vendor DMs",
  "Public listing on the Vendora directory",
];

const PRO_PREVIEW = [
  "Lower booking fee per won inquiry",
  "Featured placement in search",
  "Custom branding on proposal PDFs",
  "AI Superagents — auto-reply drafts on every new inquiry",
  "Priority support",
];

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

          {/* Pro preview card */}
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
                  <p className="font-label text-muted-foreground">
                    Coming soon
                  </p>
                  <h2 className="font-editorial text-2xl mt-0.5">Vendora Pro</h2>
                </div>
              </div>
              <Button
                onClick={() =>
                  toast.info(
                    "Pro launches soon — we'll email you the moment it's open.",
                  )
                }
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Crown className="w-4 h-4 mr-1.5" />
                Notify me
              </Button>
            </div>

            <ul className="mt-5 space-y-2">
              {PRO_PREVIEW.map((line) => (
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
            Billing is handled via Stripe. Questions about your plan?{" "}
            <a
              href="mailto:hello@vendora.events"
              className="underline underline-offset-2"
            >
              hello@vendora.events
            </a>
          </p>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
