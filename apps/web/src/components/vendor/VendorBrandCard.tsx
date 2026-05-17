// Cream-Ocean brand identity card for the public vendor detail page.
// Visual shell (gradient, ripples, border, flip) is shared with the
// account profile header via BrandCardShell — change colors / shadows
// / ripple count there once and both surfaces update together.

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandCardShell } from "@/components/vendor/BrandCardShell";

// Listing-level fields (location, verified_at, created_at) come from
// vendor_profiles. Brand identity (business_name, logo_url, bio) is
// read STRAIGHT from the owner's profiles row — account-level source
// of truth, bypasses any sync-trigger lag.
interface VendorRow {
  location: string | null;
  verified_at: string | null;
  created_at: string | null;
  user_id: string | null;
}
interface AccountRow {
  business_name: string | null;
  logo_url: string | null;
  bio: string | null;
}

export function VendorBrandCard({ vendorId }: { vendorId: string }) {
  const [row, setRow] = useState<VendorRow | null>(null);
  const [account, setAccount] = useState<AccountRow | null>(null);
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
          .select("location, verified_at, created_at, user_id")
          .eq("id", vendorId)
          .maybeSingle(),
        supabase
          .from("reviews")
          .select("rating")
          .eq("vendor_id", vendorId),
      ]);
      if (cancelled) return;
      const listing = (vp.data as VendorRow | null) ?? null;
      setRow(listing);
      const ratings = (rev.data as Array<{ rating: number }> | null) ?? [];
      setRatingAvg(
        ratings.length === 0
          ? null
          : ratings.reduce((s, r) => s + r.rating, 0) / ratings.length,
      );

      // Brand identity read straight from the owner's profile so
      // business_name + logo + bio always reflect what the vendor
      // last saved on /vendor/edit-profile.
      if (listing?.user_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: acc } = await (supabase as any)
          .from("profiles")
          .select("business_name, logo_url, bio")
          .eq("id", listing.user_id)
          .maybeSingle();
        if (cancelled) return;
        setAccount((acc as AccountRow | null) ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (!row) return null;

  const businessName = account?.business_name ?? "Vendor";
  const initial = businessName[0]?.toUpperCase() ?? "V";
  const memberSinceYear = row.created_at
    ? String(new Date(row.created_at).getFullYear())
    : null;
  const verified = !!row.verified_at;
  const logoUrl = account?.logo_url ?? null;

  return (
    <BrandCardShell businessName={businessName} bio={account?.bio ?? null}>
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
          <h3 className="font-editorial text-3xl text-[#0a0a0a] leading-[1.05] tracking-tight">
            {businessName}
          </h3>
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
