import { Wallet, RefreshCcw, ShieldOff } from "lucide-react";

// Cancellation / deposit / reschedule policy badges. Renders nothing
// when no policy fields are set so we don't show empty placeholders.

const POLICY_LABEL: Record<string, { label: string; tone: string }> = {
  flexible: {
    label: "Flexible cancellation",
    tone: "bg-accent/15 text-accent border-accent/30",
  },
  moderate: {
    label: "Moderate cancellation",
    tone: "bg-secondary text-secondary-foreground border-border",
  },
  strict: {
    label: "Strict cancellation",
    tone: "bg-secondary text-muted-foreground border-border",
  },
  non_refundable: {
    label: "Non-refundable",
    tone: "bg-destructive/10 text-destructive/80 border-destructive/30",
  },
};

export function VendorPolicyBadges({
  depositPct,
  cancellationPolicy,
  rescheduleWindowDays,
  policyNotes,
}: {
  depositPct?: number | null;
  cancellationPolicy?: string | null;
  rescheduleWindowDays?: number | null;
  policyNotes?: string | null;
}) {
  const policy = cancellationPolicy
    ? POLICY_LABEL[cancellationPolicy]
    : undefined;
  const has =
    depositPct != null || policy || rescheduleWindowDays != null || policyNotes;
  if (!has) return null;

  return (
    <div className="rounded-sm border border-border bg-card p-4 space-y-2">
      <p className="font-label text-muted-foreground inline-flex items-center gap-1.5 mb-1">
        <ShieldOff className="w-3 h-3" />
        Booking terms
      </p>
      <div className="flex flex-wrap gap-1.5">
        {depositPct != null && (
          <span className="inline-flex items-center gap-1 text-xs border border-border bg-secondary text-foreground rounded-full px-2.5 py-1">
            <Wallet className="w-3 h-3" />
            {depositPct}% deposit to book
          </span>
        )}
        {policy && (
          <span
            className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 ${policy.tone}`}
          >
            {policy.label}
          </span>
        )}
        {rescheduleWindowDays != null && (
          <span className="inline-flex items-center gap-1 text-xs border border-border bg-secondary text-foreground rounded-full px-2.5 py-1">
            <RefreshCcw className="w-3 h-3" />
            Reschedule {rescheduleWindowDays}+ days out
          </span>
        )}
      </div>
      {policyNotes && (
        <p className="text-xs text-muted-foreground leading-relaxed pt-1">
          {policyNotes}
        </p>
      )}
    </div>
  );
}
