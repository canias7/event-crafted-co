import { BadgeCheck } from "lucide-react";

// Blue verified check next to a vendor's name when they're on the
// Studio tier. Subscription-tier verification — distinct from the
// document-verification badges (ID / insurance / business license)
// in VerificationBadges.tsx. Renders compact by default; pass a
// larger size where the surface is the vendor's hero profile.
export function StudioVerifiedBadge({
  size = "default",
  showLabel = false,
}: {
  size?: "default" | "lg";
  showLabel?: boolean;
}) {
  const iconClass = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  const pillClass =
    size === "lg"
      ? "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      : "inline-flex items-center justify-center w-5 h-5 rounded-full";

  if (showLabel) {
    return (
      <span
        className={pillClass}
        title="Verified Studio vendor"
        style={{
          background:
            "linear-gradient(135deg, rgba(56,134,255,0.18) 0%, rgba(56,134,255,0.08) 100%)",
          color: "#1d6dde",
          border: "1px solid rgba(56,134,255,0.35)",
        }}
      >
        <BadgeCheck className={iconClass} aria-hidden />
        Verified
      </span>
    );
  }

  return (
    <span
      title="Verified Studio vendor"
      className="inline-flex items-center justify-center"
      style={{ color: "#1d6dde" }}
      aria-label="Verified"
    >
      <BadgeCheck className={iconClass} aria-hidden />
    </span>
  );
}
