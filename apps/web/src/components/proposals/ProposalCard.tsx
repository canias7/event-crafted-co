import { useEffect, useState } from "react";
import { Check, X, FileText, Loader2, PenLine, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ProposalLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

export interface SignaturePayload {
  signed_name: string;
  signed_at: string;
  signed_user_agent: string;
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
  signed_at?: string | null;
  signed_name?: string | null;
  first_viewed_at?: string | null;
  last_viewed_at?: string | null;
  view_count?: number;
}

interface Props {
  proposal: Proposal;
  /** When provided (host view), Accept / Decline actions render. */
  canRespond?: boolean;
  acting?: "accept" | "reject" | null;
  /** When the proposal needs a signature, this is called with sig payload. */
  onAccept?: (signature?: SignaturePayload) => void;
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

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ProposalCard({
  proposal,
  canRespond,
  acting,
  onAccept,
  onReject,
}: Props) {
  const [signOpen, setSignOpen] = useState(false);
  const requiresSignature =
    Boolean(proposal.contract_body) || Boolean(proposal.terms);

  // When a host views their own pending proposal, mark it viewed so
  // the vendor can see the open signal. RPC is debounced server-side
  // (60s) so strict-mode double-mount is harmless.
  useEffect(() => {
    if (!canRespond || proposal.status !== "pending") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("mark_proposal_viewed", { p_proposal_id: proposal.id })
      .then(() => {});
  }, [canRespond, proposal.id, proposal.status]);

  function handleAcceptClick() {
    if (!onAccept) return;
    if (requiresSignature) {
      setSignOpen(true);
    } else {
      onAccept();
    }
  }

  function handleSignSubmit(name: string) {
    setSignOpen(false);
    onAccept?.({
      signed_name: name,
      signed_at: new Date().toISOString(),
      signed_user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
  }

  return (
    <div className="rounded-2xl bg-card border border-accent/30 p-6">
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

      {!canRespond && proposal.status === "pending" && (
        <p className="text-xs text-muted-foreground mb-3 inline-flex items-center gap-1.5">
          <Eye className="w-3 h-3" />
          {proposal.first_viewed_at
            ? `Host opened ${formatRelative(proposal.last_viewed_at ?? proposal.first_viewed_at)}${
                (proposal.view_count ?? 0) > 1
                  ? ` · ${proposal.view_count} views`
                  : ""
              }`
            : "Host hasn't opened this yet"}
        </p>
      )}

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

      {/* Signature record — visible to both parties once signed */}
      {proposal.status === "accepted" && proposal.signed_name && (
        <div className="mt-5 pt-5 border-t border-accent/30 bg-accent/[0.04] -mx-6 px-6 -mb-6 pb-5 rounded-b-sm">
          <div className="flex items-center gap-2">
            <PenLine className="w-3.5 h-3.5 text-accent" />
            <p className="font-label text-accent">Signed</p>
          </div>
          <p className="font-display text-xl mt-1 mb-0.5 italic">
            {proposal.signed_name}
          </p>
          <p className="text-xs text-muted-foreground">
            on{" "}
            {proposal.signed_at &&
              new Date(proposal.signed_at).toLocaleString(undefined, {
                dateStyle: "long",
                timeStyle: "short",
              })}
          </p>
        </div>
      )}

      {canRespond && proposal.status === "pending" && (
        <div className="flex gap-2 mt-6 pt-5 border-t border-border">
          <Button
            onClick={handleAcceptClick}
            disabled={acting !== null}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90 flex-1"
          >
            {acting === "accept" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : requiresSignature ? (
              <PenLine className="w-4 h-4 mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            {requiresSignature ? "Sign and accept" : "Accept proposal"}
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

      <div className="mt-3 text-right">
        <a
          href={`/proposals/${proposal.id}/print`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileText className="w-3 h-3" />
          Print / Save as PDF
        </a>
      </div>

      <SignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        proposalTitle={proposal.title}
        onSubmit={handleSignSubmit}
      />
    </div>
  );
}

function SignatureDialog({
  open,
  onOpenChange,
  proposalTitle,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proposalTitle: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !agreed) return;
    onSubmit(name.trim());
    setName("");
    setAgreed(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Sign and accept
          </DialogTitle>
          <DialogDescription>
            Type your full legal name to sign "{proposalTitle}". This is a
            binding electronic signature.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="sig-name">Full legal name</Label>
            <Input
              id="sig-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarah Mitchell"
              autoFocus
              required
              className="font-display text-lg italic"
            />
            <p className="text-xs text-muted-foreground">
              Your typed name + timestamp + device info will be saved as
              the signature record. Both parties keep a copy.
            </p>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded-sm accent-foreground"
            />
            <span className="text-sm leading-snug">
              I agree to the terms and contract above and consent to sign
              electronically (UETA / E-SIGN Act).
            </span>
          </label>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !agreed}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <PenLine className="w-4 h-4 mr-2" />
              Sign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
