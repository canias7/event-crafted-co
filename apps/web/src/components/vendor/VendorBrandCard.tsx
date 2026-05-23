// Cream-Ocean brand identity card for the public vendor detail page.
// Visual shell (gradient, ripples, border, flip) is shared with the
// account profile header via BrandCardShell — change colors / shadows
// / ripple count there once and both surfaces update together.

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandCardShell } from "@/components/vendor/BrandCardShell";
import { StudioVerifiedBadge } from "@/components/vendor/StudioVerifiedBadge";

// Brand identity for the public listing card. logo_url is mirrored
// from profiles to vendor_profiles via a trigger, but business_name
// and bio are NOT — the listing wizard ships them as null, so we
// embed the owner's brand via vendor_brands (the public-safe view
// over profiles) and fall back when the per-listing fields are null.
interface VendorRow {
  business_name: string | null;
  logo_url: string | null;
  bio: string | null;
  location: string | null;
  verified_at: string | null;
  created_at: string | null;
  // subscription_tier lives on the embedded brand view (profiles)
  // now — see migrations 20260524000000 + 20260524000200. The
  // column still exists on vendor_profiles for soak but is stale.
  brand: {
    business_name: string | null;
    bio: string | null;
    subscription_tier: string | null;
  } | null;
}

export function VendorBrandCard({ vendorId }: { vendorId: string }) {
  const [row, setRow] = useState<VendorRow | null>(null);
  const [ratingAvg, setRatingAvg] = useState<number | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      // Bookings removed — Vendora is intro / matchmaking only; the
      // actual booking happens outside the app, so a "Bookings"
      // counter would always be 0 and misleading.
      const [vp, rev] = await Promise.all([
        supabase
          .from("vendor_profiles")
          .select(
            "business_name, logo_url, bio, location, verified_at, created_at, brand:vendor_brands!vendor_profiles_user_id_fkey(business_name, bio, subscription_tier)",
          )
          .eq("id", vendorId)
          .maybeSingle(),
        supabase
          .from("reviews")
          .select("rating")
          .eq("vendor_id", vendorId)
          // Brand card surfaces the vendor's *incoming* rating —
          // host's review of vendor. Drop vendor-side ratings of
          // hosts so they don't drag the brand score down.
          .eq("rater_role", "host"),
      ]);
      if (cancelled) return;
      setRow((vp.data as VendorRow | null) ?? null);
      const ratings = (rev.data as Array<{ rating: number }> | null) ?? [];
      setRatingAvg(
        ratings.length === 0
          ? null
          : ratings.reduce((s, r) => s + r.rating, 0) / ratings.length,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (!row) return null;

  const businessName =
    row.business_name?.trim() ||
    row.brand?.business_name?.trim() ||
    "Vendor";
  const bio = row.bio?.trim() || row.brand?.bio?.trim() || null;
  const initial = businessName[0]?.toUpperCase() ?? "V";
  const memberSinceYear = row.created_at
    ? String(new Date(row.created_at).getFullYear())
    : null;
  const verified = !!row.verified_at;
  const studioVerified = row.brand?.subscription_tier === "studio";
  const logoUrl = row.logo_url ?? null;

  return (
    <BrandCardShell businessName={businessName} bio={bio}>
      <div className="flex items-center gap-5 pl-14 sm:pl-16">
        <div className="relative shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={businessName}
              className="w-[110px] h-[110px] rounded-[20px] object-cover bg-[#0a0a0a]"
              style={{ boxShadow: "0 6px 18px -6px rgba(26,20,16,0.3)" }}
            />
          ) : (
            <div
              className="w-[110px] h-[110px] rounded-[20px] bg-[#0a0a0a] flex items-center justify-center"
              style={{ boxShadow: "0 6px 18px -6px rgba(26,20,16,0.3)" }}
            >
              <span className="font-editorial text-[#ffffff] text-6xl leading-none">
                {initial}
              </span>
            </div>
          )}
          {verified ? (
            <div className="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-[#b8472f] border-[3px] border-[#ffffff] flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-editorial text-3xl text-[#0a0a0a] leading-[1.05] tracking-tight">
              {businessName}
            </h3>
            {studioVerified && <StudioVerifiedBadge size="lg" showLabel />}
          </div>
          {row.location ? (
            <p className="mt-1 text-sm text-[#6b7280]">{row.location}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 rounded-2xl bg-white/55 backdrop-blur-sm border border-white/40 px-3 py-3 divide-x divide-[#e8dfcf]">
        <StatCell
          label="Rating"
          value={ratingAvg != null ? ratingAvg.toFixed(1) : "—"}
          italic
        />
        <StatCell label="Joined" value={memberSinceYear ?? "—"} />
      </div>

    </BrandCardShell>
  );
}

function StatCell({
  label,
  value,
  italic,
}: {
  label: string;
  value: string;
  italic?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-2">
      <span
        className={`text-xl text-[#0a0a0a] tnum ${italic ? "font-editorial" : "font-semibold"}`}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-[#6b7280]">
        {label}
      </span>
    </div>
  );
}
