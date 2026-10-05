import { ShieldCheck, FileBadge2, Briefcase, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

// Compact verification badge cluster for the vendor public profile.
// Reads the public-safe `vendor_public_badges` view (kinds only —
// no document, no expiry, no notes).

// Each kind's short label and full description live in
// locales/<language>/vendorProfile.json under badges.<kind>.
const KIND_META: Record<string, { Icon: typeof ShieldCheck }> = {
  identity: {
    Icon: ShieldCheck,
  },
  insurance: {
    Icon: FileBadge2,
  },
  business_license: {
    Icon: Briefcase,
  },
  background_check: {
    Icon: UserCheck,
  },
};

export function VerificationBadges({
  kinds,
  size = "default",
}: {
  kinds: string[] | null | undefined;
  size?: "default" | "compact";
}) {
  const { t } = useTranslation("vendorProfile");
  if (!kinds || kinds.length === 0) return null;
  const compact = size === "compact";
  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-wrap items-center gap-1.5"}>
      {kinds.map((k) => {
        const m = KIND_META[k];
        if (!m) return null;
        const Icon = m.Icon;
        const label = t(`badges.${k}.label`);
        const full = t(`badges.${k}.full`);
        if (compact) {
          return (
            <span
              key={k}
              title={full}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/15 text-accent"
            >
              <Icon className="w-3 h-3" />
            </span>
          );
        }
        return (
          <span
            key={k}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 bg-accent/10 text-accent border border-accent/30"
            title={full}
          >
            <Icon className="w-3 h-3" />
            {label}
          </span>
        );
      })}
    </div>
  );
}
