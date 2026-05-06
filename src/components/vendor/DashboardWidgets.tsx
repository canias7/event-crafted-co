import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Image as ImageIcon,
  Inbox,
  Lightbulb,
  Sparkles,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Shared decorative widgets for the vendor surfaces — Quick Action
// pills + the Pro Tip card. Extracted from VendorDashboard so the
// Analytics page can wear the same chrome without duplicating the
// styling math.

export const QUICK_ACTION_TINTS: Record<
  "amber" | "violet" | "emerald" | "rose",
  string
> = {
  amber:
    "bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border-amber-500/20",
  violet:
    "bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 border-violet-500/20",
  emerald:
    "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 border-emerald-500/20",
  rose: "bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 border-rose-500/20",
};

export interface QuickActionProps {
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  tint: keyof typeof QUICK_ACTION_TINTS;
  badge?: boolean;
  external?: boolean;
}

export function QuickAction({
  to,
  icon: Icon,
  label,
  hint,
  tint,
  badge,
  external,
}: QuickActionProps) {
  const className = `relative rounded-sm border ${QUICK_ACTION_TINTS[tint]} transition-colors flex items-center gap-3 px-4 py-3`;
  const inner = (
    <>
      <div className="w-9 h-9 rounded-md bg-background/40 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-[11px] opacity-70 truncate">{hint}</p>
      </div>
      {badge && (
        <span className="w-2 h-2 rounded-full bg-current shrink-0" aria-hidden />
      )}
    </>
  );
  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {inner}
    </Link>
  );
}

// Standard 4-tile quick-action row used on Dashboard + Analytics.
// Inbox / Public listing / Calendar / Edit listing — same set, same
// order, so the muscle memory transfers between pages.
export function VendorQuickActionsRow({
  vendorId,
  newRequestsCount,
  inboxLabel,
  inboxHint,
  publicLabel,
  publicHint,
  calendarLabel,
  calendarHint,
  editLabel,
  editHint,
}: {
  vendorId: string | null;
  newRequestsCount: number;
  inboxLabel?: string;
  inboxHint?: string;
  publicLabel?: string;
  publicHint?: string;
  calendarLabel?: string;
  calendarHint?: string;
  editLabel?: string;
  editHint?: string;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <QuickAction
        to="/vendor/inbox"
        icon={Inbox}
        label={
          inboxLabel ??
          (newRequestsCount > 0
            ? `${newRequestsCount} new ${
                newRequestsCount === 1 ? "inquiry" : "inquiries"
              }`
            : "Inbox")
        }
        hint={inboxHint ?? (newRequestsCount > 0 ? "Reply now" : "All caught up")}
        tint="amber"
        badge={newRequestsCount > 0}
      />
      {vendorId && (
        <QuickAction
          to={`/vendors/${vendorId}`}
          icon={Store}
          label={publicLabel ?? "Public listing"}
          hint={publicHint ?? "See what hosts see"}
          tint="violet"
          external
        />
      )}
      <QuickAction
        to="/vendor/appointments"
        icon={CalendarDays}
        label={calendarLabel ?? "Calendar"}
        hint={calendarHint ?? "Manage availability"}
        tint="emerald"
      />
      <QuickAction
        to="/vendor/listing"
        icon={ImageIcon}
        label={editLabel ?? "Edit listing"}
        hint={editHint ?? "Polish your photos"}
        tint="rose"
      />
    </div>
  );
}

export interface ProTip {
  title: string;
  body: string;
  cta?: { label: string; to: string };
}

export function ProTipCard({ tip }: { tip: ProTip }) {
  return (
    <div className="rounded-sm border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent p-4 flex items-start gap-4 flex-wrap">
      <div className="w-9 h-9 rounded-md bg-accent/20 text-accent flex items-center justify-center shrink-0">
        <Lightbulb className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-[240px]">
        <p className="font-label text-accent inline-flex items-center gap-1.5 mb-1">
          <Sparkles className="w-3 h-3" />
          Pro tip
        </p>
        <p className="font-display text-base mb-1">{tip.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {tip.body}
        </p>
      </div>
      {tip.cta && (
        <Link to={tip.cta.to} className="shrink-0">
          <Button
            size="sm"
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {tip.cta.label}
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}
