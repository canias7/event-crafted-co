import { ShieldCheck, FileBadge2, Briefcase, UserCheck } from "lucide-react";

// Compact verification badge cluster for the vendor public profile.
// Reads the public-safe `vendor_public_badges` view (kinds only —
// no document, no expiry, no notes).

const KIND_META: Record<
  string,
  { label: string; full: string; Icon: typeof ShieldCheck }
> = {
  identity: {
    label: "ID",
    full: "Identity verified",
    Icon: ShieldCheck,
  },
  insurance: {
    label: "Insured",
    full: "Liability insurance verified",
    Icon: FileBadge2,
  },
  business_license: {
    label: "Licensed",
    full: "Business license verified",
    Icon: Briefcase,
  },
  background_check: {
    label: "Bg-checked",
    full: "Background check verified",
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
  if (!kinds || kinds.length === 0) return null;
  const compact = size === "compact";
  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-wrap items-center gap-1.5"}>
      {kinds.map((k) => {
        const m = KIND_META[k];
        if (!m) return null;
        const Icon = m.Icon;
        if (compact) {
          return (
            <span
              key={k}
              title={m.full}
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
            title={m.full}
          >
            <Icon className="w-3 h-3" />
            {m.label}
          </span>
        );
      })}
    </div>
  );
}
