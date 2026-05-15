// Studio — vendor content tools hub.
//
// Mirrors the mobile (vendor-mobile) Studio tab: three tiles routing
// to the matching surface. AI Superagents goes to the existing
// /vendor/ai-agent page; Gallery goes to the listing builder
// (which hosts photo gallery + packages + faqs); Vendora Pay is a
// non-clickable "coming soon" tile.
//
// The previous studio inlined Image Editor + Gallery + Packages tabs;
// that surface lost the hub feel. Image Editor was a stub. Gallery
// editing now lives on /vendor/listing alongside the rest of the
// listing content.

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

export default function VendorStudioPage() {
  return (
    <div className="min-h-screen bg-background flex">
      <DashboardSidebar items={navItems} title="Studio" backPath="/vendor/dashboard" />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="px-5 pt-8 pb-12 md:px-12 md:pt-12 max-w-3xl mx-auto md:mx-0">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Studio
          </h1>
          <p className="mt-2 mb-7 text-base text-muted-foreground">
            Content tools for your listing
          </p>

          <div className="flex flex-col gap-3.5">
            <FeaturedTile
              title="AI Superagents"
              subtitle="Smart agents that reply, qualify, and follow up for you"
              to="/vendor/ai-agent"
            />
            <ComingSoonTile
              title="Vendora Pay"
              subtitle="Take deposits + final payments through Vendora"
            />
            <PlainTile
              title="Gallery"
              subtitle="Upload portfolio images, drag to reorder"
              to="/vendor/listing"
            />
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

// Featured tile — peach gradient, biggest visual weight. Matches the
// vendor-mobile FeaturedTile component pixel for pixel.
function FeaturedTile({
  title,
  subtitle,
  to,
}: {
  title: string;
  subtitle: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-2xl px-5 py-4 transition active:opacity-80"
      style={{
        minHeight: 82,
        background:
          "linear-gradient(135deg, #fbc88a 0%, #fcd9a3 50%, #fce6c4 100%)",
      }}
    >
      <div className="flex-1 pr-3">
        <h2 className="text-lg font-bold text-[#1a1a1a]">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-[17px] text-[#1a1a1a]/70">
          {subtitle}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-[#1a1a1a] transition group-hover:translate-x-0.5" />
    </Link>
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

// Plain tile — outlined, clickable, chevron right.
function PlainTile({
  title,
  subtitle,
  to,
}: {
  title: string;
  subtitle: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-2xl border border-black/10 px-5 py-4 transition hover:bg-foreground/5 active:opacity-70"
    >
      <div className="flex-1 pr-3">
        <h2 className="text-lg font-bold text-[#1a1a1a]">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-[17px] text-black/55">
          {subtitle}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-[#1a1a1a] transition group-hover:translate-x-0.5" />
    </Link>
  );
}
