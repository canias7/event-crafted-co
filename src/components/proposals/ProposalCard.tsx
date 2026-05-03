import { Check, X, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ProposalLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

export interface Proposal {
  id: string;
  title: string;
  line_items: ProposalLineItem[];
  subtotal_cents: number;
  deposit_cents: number | null;
  terms: string | null;
  contract_body: string | null;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  sent_at: string | null;
}

interface Props {
  proposal: Proposal;
  /** When provided (host view), Accept / Decline actions render. */
  canRespond?: boolean;
  acting?: "accept" | "reject" | null;
  onAccept?: () => void;
  onReject?: () => void;
}

const statusStyles: Record<Proposal["status"], string> = {
  pending: "bg-accent/15 text-accent border-accent/30",
  accepted: "bg-accent text-accent-foreground border-accent",
  rejected: "bg-muted text-muted-foreground border-border",
  withdrawn: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<Proposal["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Declined",
  withdrawn: "Withdrawn",
};

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

export function ProposalCard({
  proposal,
  canRespond,
  acting,
  onAccept,
  onReject,
}: Props) {
  return (
    <div className="bg-card border border-accent/30 rounded-sm p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <p className="font-label text-accent">Proposal</p>
            <h3 className="font-display text-lg leading-tight">
              {proposal.title}
            </h3>
          </div>
        </div>
        <Badge variant="outline" className={statusStyles[proposal.status]}>
          {statusLabel[proposal.status]}
        </Badge>
      </div>

      <div className="space-y-2 mb-5">
        {proposal.line_items.map((item, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between gap-4 py-2 border-b border-border/50 last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm">{item.description}</p>
              {item.quantity > 1 && (
                <p className="text-xs text-muted-foreground tnum">
                  {item.quantity} × {fmt(item.unit_price_cents)}
                </p>
              )}
            </div>
            <p className="text-sm tnum font-medium whitespace-nowrap">
              {fmt(item.amount_cents)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-baseline justify-between pt-3 border-t border-border">
        <p className="font-label text-muted-foreground">Subtotal</p>
        <p className="font-display text-xl tnum">
          {fmt(proposal.subtotal_cents)}
        </p>
      </div>

      {proposal.deposit_cents != null && (
        <div className="flex items-baseline justify-between pt-2 text-sm">
          <p className="text-muted-foreground">Deposit due on signing</p>
          <p className="tnum font-medium">{fmt(proposal.deposit_cents)}</p>
        </div>
      )}

      {proposal.terms && (
        <div className="mt-5 pt-5 border-t border-border">
          <p className="font-label text-muted-foreground mb-2">Terms</p>
          <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {proposal.terms}
          </p>
        </div>
      )}

      {proposal.contract_body && (
        <details className="mt-5 pt-5 border-t border-border group">
          <summary className="font-label text-muted-foreground cursor-pointer hover:text-foreground select-none flex items-center gap-2">
            <span>Contract</span>
            <span className="text-xs opacity-60 group-open:hidden">
              · click to view
            </span>
          </summary>
          <div className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap mt-3 max-h-72 overflow-y-auto pr-2">
            {proposal.contract_body}
          </div>
        </details>
      )}

      {canRespond && proposal.status === "pending" && (
        <div className="flex gap-2 mt-6 pt-5 border-t border-border">
          <Button
            onClick={onAccept}
            disabled={acting !== null}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90 flex-1"
          >
            {acting === "accept" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Accept proposal
          </Button>
          <Button
            onClick={onReject}
            disabled={acting !== null}
            variant="outline"
            className="rounded-full"
          >
            {acting === "reject" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <X className="w-4 h-4 mr-2" />
            )}
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
