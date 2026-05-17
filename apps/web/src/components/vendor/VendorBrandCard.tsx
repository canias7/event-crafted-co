// Cream-Ocean brand identity card for the public vendor detail page.
// Front: peach gradient + radial sun + italic-serif business name +
// avatar + stat strip. Back: the listing's about/bio in big editorial
// italic. Flip is triggered by the "Bio" pill in the top-left.

import { useEffect, useState } from "react";
import { CheckCircle2, Info, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

// Listing-level fields (location, verified_at, created_at) come from
// vendor_profiles. Brand identity (business_name, logo_url, bio) is
// read STRAIGHT from the owner's profiles row — that's the account-
// level source of truth and bypasses any sync-trigger lag.
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
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      // Bookings stat removed — Vendora is intro / matchmaking only,
      // the actual booking happens outside the app, so a "Bookings"
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

      // Brand identity read straight from the owner's profile —
      // business_name + logo + bio always reflect what the vendor
      // last saved on /vendor/edit-profile, regardless of whether
      // the listing row's mirrored copy has updated yet.
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
  const bio = account?.bio?.trim() ?? null;
  const logoUrl = account?.logo_url ?? null;

  return (
    <div className="relative" style={{ perspective: 1400 }}>
      {/* Flip toggle — always visible regardless of which face is showing */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show profile front" : "Show bio on back"}
        className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-foreground/80 hover:text-foreground transition-colors"
        style={{
          background: "rgba(255,255,255,0.7)",
          border: "0.5px solid rgba(255,138,76,0.28)",
          backdropFilter: "blur(8px)",
        }}
      >
        {flipped ? (
          <>
            <RotateCcw className="h-3 w-3" />
            Back
          </>
        ) : (
          <>
            <Info className="h-3 w-3" />
            Bio
          </>
        )}
      </button>

      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* FRONT — sets the card's natural height */}
        <div
          className="relative overflow-hidden rounded-3xl border border-[#e8dfcf] shadow-[0_8px_24px_-12px_rgba(26,20,16,0.18)] bg-[linear-gradient(135deg,#ffffff_0%,#f3f4f6_100%)] px-6 py-7 sm:px-8 sm:py-8"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(circle at 18% 22%, rgba(255,230,180,0.55), transparent 55%)",
            }}
          />
          {[32, 48, 62, 76].map((top, i) => (
            <div
              key={top}
              className="pointer-events-none absolute inset-x-0"
              aria-hidden
              style={{
                top: `${top}%`,
                height: "1.5px",
                background: `linear-gradient(90deg, rgba(168,137,63,0) 0%, rgba(255,240,200,${0.55 - i * 0.05}) 50%, rgba(168,137,63,0) 100%)`,
              }}
            />
          ))}

          <div className="relative flex items-center gap-5 pl-14 sm:pl-16">
            <div className="relative shrink-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={businessName}
                  className="w-[110px] h-[110px] rounded-[20px] object-cover bg-[#0a0a0a]"
                  style={{
                    boxShadow: "0 6px 18px -6px rgba(26,20,16,0.3)",
                  }}
                />
              ) : (
                <div
                  className="w-[110px] h-[110px] rounded-[20px] bg-[#0a0a0a] flex items-center justify-center"
                  style={{
                    boxShadow: "0 6px 18px -6px rgba(26,20,16,0.3)",
                  }}
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

          <div className="relative mt-6 grid grid-cols-2 rounded-2xl bg-white/55 backdrop-blur-sm border border-white/40 px-3 py-3 divide-x divide-[#e8dfcf]">
            <StatCell
              label="Rating"
              value={ratingAvg != null ? ratingAvg.toFixed(1) : "—"}
              italic
            />
            <StatCell label="Joined" value={memberSinceYear ?? "—"} />
          </div>
        </div>

        {/* BACK — bio. Absolutely positioned over the front so the
            card height stays anchored to the front's natural layout. */}
        <div
          className="absolute inset-0 rounded-3xl border border-[#e8dfcf] shadow-[0_8px_24px_-12px_rgba(26,20,16,0.18)] p-6 sm:p-8 flex flex-col bg-[linear-gradient(135deg,#fff5e8_0%,#f6e3d2_100%)]"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            overflow: "hidden",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(circle at 80% 20%, rgba(255,138,76,0.18), transparent 60%)",
            }}
          />
          <p className="relative font-label text-[10px] uppercase tracking-[0.22em] text-muted-foreground mt-2 pl-14 sm:pl-16">
            About {businessName}
          </p>
          <div className="relative flex-1 mt-3 overflow-y-auto pr-2">
            {bio ? (
              <p className="font-editorial italic text-foreground/85 text-[17px] sm:text-[19px] leading-[1.5] whitespace-pre-line">
                {bio}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No bio yet for {businessName}.
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
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
